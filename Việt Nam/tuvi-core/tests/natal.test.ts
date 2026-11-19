import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, canonicalJson } from '../src/canonical';
import { computeNatal } from '../src/natal';
import { getProfile } from '../src/profiles';
import type { ChartReady } from '../src/types';

const example: ChartReady = { year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' };

test('1990 execution baseline: Mệnh/Thân Mùi, Thổ ngũ cục, Thiên Lương (upstream regression, not expert gold)', () => {
  const result = computeNatal(example, getProfile('repro-v4'));
  assert.equal(result.natal.mingGongBranch, 7);
  assert.equal(result.natal.shenGongBranch, 7);
  assert.equal(result.natal.wuxingJu, 5);
  assert.deepEqual(result.natal.palaces.find(p => p.isMingGong)!.stars.filter(s => s.type === 'major').map(s => s.name), ['天梁']);
  assert.equal(result.natal.palaces.length, 12);
  assert.deepEqual(result.natal.palaces.map(p => p.branch), [...Array(12).keys()]);
  assert.equal(result.natal.palaces.flatMap(p => p.stars).filter(s => s.type === 'major').length, 14);
  assert.ok(!('currentAge' in result.natal));
  assert.ok(result.natal.palaces.every(p => !('isCurrentDaXian' in p)));
});

test('same input/profile/source has stable hash and caller data is not mutated', () => {
  const profile = getProfile('repro-v4');
  const original = JSON.stringify({ example, profile });
  const first = computeNatal(example, profile);
  assert.deepEqual(computeNatal(example, profile), first);
  assert.equal(JSON.stringify({ example, profile }), original);
  first.natal.palaces[0].name = 'mutated';
  assert.notEqual(computeNatal(example, profile).natal.palaces[0].name, 'mutated');
  first.provenance.dependencies.iztro = 'mutated';
  assert.equal(computeNatal(example, profile).provenance.dependencies.iztro, '2.6.1');
});

test('natal hash ignores execution date across years', () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2030, 0, 1) });
  try {
    const first = computeNatal(example, getProfile('repro-v4'));
    mock.timers.setTime(Date.UTC(2040, 6, 1));
    assert.deepEqual(computeNatal(example, getProfile('repro-v4')), first);
  } finally { mock.timers.reset(); }
});

test('switching brightness profiles does not leak values between calls', () => {
  const profile = getProfile('repro-v4');
  const baseline = computeNatal(example, profile);
  const changed = computeNatal(example, { ...profile, brightnessSchool: 'QS' });
  assert.notEqual(baseline.hash, changed.hash);
  assert.deepEqual(computeNatal(example, profile), baseline);
});

test('profile values are hashed even if profile IDs match', () => {
  const p = getProfile('repro-v4');
  assert.notEqual(computeNatal(example, p).hash, computeNatal(example, { ...p, lateZi: 'current-day' }).hash);
});

test('invalid chart-ready values are rejected before engine calculation', () => {
  const bad = [
    { ...example, day: 30, month: 2 }, { ...example, hourBranch: 12 },
    { ...example, hourBranch: '6' }, { ...example, gender: 'unknown' },
    { ...example, year: 1899 }, { ...example, clockHour: 12 }, { ...example, name: 'A' },
  ];
  for (const item of bad) assert.throws(() => computeNatal(item as ChartReady, getProfile('repro-v4')));
});

test('canonical hashes sort object keys, preserve arrays, reject invalid JSON values', () => {
  assert.equal(canonicalHash({ b: [1, 2], a: { z: 3, q: 4 } }), canonicalHash({ a: { q: 4, z: 3 }, b: [1, 2] }));
  assert.notEqual(canonicalHash([1, 2]), canonicalHash([2, 1]));
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.throws(() => canonicalHash({ n: NaN }));
  assert.throws(() => canonicalHash(new Date()));
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalHash(cyclic));
});

test('neither shipped profile is falsely marked confirmed', () => {
  assert.equal(getProfile('repro-v4').status, 'repro');
  assert.equal(getProfile('thienky-candidate').status, 'candidate');
  assert.throws(() => getProfile('constructor'));
});
