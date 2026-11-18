const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync, unlinkSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const loader = resolve(__dirname, '../China/ziwei-doushu-main/ziwei-doushu-main/node_modules/tsx/dist/loader.mjs');
const probe = join(__dirname, 'probe.ts');
const example = JSON.parse(readFileSync(join(__dirname, 'input.example.json'), 'utf8'));
const fixture = join(__dirname, `.verify-${process.pid}.json`);
const args = ['--import', pathToFileURL(loader).href, probe, fixture];
let assertions = 0;

function generate(input) {
  writeFileSync(fixture, JSON.stringify(input), 'utf8');
  return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }));
}
function reject(input, message) {
  writeFileSync(fixture, JSON.stringify(input), 'utf8');
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, message);
  assertions++;
}

try {
  const first = generate(example);
  const repeated = generate(example);
  assert.deepEqual(first, repeated, 'Repeated input must produce the same natal JSON.');
  assert.equal(first.natal.palaces.length, 12);
  assert.equal(new Set(first.natal.palaces.map(p => p.branch)).size, 12);
  assert.deepEqual(first.natal.palaces.map(p => p.branch), Array.from({ length: 12 }, (_, i) => i));
  assert.equal(first.natal.palaces.flatMap(p => p.stars).filter(s => s.type === 'major').length, 14);
  assert.ok(!('currentAge' in first.natal));
  assert.ok(!('currentDaXianIndex' in first.natal));
  assert.ok(first.natal.palaces.every(p => !('isCurrentDaXian' in p)));
  assert.equal(first.natal.birthInfo.hour, example.hourBranch);
  assert.equal(first.conventions.brightnessSchool, 'QS');
  assert.match(first.provenance.localSourceSha256, /^[a-f0-9]{64}$/);
  assertions++;

  reject({ ...example, month: 2, day: 30 }, /solar date does not exist/);
  reject({ ...example, hourBranch: 12 }, /branch index from 0 to 11/);
  reject({ ...example, hourBranch: '6' }, /hourBranch must be an integer/);
  reject({ ...example, gender: 'unknown' }, /gender must be male or female/);
  reject({ ...example, clockHour: 12 }, /Unexpected input field/);
  reject({ ...example, brightnessSchool: 'automatic' }, /Specify brightnessSchool/);
  reject({ ...example, leapMonthPolicy: 'automatic' }, /Specify a supported leapMonthPolicy/);
  console.log(`PASS: ${assertions} probe contract checks. This is not an independent chart-correctness certification.`);
} finally {
  try { unlinkSync(fixture); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
