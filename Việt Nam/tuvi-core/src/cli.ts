#!/usr/bin/env node
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { computeNatal } from './natal';
import { normalizeBirth } from './normalize';
import { getProfile, PROFILE_EVIDENCE, PROFILES, validateProfile } from './profiles';
import type { BirthInput, ChartReady, Profile } from './types';

type Flags = { input?: string; output?: string; profile?: string; 'profile-file'?: string; kind?: string; 'boundary-minutes'?: string };
const help = `tuvi-core — lập lá số bằng code, không gọi LLM

  tuvi profiles
  tuvi chart --input examples/chart-ready.json --profile repro-v4
  tuvi chart --input examples/birth.json --profile thienky-candidate
  tuvi batch --input examples/batch.jsonl --output results.jsonl --profile repro-v4

--input - đọc từ stdin. --output ghi UTF-8; mặc định JSON ra stdout.
--kind chart-ready|birth (tự nhận dạng chỉ bằng field hourBranch hoặc calendar).
--profile-file profile.json dùng cấu hình đầy đủ thay preset.
--boundary-minutes 2 là mặc định; nhập 0 để tắt cờ gần ranh giờ.
Lệnh chart trả exit 2 khi cần làm rõ; input sai trả exit 1.
Batch luôn trả một envelope mỗi dòng và exit 1 nếu có lỗi, exit 2 nếu chỉ có needs.
`;

function parseFlags(args: string[]): Flags {
  const flags: Record<string, string> = {};
  const supported = ['input', 'output', 'profile', 'profile-file', 'kind', 'boundary-minutes'];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (!args[i]?.startsWith('--') || !supported.includes(key) || value === undefined || value.startsWith('--')) {
      throw new TypeError(`Tham số không hợp lệ: ${args[i] ?? ''}`);
    }
    if (Object.hasOwn(flags, key)) throw new TypeError(`Tham số lặp: --${key}`);
    flags[key] = value;
  }
  if (flags.profile && flags['profile-file']) throw new TypeError('Chỉ chọn --profile hoặc --profile-file.');
  if (flags.kind && !['birth', 'chart-ready'].includes(flags.kind)) throw new TypeError('--kind là birth hoặc chart-ready.');
  return flags;
}

function parseJson(text: string): unknown {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}
function classify(input: unknown, explicitKind?: string): 'birth' | 'chart-ready' {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input phải là JSON object.');
  if (explicitKind) return explicitKind as 'birth' | 'chart-ready';
  const birth = 'calendar' in input;
  const ready = 'hourBranch' in input;
  if (birth === ready) throw new TypeError('Không xác định được input: cần calendar hoặc hourBranch, không được có cả hai.');
  return birth ? 'birth' : 'chart-ready';
}

function processInput(input: unknown, profile: Profile, flags: Flags) {
  if (classify(input, flags.kind) === 'chart-ready') {
    return { status: 'ok' as const, ...computeNatal(input as ChartReady, profile) };
  }
  const boundaryMinutes = flags['boundary-minutes'] === undefined ? 2 : Number(flags['boundary-minutes']);
  if (!Number.isFinite(boundaryMinutes) || boundaryMinutes < 0 || boundaryMinutes > 30) {
    throw new RangeError('--boundary-minutes phải từ 0 đến 30.');
  }
  const normalized = normalizeBirth(input as BirthInput, profile, { boundaryMinutes });
  if (normalized.status === 'needs') return { schemaVersion: 'tuvi.normalization.v0', profile, ...normalized };
  return {
    status: 'ok' as const, ...computeNatal(normalized.chart, profile),
    normalization: { chart: normalized.chart, audit: normalized.audit, warnings: normalized.warnings },
  };
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') { process.stdout.write(help); return; }
  if (command === 'profiles') {
    if (rest.length) throw new TypeError('profiles không nhận tham số.');
    process.stdout.write(`${JSON.stringify({ profiles: PROFILES, evidence: PROFILE_EVIDENCE }, null, 2)}\n`);
    return;
  }
  if (!['chart', 'batch'].includes(command)) throw new TypeError(`Không có lệnh '${command}'. Dùng --help.`);
  const flags = parseFlags(rest);
  if (!flags.input) throw new TypeError('Cần --input đường-dẫn hoặc --input -.');
  if (flags.output && flags.input !== '-') {
    const inputPath = existsSync(flags.input) ? realpathSync(flags.input) : resolve(flags.input);
    const outputPath = existsSync(flags.output) ? realpathSync(flags.output) : resolve(flags.output);
    const samePath = process.platform === 'win32' ? inputPath.toLowerCase() === outputPath.toLowerCase() : inputPath === outputPath;
    const sameFile = existsSync(flags.input) && existsSync(flags.output)
      && statSync(flags.input).dev === statSync(flags.output).dev && statSync(flags.input).ino === statSync(flags.output).ino;
    if (samePath || sameFile) throw new TypeError('Output phải khác input để giữ nguyên dữ liệu nguồn.');
  }
  if (!flags.profile && !flags['profile-file']) throw new TypeError('Cần chọn --profile hoặc --profile-file tường minh.');
  const profile = flags['profile-file'] ? parseJson(await readFile(flags['profile-file'], 'utf8')) : getProfile(flags.profile!);
  validateProfile(profile);
  if (command === 'chart') {
    let content = '';
    if (flags.input === '-') { process.stdin.setEncoding('utf8'); for await (const chunk of process.stdin) content += chunk; }
    else content = await readFile(flags.input, 'utf8');
    const result = processInput(parseJson(content), profile, flags);
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (flags.output) await writeFile(flags.output, json, 'utf8');
    else process.stdout.write(json);
    if (result.status === 'needs') process.exitCode = 2;
    return;
  }

  // Streaming reads and writes keep memory bounded for training-data generation.
  const source = flags.input === '-' ? process.stdin : createReadStream(flags.input, { encoding: 'utf8' });
  const lines = createInterface({ input: source, crlfDelay: Infinity });
  const output = flags.output ? await import('node:fs/promises').then(fs => fs.open(flags.output!, 'w')) : undefined;
  let lineNumber = 0;
  let hasErrors = false;
  let hasNeeds = false;
  try {
    for await (const line of lines) {
      lineNumber++;
      let envelope: unknown;
      try {
        if (!line.trim()) throw new TypeError('Dòng JSONL trống.');
        const result = processInput(parseJson(line), profile, flags);
        if (result.status === 'needs') hasNeeds = true;
        envelope = { line: lineNumber, ...result };
      } catch (error) {
        hasErrors = true;
        envelope = { line: lineNumber, status: 'error', error: { code: 'INVALID_INPUT', message: error instanceof Error ? error.message : String(error) } };
      }
      const text = `${JSON.stringify(envelope)}\n`;
      if (output) await output.writeFile(text, 'utf8');
      else if (!process.stdout.write(text)) await new Promise<void>(resolve => process.stdout.once('drain', resolve));
    }
  } finally { await output?.close(); }
  process.exitCode = hasErrors ? 1 : hasNeeds ? 2 : 0;
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'error', error: { code: 'INVALID_INPUT', message: error instanceof Error ? error.message : String(error) } })}\n`);
  process.exitCode = 1;
});
