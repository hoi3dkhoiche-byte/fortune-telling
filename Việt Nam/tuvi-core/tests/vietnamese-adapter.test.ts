import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Solar } from 'lunar-javascript';
import { addDays, solarToVietnamese } from '../src/calendar';
import { computeNatal } from '../src/natal';
import { normalizeBirth } from '../src/normalize';
import { getProfile } from '../src/profiles';

test('Vietnamese adapter charts 1968-01-29 as Mùng 1 Tết Mậu Thân (distinct from Chinese 1967-12-30)', () => {
  const profile = getProfile('thienky-candidate');
  const vnNorm = normalizeBirth({
    calendar: 'solar', date: '1968-01-29', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'vietnamese',
  }, profile);
  const cnNorm = normalizeBirth({
    calendar: 'solar', date: '1968-01-29', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'chinese',
  }, profile);
  assert.equal(vnNorm.status, 'ok');
  assert.equal(cnNorm.status, 'ok');
  if (vnNorm.status !== 'ok' || cnNorm.status !== 'ok') return;

  const vn = computeNatal(vnNorm.chart, profile);
  const cn = computeNatal(cnNorm.chart, profile);

  assert.equal(vn.provenance.calendar, 'vietnamese-astronomical-utc+7');
  assert.equal(cn.provenance.calendar, 'upstream-chinese-lunar');
  assert.notEqual(vn.hash, cn.hash);

  // 1968-01-29 in Vietnam is 1968-01-01 (Mậu Thân: yearStem=4, yearBranch=8), hour Ngọ (6) -> Mệnh & Thân both at Thân (8)
  assert.equal(vn.natal.lunarInfo.lunarYear, 1968);
  assert.equal(vn.natal.lunarInfo.lunarMonth, 1);
  assert.equal(vn.natal.lunarInfo.lunarDay, 1);
  assert.equal(vn.natal.lunarInfo.yearStem, 4);
  assert.equal(vn.natal.lunarInfo.yearBranch, 8);
  assert.equal(vn.natal.mingGongBranch, 8);
  assert.equal(vn.natal.shenGongBranch, 8);
  assert.equal(vn.natal.lunarInfo.fourPillarsLunar?.[0], '戊申');
  assert.equal(vn.natal.lunarInfo.fourPillarsLunar?.[1], '甲寅');
  // Day and hour pillars remain identical to the real solar date
  assert.equal(vn.natal.lunarInfo.fourPillarsLunar?.[2], cn.natal.lunarInfo.fourPillarsLunar?.[2]);
  assert.equal(vn.natal.lunarInfo.fourPillarsLunar?.[3], cn.natal.lunarInfo.fourPillarsLunar?.[3]);

  // Mậu year Tứ Hóa: Tham Lang Lộc, Thái Âm Quyền, Hữu Bật Khoa, Thiên Cơ Kỵ
  const siHuaMap = Object.fromEntries(
    vn.natal.palaces.flatMap(p => p.stars).filter(s => s.siHua).map(s => [s.siHua, s.name]),
  );
  assert.deepEqual(siHuaMap, { '禄': '贪狼', '权': '太阴', '科': '右弼', '忌': '天机' });

  // Chinese 1968-01-29 is 1967-12-30 (Đinh Mùi: yearStem=3, yearBranch=7)
  assert.equal(cn.natal.lunarInfo.lunarYear, 1967);
  assert.equal(cn.natal.lunarInfo.lunarMonth, 12);
  assert.equal(cn.natal.lunarInfo.lunarDay, 30);
});

test('Vietnamese adapter handles 30-day Vietnamese months whose Chinese counterparts only have 29 days', () => {
  const profile = getProfile('thienky-candidate');
  const cases = [
    { date: '1903-02-26', expectedLunar: { year: 1903, month: 1, day: 30 } },
    { date: '1908-07-27', expectedLunar: { year: 1908, month: 6, day: 30 } },
    { date: '1935-03-04', expectedLunar: { year: 1935, month: 1, day: 30 } },
    { date: '1950-09-11', expectedLunar: { year: 1950, month: 7, day: 30 } },
    { date: '1998-01-27', expectedLunar: { year: 1997, month: 12, day: 30 } },
    { date: '2008-12-26', expectedLunar: { year: 2008, month: 11, day: 30 } },
  ];
  for (const { date, expectedLunar } of cases) {
    const [year, month, day] = date.split('-').map(Number);
    const vnLunar = solarToVietnamese({ year, month, day });
    assert.deepEqual({ year: vnLunar.year, month: vnLunar.month, day: vnLunar.day }, expectedLunar, date);
    const result = computeNatal({ year, month, day, hourBranch: 6, gender: 'female', calendarConvention: 'vietnamese' }, profile);
    assert.equal(result.natal.palaces.length, 12);
    assert.equal(result.natal.palaces.flatMap(p => p.stars).filter(s => s.type === 'major').length, 14);
    assert.equal(result.natal.lunarInfo.lunarYear, expectedLunar.year);
    assert.equal(result.natal.lunarInfo.lunarMonth, expectedLunar.month);
    assert.equal(result.natal.lunarInfo.lunarDay, expectedLunar.day);
    assert.equal(result.natal.birthInfo.year, year);
    assert.equal(result.natal.birthInfo.month, month);
    assert.equal(result.natal.birthInfo.day, day);
  }
});

test('Vietnamese adapter handles Vietnamese-only leap months across all four leapMonth policies', () => {
  // 1917-04-21 is lunar 1917 leap month 3 day 1 in Vietnam (China has leap month 2 in 1917)
  const vnDate = solarToVietnamese({ year: 1917, month: 4, day: 21 });
  assert.deepEqual(vnDate, { year: 1917, month: 3, day: 1, isLeap: true });
  const base = getProfile('thienky-candidate');
  const expectedByPolicy = [
    ['prev-month', 3, false],
    ['origin-month', 3, true],
    ['next-month', 4, false],
    ['split', 3, false],
  ] as const;
  for (const [policy, expectedMonth, expectedLeap] of expectedByPolicy) {
    const result = computeNatal(
      { year: 1917, month: 4, day: 21, hourBranch: 4, gender: 'male', calendarConvention: 'vietnamese' },
      { ...base, leapMonth: policy },
    );
    assert.equal(result.natal.lunarInfo.lunarMonth, expectedMonth, policy);
    assert.equal(result.natal.lunarInfo.isLeapMonth, expectedLeap, policy);
    assert.equal(result.natal.palaces.flatMap(p => p.stars).filter(s => s.type === 'major').length, 14);
  }
});

test('Vietnamese adapter matches upstream Chinese placement on non-divergent dates', () => {
  const profile = getProfile('repro-v4');
  const cn = computeNatal({ year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' }, profile);
  const vn = computeNatal({ year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male', calendarConvention: 'vietnamese' }, profile);
  assert.deepEqual(vn.natal, cn.natal);
  assert.equal(vn.provenance.calendar, 'vietnamese-astronomical-utc+7');
  assert.notEqual(vn.hash, cn.hash);
});

test('Vietnamese split keeps un-clamped day-30 star placement consistently across both shared and divergent leap-day-30 dates', () => {
  const profile = getProfile('repro-v4');
  const date = { year: 2017, month: 8, day: 21 };
  assert.deepEqual(solarToVietnamese(date), { year: 2017, month: 6, day: 30, isLeap: true });
  const input = { ...date, hourBranch: 6, gender: 'male' } as const;
  const cn = computeNatal(input, profile);
  const vn = computeNatal({ ...input, calendarConvention: 'vietnamese' }, profile);
  assert.equal(cn.natal.ziweiPos, 11);
  assert.deepEqual(vn.natal, cn.natal);
  assert.equal(vn.provenance.calendar, 'vietnamese-astronomical-utc+7');

  // Verify the 4 divergent dates where Vietnamese leap day 30 shifts to a 29-day next month
  // also place Ziwei & day-dependent stars using raw leap day 30 (while displaying clamped lunarDay 29).
  const divergentLeap30Cases = [
    { year: 1917, month: 5, day: 20, expectedShiftedMonth: 4 },
    { year: 1922, month: 8, day: 22, expectedShiftedMonth: 7 },
    { year: 1947, month: 4, day: 20, expectedShiftedMonth: 3 },
    { year: 1995, month: 10, day: 23, expectedShiftedMonth: 9 },
  ];
  for (const c of divergentLeap30Cases) {
    const rawVn = solarToVietnamese(c);
    assert.equal(rawVn.isLeap, true, `${c.year}-${c.month}-${c.day}`);
    assert.equal(rawVn.day, 30, `${c.year}-${c.month}-${c.day}`);

    const vnSplit = computeNatal(
      { year: c.year, month: c.month, day: c.day, hourBranch: 6, gender: 'male', calendarConvention: 'vietnamese' },
      profile,
    );
    assert.equal(vnSplit.natal.lunarInfo.lunarMonth, c.expectedShiftedMonth);
    assert.equal(vnSplit.natal.lunarInfo.lunarDay, 29);

    // Compare Ziwei position against day-30 formula vs day-29 formula for the same Cục (wuxingJu)
    const ju = vnSplit.natal.wuxingJu;
    const calcZiweiBranch = (lunarDay: number) => {
      const rem = lunarDay % ju;
      const diff = rem === 0 ? 0 : ju - rem;
      const q = (lunarDay + diff) / ju;
      const offset = diff % 2 === 0 ? q + diff : q - diff;
      return (((2 + offset - 1) % 12) + 12) % 12;
    };
    assert.equal(vnSplit.natal.ziweiPos, calcZiweiBranch(30), `${c.year}-${c.month}-${c.day} must use placementDay=30`);
    assert.notEqual(calcZiweiBranch(30), calcZiweiBranch(29), `${c.year}-${c.month}-${c.day} day 30 vs 29 must differ`);
  }
});

test('lunar-javascript and iztro lunar-lite agree on every day from 1900 to 2050', () => {
  const iztroRequire = createRequire(require.resolve('iztro'));
  const { solar2lunar } = iztroRequire('lunar-lite') as {
    solar2lunar: (solar: string) => { lunarYear: number; lunarMonth: number; lunarDay: number; isLeap: boolean };
  };
  let checked = 0;
  for (let d = { year: 1900, month: 1, day: 1 }; d.year <= 2050; d = addDays(d, 1)) {
    checked++;
    const lj = Solar.fromYmd(d.year, d.month, d.day).getLunar();
    const rawMonth = lj.getMonth();
    const ll = solar2lunar(`${d.year}-${d.month}-${d.day}`);
    assert.equal(ll.lunarYear, lj.getYear(), `${d.year}-${d.month}-${d.day}`);
    assert.equal(ll.lunarMonth, Math.abs(rawMonth), `${d.year}-${d.month}-${d.day}`);
    assert.equal(ll.lunarDay, lj.getDay(), `${d.year}-${d.month}-${d.day}`);
    assert.equal(ll.isLeap, rawMonth < 0, `${d.year}-${d.month}-${d.day}`);
  }
  assert.equal(checked, 55152);
});
