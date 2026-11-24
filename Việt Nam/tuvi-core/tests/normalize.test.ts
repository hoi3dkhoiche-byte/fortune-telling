import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBirth } from '../src/normalize';
import { resolveLocalTime } from '../src/timezone';
import { getProfile } from '../src/profiles';
import type { BirthInput } from '../src/types';

const birth: BirthInput = {
  calendar: 'solar', date: '1990-01-01', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'chinese',
};

test('civil normalization returns explicit chart-ready hour and IANA audit', () => {
  const result = normalizeBirth(birth, getProfile('repro-v4'));
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.chart, { year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' });
  const zone = result.audit.find(s => s.step === 'iana-time-zone')!.data!;
  assert.equal((zone.candidates as { utcOffsetMinutes: number }[])[0].utcOffsetMinutes, 420);
});

test('unknown birth time is never replaced by Zi', () => {
  const result = normalizeBirth({ ...birth, time: null }, getProfile('repro-v4'));
  assert.equal(result.status, 'needs');
  if (result.status === 'needs') assert.equal(result.reason, 'NEEDS_BIRTH_TIME');
  assert.ok(!('chart' in result));
});

test('23:30 follows the selected late-Zi rule across month and year', () => {
  const input = { ...birth, date: '1990-12-31', time: '23:30' };
  const a = normalizeBirth(input, getProfile('repro-v4'));
  const b = normalizeBirth(input, getProfile('thienky-candidate'));
  assert.equal(a.status, 'ok'); assert.equal(b.status, 'ok');
  if (a.status !== 'ok' || b.status !== 'ok') return;
  assert.deepEqual(a.chart, { year: 1991, month: 1, day: 1, hourBranch: 0, gender: 'male' });
  assert.deepEqual(b.chart, { year: 1990, month: 12, day: 31, hourBranch: 0, gender: 'male' });
});

test('near a branch boundary returns distinct scenarios instead of choosing', () => {
  for (const time of ['00:59', '01:00', '02:59', '23:00']) {
    const result = normalizeBirth({ ...birth, time }, getProfile('thienky-candidate'));
    assert.equal(result.status, 'needs', time);
    if (result.status === 'needs') {
      assert.equal(result.reason, 'HOUR_BOUNDARY');
      assert.ok(result.scenarios && result.scenarios.length >= 2);
    }
  }
});

test('boundary checking can be explicitly disabled while preserving deterministic mapping', () => {
  const result = normalizeBirth({ ...birth, time: '01:00' }, getProfile('repro-v4'), { boundaryMinutes: 0 });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.equal(result.chart.hourBranch, 1);
});

test('a boundary scenario cannot bypass an unresolved calendar divergence', () => {
  const input = { ...birth, date: '1968-01-28', time: '23:59', calendarConvention: undefined };
  const profile = getProfile('thienky-candidate');
  const result = normalizeBirth(input, profile);
  assert.equal(result.status, 'needs');
  if (result.status !== 'needs') return;
  assert.equal(result.reason, 'HOUR_BOUNDARY');
  assert.deepEqual(result.scenarios?.map(chart => chart.day), [28]);
  assert.deepEqual(result.warnings, ['SCENARIO_BLOCKED_DIVERGENCE:1968-01-29']);
  const blockedStep = result.audit.find(step => step.step === 'blocked-scenarios');
  assert.deepEqual(blockedStep?.data, {
    blocked: [{ year: 1968, month: 1, day: 29, hourBranch: 0, gender: 'male' }],
  });

  const confirmed = normalizeBirth({ ...input, calendarConvention: 'chinese' }, profile);
  assert.equal(confirmed.status, 'needs');
  if (confirmed.status === 'needs') {
    assert.deepEqual(confirmed.scenarios?.map(chart => chart.day), [28, 29]);
    assert.equal(confirmed.audit.some(step => step.step === 'blocked-scenarios'), false);
  }

  const confirmedVn = normalizeBirth({ ...input, calendarConvention: 'vietnamese' }, profile);
  assert.equal(confirmedVn.status, 'needs');
  if (confirmedVn.status === 'needs') {
    assert.deepEqual(confirmedVn.scenarios?.map(chart => chart.day), [28, 29]);
    assert.ok(confirmedVn.scenarios?.every(chart => chart.calendarConvention === 'vietnamese'));
    assert.equal(confirmedVn.audit.some(step => step.step === 'blocked-scenarios'), false);
  }
});

test('lunar input requires leap identity; leap fifth month 1990 maps to June 23', () => {
  const input: BirthInput = { ...birth, calendar: 'lunar', date: '1990-05-01', isLeap: true };
  const result = normalizeBirth(input, getProfile('thienky-candidate'));
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.deepEqual(result.chart, { year: 1990, month: 6, day: 23, hourBranch: 6, gender: 'male' });
  const { isLeap, ...missingLeap } = input;
  assert.throws(() => normalizeBirth(missingLeap, getProfile('repro-v4')));
});

test('calendar disagreements emit standardized warning codes and support explicit Vietnamese adapter', () => {
  const common = { ...birth, date: '1968-01-29' };
  const unresolved = normalizeBirth({ ...common, calendarConvention: undefined }, getProfile('repro-v4'));
  assert.equal(unresolved.status, 'needs');
  if (unresolved.status === 'needs') {
    assert.equal(unresolved.reason, 'CALENDAR_DIVERGENCE');
    assert.deepEqual(unresolved.warnings, ['CALENDAR_DIVERGENCE_CHOICE_REQUIRED']);
  }
  const vietnamese = normalizeBirth({ ...common, calendarConvention: 'vietnamese' }, getProfile('repro-v4'));
  assert.equal(vietnamese.status, 'ok');
  if (vietnamese.status === 'ok') {
    assert.equal(vietnamese.chart.calendarConvention, 'vietnamese');
    assert.deepEqual(vietnamese.warnings, ['CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER', 'VIETNAMESE_CALENDAR_MODEL']);
  }
  const vietnameseAgreed = normalizeBirth({ ...birth, calendarConvention: 'vietnamese' }, getProfile('repro-v4'));
  assert.equal(vietnameseAgreed.status, 'ok');
  if (vietnameseAgreed.status === 'ok') {
    assert.equal(vietnameseAgreed.chart.calendarConvention, 'vietnamese');
    assert.deepEqual(vietnameseAgreed.warnings, ['VIETNAMESE_CALENDAR_MODEL']);
  }
  const explicit = normalizeBirth({ ...common, calendarConvention: 'chinese' }, getProfile('repro-v4'));
  assert.equal(explicit.status, 'ok');
  if (explicit.status === 'ok') assert.deepEqual(explicit.warnings, ['CALENDAR_DIVERGENCE_CHINESE_EXPLICIT']);
  const shifted = normalizeBirth({ ...birth, date: '1968-01-28', time: '23:30', calendarConvention: undefined }, getProfile('repro-v4'));
  assert.equal(shifted.status, 'needs');
  if (shifted.status === 'needs') {
    assert.equal(shifted.reason, 'CALENDAR_DIVERGENCE');
    assert.deepEqual(shifted.warnings, ['SHIFTED_DATE_DIVERGENCE']);
  }
  const shiftedVn = normalizeBirth({ ...birth, date: '1968-01-28', time: '23:30', calendarConvention: 'vietnamese' }, getProfile('repro-v4'));
  assert.equal(shiftedVn.status, 'ok');
  if (shiftedVn.status === 'ok') {
    assert.deepEqual(shiftedVn.chart, { year: 1968, month: 1, day: 29, hourBranch: 0, gender: 'male', calendarConvention: 'vietnamese' });
    assert.ok(shiftedVn.warnings.includes('CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER'));
  }
  const lunar = normalizeBirth({ ...common, calendar: 'lunar', date: '1968-01-01', isLeap: false, calendarConvention: undefined }, getProfile('repro-v4'));
  assert.equal(lunar.status, 'needs');
  if (lunar.status === 'needs') assert.equal(lunar.reason, 'CALENDAR_CONFIRMATION');
});

test('AMBIGUOUS_LOCAL_TIME filters divergent candidates into blocked-scenarios audit', () => {
  const profile = { ...getProfile('thienky-candidate'), id: 'solar-ambig-test', solarTime: 'longitude' as const };
  const input: BirthInput = {
    calendar: 'solar',
    date: '1995-09-23',
    time: '23:30',
    tz: 'Asia/Beirut',
    gender: 'male',
    place: { lat: 0, lon: 45 },
  };
  const partial = normalizeBirth(input, profile);
  assert.equal(partial.status, 'needs');
  if (partial.status !== 'needs') return;
  assert.equal(partial.reason, 'AMBIGUOUS_LOCAL_TIME');
  assert.equal(partial.scenarioOptions?.length, 1);
  assert.equal(partial.scenarioOptions?.[0].chart.day, 23);
  assert.deepEqual(partial.warnings, ['SCENARIO_BLOCKED_DIVERGENCE:1995-09-24']);
  assert.deepEqual(partial.audit.find(step => step.step === 'blocked-scenarios')?.data, {
    blocked: [{ year: 1995, month: 9, day: 24, hourBranch: 0, gender: 'male' }],
  });

  const unlocked = normalizeBirth({ ...input, calendarConvention: 'chinese' }, profile);
  assert.equal(unlocked.status, 'needs');
  if (unlocked.status === 'needs') {
    assert.equal(unlocked.reason, 'AMBIGUOUS_LOCAL_TIME');
    assert.deepEqual(unlocked.scenarioOptions?.map(option => option.chart.day), [23, 24]);
    assert.equal(unlocked.audit.some(step => step.step === 'blocked-scenarios'), false);
  }

  const allBlocked = normalizeBirth({ ...input, place: { lat: 0, lon: 60 } }, profile);
  assert.equal(allBlocked.status, 'needs');
  if (allBlocked.status === 'needs') {
    assert.equal(allBlocked.reason, 'CALENDAR_DIVERGENCE');
    assert.deepEqual(allBlocked.warnings, ['SCENARIO_BLOCKED_DIVERGENCE:1995-09-24']);
    assert.deepEqual(allBlocked.audit.find(step => step.step === 'blocked-scenarios')?.data, {
      blocked: [
        { year: 1995, month: 9, day: 24, hourBranch: 0, gender: 'male' },
        { year: 1995, month: 9, day: 24, hourBranch: 1, gender: 'male' },
      ],
    });
  }
});

test('IANA detects a skipped and a repeated local clock (New York 2024)', () => {
  const gap = normalizeBirth({ ...birth, date: '2024-03-10', time: '02:30', tz: 'America/New_York' }, getProfile('repro-v4'));
  assert.equal(gap.status, 'needs');
  if (gap.status === 'needs') assert.equal(gap.reason, 'NONEXISTENT_LOCAL_TIME');
  const overlap = normalizeBirth({ ...birth, date: '2024-11-03', time: '01:30', tz: 'America/New_York' }, getProfile('repro-v4'));
  assert.equal(overlap.status, 'needs');
  if (overlap.status === 'needs') {
    assert.equal(overlap.reason, 'AMBIGUOUS_LOCAL_TIME');
    assert.equal(overlap.scenarios?.length, 1);
    assert.deepEqual(overlap.scenarioOptions?.map(option => [option.instant, option.utcOffsetMinutes]), [
      ['2024-11-03T05:30:00.000Z', -240],
      ['2024-11-03T06:30:00.000Z', -300],
    ]);
    assert.ok(overlap.scenarioOptions?.every(option => option.chart.hourBranch === 1));
  }
  const zone = resolveLocalTime({ year: 2024, month: 11, day: 3, hour: 1, minute: 30 }, 'America/New_York');
  assert.deepEqual(zone.candidates.map(c => c.utcOffsetMinutes), [-240, -300]);
});

test('IANA historic Saigon offsets are not hardcoded to modern UTC+7', () => {
  // IANA asia source: +08 through 1975-06-13; then +07. This verifies tzdb, not all historical records.
  for (const [year, expected] of [[1970, 480], [1990, 420]]) {
    const zone = resolveLocalTime({ year, month: 1, day: 1, hour: 12, minute: 0 }, 'Asia/Ho_Chi_Minh');
    assert.equal(zone.status, 'unique');
    assert.equal(zone.candidates[0].utcOffsetMinutes, expected);
    assert.ok(zone.database.icu);
  }
});

test('solar correction that changes branch/day offers both scenarios and requires place', () => {
  const profile = { ...getProfile('thienky-candidate'), id: 'solar-test', solarTime: 'longitude' as const };
  const noPlace = normalizeBirth(birth, profile);
  assert.equal(noPlace.status, 'needs');
  if (noPlace.status === 'needs') assert.equal(noPlace.reason, 'NEEDS_BIRTH_PLACE');
  const result = normalizeBirth({ ...birth, time: '00:05', place: { lat: 0, lon: 90 } }, profile);
  assert.equal(result.status, 'needs');
  if (result.status === 'needs') {
    assert.equal(result.reason, 'HOUR_BOUNDARY');
    assert.ok(result.scenarios?.some(c => c.year === 1989 && c.month === 12 && c.day === 31));
    assert.ok(result.scenarios?.some(c => c.year === 1990 && c.month === 1 && c.day === 1));
  }
});

test('normalizer rejects malformed dates/clocks/zones and unsupported fields', () => {
  for (const change of [
    { date: '1990-02-30' }, { time: '24:00' }, { time: undefined }, { tz: 'UTC+7' },
    { tz: 'Asia/Not_A_Zone' }, { calendar: 'auto' }, { gender: 'other' }, { isLeap: false },
    { place: { lat: 100, lon: 106 } }, { clockHour: 12 },
  ]) assert.throws(() => normalizeBirth({ ...birth, ...change } as BirthInput, getProfile('repro-v4')));
  assert.throws(() => normalizeBirth(birth, getProfile('repro-v4'), { boundaryMinutes: -1 }));
});
