/** A small execution probe, not the production civil-time/calendar adapter. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateChart,
  setBrightnessSchool,
  type LunarMonthPolicy,
} from '../China/ziwei-doushu-main/ziwei-doushu-main/lib/ziwei/algorithm';
import type { BrightnessSchool } from '../China/ziwei-doushu-main/ziwei-doushu-main/lib/ziwei/school-data';

const upstream = resolve(__dirname, '../China/ziwei-doushu-main/ziwei-doushu-main');
const inputPath = resolve(process.argv[2] ?? resolve(__dirname, 'input.example.json'));
const outputPath = process.argv[3] ? resolve(process.argv[3]) : undefined;

function run() {
  const input: unknown = JSON.parse(readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''));
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  const fields = input as Record<string, unknown>;
  const allowed = ['year', 'month', 'day', 'hourBranch', 'gender', 'brightnessSchool', 'leapMonthPolicy'];
  if (Object.keys(fields).some(key => !allowed.includes(key))) {
    throw new TypeError('Unexpected input field. This probe accepts chart-ready dates and hourBranch only.');
  }
  for (const key of ['year', 'month', 'day', 'hourBranch']) {
    if (!Number.isInteger(fields[key])) throw new TypeError(`${key} must be an integer.`);
  }
  if (fields.gender !== 'male' && fields.gender !== 'female') {
    throw new TypeError('gender must be male or female.');
  }
  const brightness = fields.brightnessSchool as BrightnessSchool;
  const leapMonthPolicy = fields.leapMonthPolicy as LunarMonthPolicy;
  if (!['QS', 'XD1', 'ZZ', 'XD2'].includes(brightness)) {
    throw new TypeError('Specify brightnessSchool: QS, XD1, ZZ or XD2.');
  }
  if (!['split', 'next-month', 'prev-month', 'origin-month'].includes(leapMonthPolicy)) {
    throw new TypeError('Specify a supported leapMonthPolicy.');
  }

  // No async work between setting the upstream global and generating a chart.
  setBrightnessSchool(brightness);
  let chart;
  try {
    chart = generateChart({
      year: fields.year as number,
      month: fields.month as number,
      day: fields.day as number,
      hour: fields.hourBranch as number,
      gender: fields.gender,
    }, { leapMonth: leapMonthPolicy });
  } finally {
    setBrightnessSchool('default');
  }

  // Keep natal data separate from upstream fields that depend on the run date.
  const { currentAge, currentDaXianIndex, ...rest } = chart;
  const natal = {
    ...rest,
    palaces: chart.palaces
      .map(({ isCurrentDaXian, ...palace }) => palace)
      .sort((a, b) => a.branch - b.branch),
  };
  const sourceFiles = [
    'lib/ziwei/algorithm.ts', 'lib/ziwei/types.ts', 'lib/ziwei/constants.ts',
    'lib/ziwei/school-config.ts', 'lib/ziwei/school-data.ts',
    'lib/ziwei/school-tables.generated.ts', 'package-lock.json',
  ];
  const sourceHash = createHash('sha256');
  for (const file of sourceFiles) {
    sourceHash.update(file).update('\0').update(readFileSync(resolve(upstream, file))).update('\0');
  }
  const lock = JSON.parse(readFileSync(resolve(upstream, 'package-lock.json'), 'utf8'));
  const result = {
    schemaVersion: 'engine-probe.v0',
    provenance: {
      repository: 'https://github.com/Renhuai123/ziwei-doushu',
      localSourceSha256: sourceHash.digest('hex'),
      iztro: lock.packages['node_modules/iztro'].version,
      lunarJavascript: lock.packages['node_modules/lunar-javascript'].version,
    },
    conventions: {
      calendar: 'upstream-chinese-lunar-not-yet-validated-for-vietnam',
      date: 'chart-ready-gregorian-date-no-clock-or-late-zi-conversion',
      hour: 'earthly-branch-index-0-to-11',
      brightnessSchool: brightness,
      leapMonthPolicy,
      scope: 'natal-chart-and-decadal-ranges-only',
    },
    natal,
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, json, 'utf8');
  else process.stdout.write(json);
  process.stderr.write(`OK: ${natal.palaces.length} palaces; natal chart generated without an LLM.\n`);
}

try { run(); }
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
