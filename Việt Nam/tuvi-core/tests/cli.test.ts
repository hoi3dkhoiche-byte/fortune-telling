import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(__dirname, '../src/cli.js');
const fixture = { year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' };
function run(args: string[], input?: string) {
  return spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8', timeout: 30000 });
}

test('CLI chart emits machine-readable JSON on stdout and requires explicit profile', () => {
  const good = run(['chart', '--input', '-', '--profile', 'repro-v4'], JSON.stringify(fixture));
  assert.equal(good.status, 0, good.stderr);
  assert.equal(good.stderr, '');
  const result = JSON.parse(good.stdout);
  assert.equal(result.status, 'ok');
  assert.equal(result.natal.palaces.length, 12);
  assert.ok(result.facts.length > 100);
  assert.equal(result.labels.unknownNames.length, 0);
  const noProfile = run(['chart', '--input', '-'], JSON.stringify(fixture));
  assert.equal(noProfile.status, 1);
  assert.equal(noProfile.stdout, '');
  assert.equal(JSON.parse(noProfile.stderr).status, 'error');
});

test('CLI missing time returns needs JSON and exit 2 without fabricating natal data', () => {
  const result = run(['chart', '--input', '-', '--profile', 'thienky-candidate'], JSON.stringify({
    calendar: 'solar', date: '1990-01-01', time: null, tz: 'Asia/Ho_Chi_Minh', gender: 'male',
  }));
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.reason, 'NEEDS_BIRTH_TIME');
  assert.ok(!('natal' in body));
});

test('batch preserves per-line association and reports invalid and unresolved rows', () => {
  const lines = [
    JSON.stringify(fixture),
    '{malformed',
    JSON.stringify({ calendar: 'solar', date: '1990-01-01', time: null, tz: 'Asia/Ho_Chi_Minh', gender: 'female' }),
    JSON.stringify({ ...fixture, gender: 'female' }),
  ].join('\n');
  const result = run(['batch', '--input', '-', '--profile', 'repro-v4'], lines);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, '');
  const output = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(output.map(row => [row.line, row.status]), [[1, 'ok'], [2, 'error'], [3, 'needs'], [4, 'ok']]);
});

test('CLI refuses to overwrite batch input and writes UTF-8 output separately', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tuvi-cli-'));
  try {
    const input = join(directory, 'in.jsonl');
    const output = join(directory, 'out.jsonl');
    const source = `${JSON.stringify(fixture)}\n${JSON.stringify({ ...fixture, gender: 'female' })}\n`;
    writeFileSync(input, source, 'utf8');
    const refused = run(['batch', '--input', input, '--output', input, '--profile', 'repro-v4']);
    assert.equal(refused.status, 1);
    assert.equal(readFileSync(input, 'utf8'), source);
    const good = run(['batch', '--input', input, '--output', output, '--profile', 'repro-v4']);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(good.stdout, '');
    const rows = readFileSync(output, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2);
    assert.ok(readFileSync(output, 'utf8').includes('Thiên Lương'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CLI accepts a full profile file and rejects conflicting or unknown flags', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tuvi-profile-'));
  try {
    const path = join(directory, 'profile.json');
    writeFileSync(path, JSON.stringify({ id: 'custom-qs', brightnessSchool: 'QS', leapMonth: 'split', lateZi: 'current-day', solarTime: 'none', status: 'candidate' }));
    const result = run(['chart', '--input', '-', '--profile-file', path], JSON.stringify(fixture));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).profile.id, 'custom-qs');
    for (const flags of [['--profile', 'repro-v4', '--profile-file', path], ['--no-such-flag', 'x']]) {
      assert.equal(run(['chart', '--input', '-', ...flags], JSON.stringify(fixture)).status, 1);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
