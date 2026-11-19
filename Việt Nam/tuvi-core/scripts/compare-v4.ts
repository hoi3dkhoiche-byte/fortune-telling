/** Streaming structural comparison with the published v4 dataset; no interpretation text is retained. */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { Transform } from 'node:stream';
import * as zlib from 'node:zlib';
import { computeNatal } from '../src/natal';
import { getProfile } from '../src/profiles';
import type { ChartReady, NatalChart, Profile } from '../src/types';
import { resolveEffectiveLunarDate } from '../vendor/ziwei/algorithm';

export interface V4Record {
  k: string;
  y: number;
  m: number;
  d: number;
  h: number;
  g: 'male' | 'female';
  ms: string | null;
}

const majorNames = new Set(['紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府', '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军']);

/** Validate the actual release schema, including key/field agreement. Extra t/c fields are ignored. */
export function parseV4Record(value: unknown, line = 1): V4Record {
  const fail = (reason: string): never => { throw new TypeError(`Invalid v4 record at line ${line}: ${reason}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
  const r = value as Record<string, unknown>;
  for (const field of ['y', 'm', 'd', 'h']) {
    if (!Number.isInteger(r[field])) fail(`${field} must be an integer`);
  }
  const { y, m, d, h } = r as unknown as V4Record;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) fail('invalid Gregorian date');
  if (h < 0 || h > 11) fail('h must be a branch index 0..11');
  if (r.g !== 'male' && r.g !== 'female') fail('invalid gender');
  if (r.ms !== null && (typeof r.ms !== 'string' || !majorNames.has(r.ms))) fail('ms must be a known major-star name or null');
  const expectedKey = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${h}-${r.g}`;
  if (r.k !== expectedKey) fail('key does not match date/hour/gender fields');
  return { k: expectedKey, y, m, d, h, g: r.g as V4Record['g'], ms: r.ms as string | null };
}

/** Stream either plain JSONL or zstd with the release's long window (27). */
export async function* readV4Records(path: string): AsyncGenerator<V4Record> {
  const file = createReadStream(path);
  let stream: NodeJS.ReadableStream & AsyncIterable<Buffer> = file;
  if (path.toLowerCase().endsWith('.zst')) {
    const nativeZstd = zlib as unknown as {
      createZstdDecompress?: (options: { params: Record<number, number> }) => Transform;
      constants: Record<string, number>;
    };
    if (!nativeZstd.createZstdDecompress) {
      file.destroy();
      throw new Error('Native zstd is unavailable. Use the pinned Node 24 runtime or a decompressed .jsonl input.');
    }
    const decoder = nativeZstd.createZstdDecompress({ params: { [nativeZstd.constants.ZSTD_d_windowLogMax]: 27 } });
    file.on('error', error => decoder.destroy(error));
    stream = file.pipe(decoder);
  }
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let lineNumber = 0;
  const parse = (text: string): V4Record => {
    lineNumber++;
    const line = lineNumber === 1 ? text.replace(/^\uFEFF/, '') : text;
    try { return parseV4Record(JSON.parse(line), lineNumber); }
    catch (error) {
      if (error instanceof SyntaxError) throw new SyntaxError(`Invalid JSON at line ${lineNumber}`);
      throw error;
    }
  };
  try {
    for await (const chunk of stream) {
      pending += decoder.write(chunk);
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, '');
        pending = pending.slice(newline + 1);
        if (line.length === 0) throw new SyntaxError(`Empty JSONL record at line ${lineNumber + 1}`);
        yield parse(line);
      }
      if (pending.length > 4 * 1024 * 1024) throw new RangeError(`JSONL line ${lineNumber + 1} exceeds the 4 MiB safety limit`);
    }
    pending += decoder.end();
    if (pending.length) yield parse(pending.replace(/\r$/, ''));
  } finally {
    file.destroy();
    if ('destroy' in stream && typeof stream.destroy === 'function') stream.destroy();
  }
}

/** ms is only the first major star in Mệnh, not the entire chart or a prose judgment. */
export function firstMajorInMing(natal: Pick<NatalChart, 'mingGongBranch' | 'palaces'>): string | null {
  const palace = natal.palaces.find(p => p.branch === natal.mingGongBranch);
  if (!palace) throw new Error('Engine did not return its Mệnh palace');
  return palace.stars.find(star => star.type === 'major')?.name ?? null;
}

interface Counts { evaluated: number; matched: number; mismatched: number }
const counts = (): Counts => ({ evaluated: 0, matched: 0, mismatched: 0 });
const bump = (target: Counts, matches: boolean): void => {
  target.evaluated++;
  target[matches ? 'matched' : 'mismatched']++;
};

interface Mismatch { key: string; expected: string | null; actual: string | null; rawLunarMonth: number; rawLunarDay: number }
interface ProfileReport extends Counts {
  profile: Profile;
  groups: { leapMonth: Counts; nonLeapMonth: Counts; lunarYearBoundary: Counts; hourBranchZi: Counts };
  emptyMingMatched: number;
  mismatchExamples: Mismatch[];
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export interface CompareOptions {
  input: string;
  profileIds?: string[];
  checksums?: string;
  maxRecords?: number;
  expectedYear?: number;
  onProgress?: (rows: number) => void;
}

export async function compareV4(options: CompareOptions) {
  const path = resolve(options.input);
  const checksumPath = options.checksums ?? resolve(dirname(path), 'SHA256SUMS.txt');
  const digest = await fileSha256(path);
  let expectedChecksum: string | null = null;
  if (existsSync(checksumPath)) {
    for (const line of readFileSync(checksumPath, 'utf8').split(/\r?\n/)) {
      const match = /^([a-f\d]{64})\s+\*?(.+)$/.exec(line.trim());
      if (match && match[2] === basename(path)) expectedChecksum = match[1].toLowerCase();
    }
    if (!expectedChecksum) throw new Error(`Checksum list does not include ${basename(path)}`);
    if (expectedChecksum !== digest) throw new Error(`SHA-256 mismatch for ${basename(path)}`);
  }
  if (options.maxRecords !== undefined && (!Number.isInteger(options.maxRecords) || options.maxRecords <= 0)) {
    throw new RangeError('maxRecords must be a positive integer');
  }
  const profileReports: ProfileReport[] = (options.profileIds ?? ['repro-v4', 'thienky-candidate']).map(id => ({
    profile: getProfile(id), ...counts(),
    groups: { leapMonth: counts(), nonLeapMonth: counts(), lunarYearBoundary: counts(), hourBranchZi: counts() },
    emptyMingMatched: 0, mismatchExamples: [],
  }));
  if (profileReports.length === 0 || new Set(profileReports.map(p => p.profile.id)).size !== profileReports.length) {
    throw new RangeError('Specify one or more unique profile IDs');
  }

  const keys = new Set<string>();
  const years = new Set<number>();
  let firstKey: string | null = null;
  let lastKey: string | null = null;
  let rows = 0;
  let truncated = false;
  let engineProvenance: ReturnType<typeof computeNatal>['provenance'] | null = null;
  for await (const row of readV4Records(path)) {
    if (options.maxRecords !== undefined && rows >= options.maxRecords) { truncated = true; break; }
    if (options.expectedYear !== undefined && row.y !== options.expectedYear) throw new Error(`Unexpected year in ${row.k}`);
    if (keys.has(row.k)) throw new Error(`Duplicate dataset key ${row.k}`);
    keys.add(row.k);
    years.add(row.y);
    firstKey ??= row.k;
    lastKey = row.k;
    rows++;
    const raw = resolveEffectiveLunarDate(row.y, row.m, row.d, 'origin-month');
    const chartReady: ChartReady = { year: row.y, month: row.m, day: row.d, hourBranch: row.h, gender: row.g };
    for (const report of profileReports) {
      const { natal, provenance } = computeNatal(chartReady, report.profile, { includeFacts: false });
      engineProvenance ??= provenance;
      const actual = firstMajorInMing(natal);
      const matches = actual === row.ms;
      bump(report, matches);
      bump(raw.rawLunarMonth < 0 ? report.groups.leapMonth : report.groups.nonLeapMonth, matches);
      if (Math.abs(raw.rawLunarMonth) === 12 || (raw.rawLunarMonth === 1 && raw.rawLunarDay <= 3)) bump(report.groups.lunarYearBoundary, matches);
      if (row.h === 0) bump(report.groups.hourBranchZi, matches);
      if (matches && row.ms === null) report.emptyMingMatched++;
      if (!matches && report.mismatchExamples.length < 25) {
        report.mismatchExamples.push({ key: row.k, expected: row.ms, actual, rawLunarMonth: raw.rawLunarMonth, rawLunarDay: raw.rawLunarDay });
      }
    }
    if (rows % 1000 === 0) options.onProgress?.(rows);
  }
  if (rows === 0) throw new Error('Dataset input contains no records');
  const yearList = [...years].sort((a, b) => a - b);
  const expectedRows = yearList.reduce((sum, y) => {
    const days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86_400_000;
    return sum + days * 12 * 2;
  }, 0);
  return {
    schemaVersion: 'dataset-comparison.v1',
    engine: engineProvenance,
    source: { file: basename(path), sha256: digest, expectedChecksum, checksumVerified: expectedChecksum === digest, releaseTag: 'v4.0-13d' },
    coverage: { rows, uniqueKeys: keys.size, years: yearList, expectedRowsForWholeYears: expectedRows, completeWholeYears: !truncated && rows === expectedRows, truncated, firstKey, lastKey },
    comparison: 'exact equality of dataset ms and the first major star in the natal Mệnh palace; null means no major star',
    profiles: profileReports,
    limitations: [
      'This compares one structural field, not every palace/star/brightness/transformation or interpretation.',
      'Branch-index input contains no clock time; h=0 cannot distinguish 00:xx from 23:xx or identify the late-Zi day rule.',
      'ms contains no brightness value, so this check cannot identify the source brightness school.',
      'A match reproduces published upstream data; it is not an independent correctness certification.',
      'lunarYearBoundary group is raw lunar month 12 plus the first three days of month 1; groups can overlap.',
    ],
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!['--input', '--output', '--profiles', '--checksums', '--max-records', '--year'].includes(name) || !args[i + 1]) {
      throw new TypeError('Usage: compare-v4 --input data/year-1990.jsonl.zst [--output reports/v4-1990.json] [--profiles repro-v4,thienky-candidate] [--checksums file] [--year 1990] [--max-records N]');
    }
    if (values.has(name)) throw new TypeError(`Duplicate option ${name}`);
    values.set(name, args[i + 1]);
  }
  const report = await compareV4({
    input: values.get('--input') ?? 'data/year-1990.jsonl.zst',
    profileIds: values.get('--profiles')?.split(','),
    checksums: values.get('--checksums'),
    maxRecords: values.has('--max-records') ? Number(values.get('--max-records')) : undefined,
    expectedYear: values.has('--year') ? Number(values.get('--year')) : undefined,
    onProgress: rows => process.stderr.write(`Compared ${rows} records\n`),
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = values.get('--output');
  if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, json, 'utf8'); }
  else process.stdout.write(json);
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
