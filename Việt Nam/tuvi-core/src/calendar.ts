import { SearchMoonPhase, Seasons, SunPosition } from 'astronomy-engine';
import { Solar } from 'lunar-javascript';
import { lunarToSolar } from '../vendor/ziwei/lunar-solar';

export interface CivilDate { year: number; month: number; day: number }
export interface LunarDate extends CivilDate { isLeap: boolean }
export interface CalendarComparison {
  solar: CivilDate;
  chinese: LunarDate;
  vietnamese: LunarDate;
  different: boolean;
  model: 'astronomy-engine-fixed-UTC+7';
}
interface LunarMonth extends Omit<LunarDate, 'day'> { startDay: number; endDay: number }

const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 3_600_000;
const cycles = new Map<number, readonly LunarMonth[]>();
export const CALENDAR_YEAR_MIN = 1900;
export const CALENDAR_YEAR_MAX = 2050;
export const VIETNAMESE_CALENDAR_MODEL = {
  id: 'astronomy-engine-fixed-UTC+7',
  dependency: 'astronomy-engine@2.1.19',
  source: 'https://github.com/cosinekitty/astronomy',
  limitation: 'Astronomical UTC+7 model; not a reconstruction of all historical official Vietnamese calendars.',
} as const;

export function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < CALENDAR_YEAR_MIN || year > CALENDAR_YEAR_MAX) {
    throw new RangeError(`Supported calendar years are ${CALENDAR_YEAR_MIN}–${CALENDAR_YEAR_MAX}.`);
  }
}

export function isCivilDate(date: CivilDate): boolean {
  const { year, month, day } = date;
  if (![year, month, day].every(Number.isInteger)) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() + 1 === month && probe.getUTCDate() === day;
}

export function parseDate(value: string, calendar: 'solar' | 'lunar' = 'solar'): CivilDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('date must use YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  assertYear(year);
  const date = { year, month, day };
  if (calendar === 'solar' ? !isCivilDate(date) : month < 1 || month > 12 || day < 1 || day > 30) {
    throw new RangeError(`Invalid ${calendar} date: ${value}.`);
  }
  return date;
}

export function formatDate(date: CivilDate): string {
  return `${date.year.toString().padStart(4, '0')}-${date.month.toString().padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function dayNumber(date: CivilDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / DAY_MS;
}

function fromDayNumber(day: number): CivilDate {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function localDay(instant: Date): number { return Math.floor((instant.getTime() + VIETNAM_OFFSET_MS) / DAY_MS); }

/**
 * Independently assigns lunar month numbers using astronomical events. No Hồ
 * Ngọc Đức source code or lookup table is copied. New moons/solar longitude
 * come from Don Cross's MIT Astronomy Engine. Month 11 contains the local
 * winter-solstice day. In a 13-month solstice cycle, its first subsequent month
 * without a principal solar term repeats the preceding month number.
 * All event days use fixed UTC+7; birth-place IANA time is a separate concern.
 */
function solsticeCycle(year: number): readonly LunarMonth[] {
  const cached = cycles.get(year);
  if (cached) return cached;
  const solstice0 = localDay(Seasons(year).dec_solstice.date);
  const solstice1 = localDay(Seasons(year + 1).dec_solstice.date);
  const starts: number[] = [];
  let cursor = new Date(Date.UTC(year, 10, 1));
  const end = Date.UTC(year + 2, 0, 15);
  for (let guard = 0; guard < 17 && cursor.getTime() < end; guard++) {
    const moon = SearchMoonPhase(0, cursor, 35);
    if (!moon) throw new Error('Astronomy Engine could not locate a new moon.');
    starts.push(localDay(moon.date));
    cursor = new Date(moon.date.getTime() + DAY_MS);
  }
  const startIndex = starts.findIndex((start, i) => start <= solstice0 && starts[i + 1] > solstice0);
  const endIndex = starts.findIndex((start, i) => start <= solstice1 && starts[i + 1] > solstice1);
  const count = endIndex - startIndex;
  if (startIndex < 0 || (count !== 12 && count !== 13)) throw new Error('Invalid solstice lunar-month cycle.');
  let leapIndex = -1;
  if (count === 13) {
    for (let i = 1; i < count; i++) {
      // A principal term occurring on a new-moon day belongs to the new month,
      // hence both solar-longitude samples are taken at local civil midnight.
      const begin = new Date(starts[startIndex + i] * DAY_MS - VIETNAM_OFFSET_MS);
      const finish = new Date(starts[startIndex + i + 1] * DAY_MS - VIETNAM_OFFSET_MS);
      if (Math.floor(SunPosition(begin).elon / 30) === Math.floor(SunPosition(finish).elon / 30)) {
        leapIndex = i;
        break;
      }
    }
    if (leapIndex < 0) throw new Error('Could not locate the leap lunar month.');
  }
  const result: LunarMonth[] = [];
  let month = 11;
  let lunarYear = year;
  for (let i = 0; i < count; i++) {
    if (i > 0 && i !== leapIndex) {
      month = month % 12 + 1;
      if (month === 1) lunarYear++;
    }
    const startDay = starts[startIndex + i];
    const endDay = starts[startIndex + i + 1];
    if (endDay - startDay !== 29 && endDay - startDay !== 30) throw new Error('Invalid astronomical lunar-month length.');
    result.push({ year: lunarYear, month, isLeap: i === leapIndex, startDay, endDay });
  }
  cycles.set(year, result);
  return result;
}

export function solarToVietnamese(date: CivilDate): LunarDate {
  assertYear(date.year);
  if (!isCivilDate(date)) throw new RangeError('Invalid Gregorian date.');
  const day = dayNumber(date);
  for (const year of [date.year - 1, date.year]) {
    const match = solsticeCycle(year).find(m => day >= m.startDay && day < m.endDay);
    if (match) return { year: match.year, month: match.month, day: day - match.startDay + 1, isLeap: match.isLeap };
  }
  throw new Error('Date not covered by astronomical calendar cycles.');
}

export function vietnameseToSolar(date: LunarDate): CivilDate {
  assertYear(date.year);
  if (!Number.isInteger(date.month) || date.month < 1 || date.month > 12 || !Number.isInteger(date.day) || date.day < 1 || date.day > 30 || typeof date.isLeap !== 'boolean') {
    throw new RangeError('Invalid Vietnamese lunar date.');
  }
  const match = [...solsticeCycle(date.year - 1), ...solsticeCycle(date.year)]
    .find(m => m.year === date.year && m.month === date.month && m.isLeap === date.isLeap);
  if (!match || date.day > match.endDay - match.startDay) throw new RangeError('Vietnamese lunar date does not exist.');
  const result = fromDayNumber(match.startDay + date.day - 1);
  assertYear(result.year);
  return result;
}

export function solarToChinese(date: CivilDate): LunarDate {
  assertYear(date.year);
  if (!isCivilDate(date)) throw new RangeError('Invalid Gregorian date.');
  const lunar = Solar.fromYmd(date.year, date.month, date.day).getLunar();
  const rawMonth = lunar.getMonth();
  return { year: lunar.getYear(), month: Math.abs(rawMonth), day: lunar.getDay(), isLeap: rawMonth < 0 };
}

export function chineseToSolar(date: LunarDate): CivilDate {
  assertYear(date.year);
  if (typeof date.isLeap !== 'boolean') throw new TypeError('isLeap must be boolean.');
  const result = lunarToSolar(date.year, date.month, date.day, date.isLeap);
  if (!result) throw new RangeError('Chinese lunar date does not exist.');
  assertYear(result.year);
  return result;
}

export function compareCalendars(date: CivilDate): CalendarComparison {
  const chinese = solarToChinese(date);
  const vietnamese = solarToVietnamese(date);
  return {
    solar: { ...date }, chinese, vietnamese,
    different: chinese.year !== vietnamese.year || chinese.month !== vietnamese.month || chinese.day !== vietnamese.day || chinese.isLeap !== vietnamese.isLeap,
    model: 'astronomy-engine-fixed-UTC+7',
  };
}

/** Cached per solstice-year; convenient for an offline calendar-diff report. */
export function calendarDifferences(year: number): CalendarComparison[] {
  assertYear(year);
  const output: CalendarComparison[] = [];
  for (let date: CivilDate = { year, month: 1, day: 1 }; date.year === year; date = addDays(date, 1)) {
    const comparison = compareCalendars(date);
    if (comparison.different) output.push(comparison);
  }
  return output;
}
