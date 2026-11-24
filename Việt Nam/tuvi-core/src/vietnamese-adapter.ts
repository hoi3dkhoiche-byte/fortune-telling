import { astro } from 'iztro';
import { Lunar, LunarMonth } from 'lunar-javascript';
import { generateChart, getLunarInfo, type EffectiveLunarDate, type LunarMonthPolicy } from '../vendor/ziwei/algorithm';
import { BRANCHES, STEMS } from '../vendor/ziwei/constants';
import type { LunarInfo, ZiweiChart } from '../vendor/ziwei/types';
import { solarToVietnamese, vietnameseMonthDayCount, type CivilDate } from './calendar';
import type { ChartReady } from './types';

const surrogateCache = new Map<string, CivilDate>();

/**
 * Resolves the effective Vietnamese lunar date under the profile's leap-month policy,
 * mirroring vendor `resolveEffectiveLunarDate` without modifying vendor code.
 */
export function resolveEffectiveVietnameseLunarDate(
  year: number,
  month: number,
  day: number,
  policy: LunarMonthPolicy = 'prev-month',
): EffectiveLunarDate {
  if (policy !== 'split' && policy !== 'next-month' && policy !== 'prev-month' && policy !== 'origin-month') {
    throw new RangeError(
      `leapMonth policy must be one of 'split' | 'next-month' | 'prev-month' | 'origin-month'; received ${String(policy)}`,
    );
  }
  const raw = solarToVietnamese({ year, month, day });
  const rawLunarMonth = raw.isLeap ? -raw.month : raw.month;
  const rawLunarDay = raw.day;

  if (!raw.isLeap) {
    return {
      lunarYear: raw.year,
      lunarMonth: raw.month,
      lunarDay: raw.day,
      isLeapMonth: false,
      rawLunarMonth,
      rawLunarDay,
    };
  }

  let lunarYear = raw.year;
  let lunarMonth = raw.month;
  let isLeapMonth = false;

  if (policy === 'split') {
    if (rawLunarDay > 15) lunarMonth = raw.month + 1;
  } else if (policy === 'next-month') {
    lunarMonth = raw.month + 1;
  } else if (policy === 'origin-month') {
    isLeapMonth = true;
  }

  if (lunarMonth > 12) {
    lunarMonth = 1;
    lunarYear += 1;
  }

  let lunarDay = rawLunarDay;
  try {
    const dayCount = vietnameseMonthDayCount(lunarYear, lunarMonth, isLeapMonth);
    if (dayCount > 0 && lunarDay > dayCount) lunarDay = dayCount;
  } catch {
    // Keep original day if target year exceeds the supported calendar range.
  }

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeapMonth,
    rawLunarMonth,
    rawLunarDay,
  };
}

/**
 * Finds a deterministic Gregorian date whose upstream Chinese non-leap lunar date
 * shares the exact same (yearStem, yearBranch, lunarMonth, lunarDay) sexagenary
 * coordinates, verified against both `lunar-javascript` and `iztro`.
 */
export function findChineseSolarSurrogate(lunarYear: number, lunarMonth: number, lunarDay: number): CivilDate {
  const cacheKey = `${lunarYear}-${lunarMonth}-${lunarDay}`;
  const cached = surrogateCache.get(cacheKey);
  if (cached) return cached;

  for (let cycle = 0; cycle <= 10; cycle++) {
    const deltas = cycle === 0 ? [0] : [cycle * 60, -cycle * 60];
    for (const delta of deltas) {
      const surrogateYear = lunarYear + delta;
      if (surrogateYear < 1500 || surrogateYear > 2600) continue;
      try {
        const monthInfo = LunarMonth.fromYm(surrogateYear, lunarMonth);
        if (!monthInfo || monthInfo.getDayCount() < lunarDay) continue;
        const solarObj = Lunar.fromYmd(surrogateYear, lunarMonth, lunarDay).getSolar();
        const solar: CivilDate = {
          year: solarObj.getYear(),
          month: solarObj.getMonth(),
          day: solarObj.getDay(),
        };
        const astrolabe = astro.bySolar(`${solar.year}-${solar.month}-${solar.day}`, 0, '男', false, 'zh-CN');
        const iztroLunar = astrolabe.rawDates.lunarDate;
        if (
          iztroLunar.lunarYear === surrogateYear
          && iztroLunar.lunarMonth === lunarMonth
          && iztroLunar.lunarDay === lunarDay
          && !iztroLunar.isLeap
        ) {
          surrogateCache.set(cacheKey, solar);
          return solar;
        }
      } catch {
        // Try the next sexagenary cycle.
      }
    }
  }

  throw new RangeError(`No verified Chinese solar surrogate found for lunar ${lunarYear}-${lunarMonth}-${lunarDay}.`);
}

/**
 * Computes a ZiweiChart using the Vietnamese astronomical UTC+7 lunar date
 * while delegating star placement, brightness, Tứ Hóa and Đại Hạn unchanged to
 * the verified vendor engine.
 */
export function generateVietnameseChart(input: ChartReady, policy: LunarMonthPolicy): ZiweiChart {
  const effective = resolveEffectiveVietnameseLunarDate(input.year, input.month, input.day, policy);
  const surrogate = findChineseSolarSurrogate(effective.lunarYear, effective.lunarMonth, effective.lunarDay);
  const baseChart = generateChart(
    {
      year: surrogate.year,
      month: surrogate.month,
      day: surrogate.day,
      hour: input.hourBranch,
      gender: input.gender,
    },
    { leapMonth: 'prev-month' },
  );

  const yearStem = ((effective.lunarYear - 4) % 10 + 10) % 10;
  const yearBranch = ((effective.lunarYear - 4) % 12 + 12) % 12;
  const solarInfo = getLunarInfo(input.year, input.month, input.day, input.hourBranch, policy);
  const fourPillars = solarInfo.fourPillars;
  let fourPillarsLunar: [string, string, string, string] | undefined;
  if (fourPillars) {
    const yearGZLunar = `${STEMS[yearStem]}${BRANCHES[yearBranch]}`;
    const monthBranchIdx = (effective.lunarMonth + 1) % 12;
    const monthStemBase = ((yearStem % 5) * 2 + 2) % 10;
    const monthStemIdx = (monthStemBase + (effective.lunarMonth - 1)) % 10;
    const monthGZLunar = `${STEMS[monthStemIdx]}${BRANCHES[monthBranchIdx]}`;
    fourPillarsLunar = [yearGZLunar, monthGZLunar, fourPillars[2], fourPillars[3]];
  }

  const lunarInfo: LunarInfo = {
    lunarYear: effective.lunarYear,
    lunarMonth: effective.lunarMonth,
    lunarDay: effective.lunarDay,
    yearStem,
    yearBranch,
    isLeapMonth: effective.isLeapMonth,
    fourPillars,
    fourPillarsLunar,
  };

  return {
    ...baseChart,
    birthInfo: {
      year: input.year,
      month: input.month,
      day: input.day,
      hour: input.hourBranch,
      gender: input.gender,
      leapMonthPolicy: policy,
    } as ZiweiChart['birthInfo'],
    lunarInfo,
  };
}
