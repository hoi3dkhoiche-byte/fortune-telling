import type { AuditStep, BirthInput, ChartReady, NormalizationResult, Profile } from './types';
import { validateProfile } from './profiles';
import {
  addDays, assertYear, chineseToSolar, compareCalendars, formatDate, parseDate,
  vietnameseToSolar, type CivilDate, type LunarDate,
} from './calendar';
import { resolveLocalTime, validateTimeZone, type TimeZoneCandidate } from './timezone';
import { equationOfTimeMinutes } from '../vendor/ziwei/true-solar-time';

const DAY_SECONDS = 86400;
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const key = (chart: ChartReady) => `${chart.year}-${chart.month}-${chart.day}-${chart.hourBranch}-${chart.gender}-${chart.calendarConvention ?? ''}`;
const uniqueCharts = (charts: ChartReady[]) => [...new Map(charts.map(chart => [key(chart), chart])).values()];

function validateInput(value: unknown): asserts value is BirthInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Birth input must be an object.');
  const input = value as Record<string, unknown>;
  const allowed = ['calendar', 'date', 'isLeap', 'time', 'tz', 'place', 'gender', 'calendarConvention'];
  for (const field of Object.keys(input)) if (!allowed.includes(field)) throw new TypeError(`Unsupported birth field: ${field}.`);
  if (input.calendar !== 'solar' && input.calendar !== 'lunar') throw new TypeError('calendar must be solar or lunar.');
  if (input.gender !== 'male' && input.gender !== 'female') throw new TypeError('gender must be male or female.');
  if (input.time !== null && (typeof input.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time))) {
    throw new TypeError('time must be HH:mm or null; unknown time is never inferred.');
  }
  if (typeof input.tz !== 'string') throw new TypeError('tz must be an IANA zone string.');
  validateTimeZone(input.tz);
  if (input.calendarConvention !== undefined && input.calendarConvention !== 'chinese' && input.calendarConvention !== 'vietnamese') {
    throw new TypeError('calendarConvention must be chinese or vietnamese.');
  }
  if (input.calendar === 'lunar' && typeof input.isLeap !== 'boolean') throw new TypeError('Lunar input requires an explicit isLeap boolean.');
  if (input.calendar === 'solar' && input.isLeap !== undefined) throw new TypeError('isLeap is only valid for lunar input.');
  if (input.place !== undefined) {
    if (!input.place || typeof input.place !== 'object' || Array.isArray(input.place)) throw new TypeError('place must contain lat and lon.');
    const place = input.place as Record<string, unknown>;
    if (Object.keys(place).some(field => field !== 'lat' && field !== 'lon')) throw new TypeError('Unsupported place field.');
    if (typeof place.lat !== 'number' || !Number.isFinite(place.lat) || place.lat < -90 || place.lat > 90
      || typeof place.lon !== 'number' || !Number.isFinite(place.lon) || place.lon < -180 || place.lon > 180) {
      throw new RangeError('place requires finite lat [-90,90] and lon [-180,180].');
    }
  }
  parseDate(input.date as string, input.calendar);
}

function chartAt(date: CivilDate, rawSeconds: number, gender: BirthInput['gender'], profile: Profile, calendarConvention?: BirthInput['calendarConvention']): ChartReady {
  const dayOffset = Math.floor(rawSeconds / DAY_SECONDS);
  const seconds = mod(rawSeconds, DAY_SECONDS);
  const hourBranch = seconds >= 23 * 3600 || seconds < 3600 ? 0 : Math.floor((seconds - 3600) / 7200) + 1;
  const ziOffset = profile.lateZi === 'next-day' && seconds >= 23 * 3600 ? 1 : 0;
  const shifted = addDays(date, dayOffset + ziOffset);
  assertYear(shifted.year);
  return calendarConvention === 'vietnamese'
    ? { ...shifted, hourBranch, gender, calendarConvention: 'vietnamese' }
    : { ...shifted, hourBranch, gender };
}

function timeCorrection(date: CivilDate, hour: number, minute: number, input: BirthInput, profile: Profile, candidate: TimeZoneCandidate): { seconds: number; longitudeMinutes: number; eotMinutes: number } {
  if (profile.solarTime === 'none') return { seconds: hour * 3600 + minute * 60, longitudeMinutes: 0, eotMinutes: 0 };
  // Using the actual IANA offset here is equivalent to removing DST/historical
  // wall-clock displacement first. Do not subtract that displacement twice.
  const longitudeMinutes = input.place!.lon * 4 - candidate.utcOffsetMinutes;
  const eotMinutes = profile.solarTime === 'longitude+eot'
    ? equationOfTimeMinutes(date.year, date.month, date.day, hour, minute) : 0;
  return { seconds: Math.round((hour * 60 + minute + longitudeMinutes + eotMinutes) * 60), longitudeMinutes, eotMinutes };
}

function tryConversion(convert: () => CivilDate): CivilDate | null {
  try { return convert(); } catch (error) { if (error instanceof RangeError) return null; throw error; }
}

/**
 * Converts a civil clock to engine-ready input, or explicitly requests missing
 * information. It does not silently feed Vietnamese lunar data into the Chinese
 * calendar engine on divergent days. Passing calendarConvention:'chinese' is an
 * explicit choice to reproduce upstream's calendar.
 */
export function normalizeBirth(input: BirthInput, profile: Profile, options: { boundaryMinutes?: number } = {}): NormalizationResult {
  validateInput(input);
  validateProfile(profile);
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(field => field !== 'boundaryMinutes')) {
    throw new TypeError('Unsupported normalizer options.');
  }
  const boundaryMinutes = options.boundaryMinutes ?? 2;
  if (!Number.isFinite(boundaryMinutes) || boundaryMinutes < 0 || boundaryMinutes > 30) throw new RangeError('boundaryMinutes must be between 0 and 30.');
  const audit: AuditStep[] = [{ step: 'input', description: 'Validated explicit civil date/time input.', data: { calendar: input.calendar, date: input.date, time: input.time, tz: input.tz, profileId: profile.id } }];
  const warnings: string[] = [];
  const needs = (reason: Extract<NormalizationResult, { status: 'needs' }>['reason'], scenarios?: ChartReady[]): NormalizationResult => ({ status: 'needs', reason, ...(scenarios?.length ? { scenarios: uniqueCharts(scenarios) } : {}), audit, warnings });
  const rawDate = parseDate(input.date, input.calendar);
  let date: CivilDate;
  if (input.calendar === 'lunar') {
    const lunar: LunarDate = { ...rawDate, isLeap: input.isLeap! };
    if (input.calendarConvention === 'chinese') date = chineseToSolar(lunar);
    else if (input.calendarConvention === 'vietnamese') date = vietnameseToSolar(lunar);
    else {
      const chinese = tryConversion(() => chineseToSolar(lunar));
      const vietnamese = tryConversion(() => vietnameseToSolar(lunar));
      if (!chinese && !vietnamese) throw new RangeError('Lunar date does not exist in either supported calendar.');
      audit.push({ step: 'lunar-calendar-choice', description: 'Compared both lunar-to-solar mappings; no calendar convention was assumed.', data: { chinese, vietnamese } });
      if (!chinese || !vietnamese || formatDate(chinese) !== formatDate(vietnamese)) {
        return needs('CALENDAR_CONFIRMATION');
      }
      date = chinese;
    }
    audit.push({ step: 'lunar-to-solar', description: 'Converted a validated lunar date, retaining explicit leap-month identity.', data: { input: lunar, convention: input.calendarConvention ?? 'both-calendars-agree', solar: date } });
  } else date = rawDate;

  const comparison = compareCalendars(date);
  audit.push({ step: 'calendar-comparison', description: 'Compared upstream Chinese lunar date with an astronomical fixed-UTC+7 model.', data: { ...comparison } });
  if (comparison.different) {
    if (!input.calendarConvention) {
      warnings.push('CALENDAR_DIVERGENCE_CHOICE_REQUIRED');
      return needs('CALENDAR_DIVERGENCE');
    }
    if (input.calendarConvention === 'chinese') {
      warnings.push('CALENDAR_DIVERGENCE_CHINESE_EXPLICIT');
    } else {
      warnings.push('CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER');
    }
  }
  if (input.calendarConvention === 'vietnamese') warnings.push('VIETNAMESE_CALENDAR_MODEL');
  function selectableScenario(chart: ChartReady): boolean {
    if (input.calendarConvention === 'chinese' || input.calendarConvention === 'vietnamese' || formatDate(chart) === formatDate(date)) return true;
    const checked = compareCalendars(chart);
    if (!checked.different) return true;
    const warning = `SCENARIO_BLOCKED_DIVERGENCE:${formatDate(chart)}`;
    if (!warnings.includes(warning)) warnings.push(warning);
    return false;
  }
  function partitionScenarios<T>(items: T[], getChart: (item: T) => ChartReady): { selectable: T[]; blocked: ChartReady[] } {
    const selectable: T[] = [];
    const blocked: ChartReady[] = [];
    for (const item of items) {
      const candidateChart = getChart(item);
      if (selectableScenario(candidateChart)) selectable.push(item);
      else blocked.push(candidateChart);
    }
    return { selectable, blocked: uniqueCharts(blocked) };
  }
  if (input.time === null) return needs('NEEDS_BIRTH_TIME');
  if (profile.solarTime !== 'none' && !input.place) return needs('NEEDS_BIRTH_PLACE');
  const [hour, minute] = input.time.split(':').map(Number);
  const zone = resolveLocalTime({ ...date, hour, minute }, input.tz);
  audit.push({ step: 'iana-time-zone', description: 'Resolved the birth-time offset from Node ICU/IANA data; retained gaps and overlaps.', data: { ...zone } });
  if (zone.status === 'nonexistent') return needs('NONEXISTENT_LOCAL_TIME');
  if (zone.status === 'ambiguous') {
    const allOptions = zone.candidates.map(candidate => ({
      ...candidate,
      chart: chartAt(date, timeCorrection(date, hour, minute, input, profile, candidate).seconds, input.gender, profile, input.calendarConvention),
    }));
    const { selectable: scenarioOptions, blocked } = partitionScenarios(allOptions, option => option.chart);
    if (blocked.length > 0) {
      audit.push({ step: 'blocked-scenarios', description: 'Scenarios blocked by calendar divergence filter.', data: { blocked } });
    }
    if (scenarioOptions.length === 0) return needs('CALENDAR_DIVERGENCE');
    return {
      status: 'needs',
      reason: 'AMBIGUOUS_LOCAL_TIME',
      scenarios: uniqueCharts(scenarioOptions.map(option => option.chart)),
      scenarioOptions,
      audit,
      warnings,
    };
  }
  const candidate = zone.candidates[0];
  const correction = timeCorrection(date, hour, minute, input, profile, candidate);
  const chart = chartAt(date, correction.seconds, input.gender, profile, input.calendarConvention);
  const uncorrectedChart = chartAt(date, hour * 3600 + minute * 60, input.gender, profile, input.calendarConvention);
  audit.push({
    step: 'solar-time', description: 'Applied only the profile-selected correction; seconds are rounded once before branch/day selection.',
    data: { mode: profile.solarTime, longitudeMinutes: correction.longitudeMinutes, equationOfTimeMinutes: correction.eotMinutes, totalCorrectionMinutes: correction.longitudeMinutes + correction.eotMinutes, correctedClockDayOffset: Math.floor(correction.seconds / DAY_SECONDS) },
  });
  audit.push({ step: 'chart-ready', description: 'Applied the late-Zi rule to the selected clock; hourBranch is 0–11.', data: { chart, lateZi: profile.lateZi } });

  if (formatDate(chart) !== formatDate(date)) {
    const shiftedComparison = compareCalendars(chart);
    audit.push({ step: 'shifted-calendar-comparison', description: 'Checked the engine date after solar-time/late-Zi day movement.', data: { ...shiftedComparison } });
    if (shiftedComparison.different && !input.calendarConvention) {
      warnings.push('SHIFTED_DATE_DIVERGENCE');
      return needs('CALENDAR_DIVERGENCE');
    }
    if (shiftedComparison.different && input.calendarConvention === 'vietnamese' && !warnings.includes('CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER')) {
      warnings.push('CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER');
    }
  }

  const scenarios: ChartReady[] = [chart];
  const seconds = mod(correction.seconds, DAY_SECONDS);
  const branchDistance = Math.min(mod(seconds - 3600, 7200), 7200 - mod(seconds - 3600, 7200));
  const midnightDistance = Math.min(seconds, DAY_SECONDS - seconds);
  const nearBoundary = boundaryMinutes > 0 && Math.min(branchDistance, midnightDistance) <= boundaryMinutes * 60;
  if (nearBoundary) {
    const radius = boundaryMinutes * 60 + 1;
    scenarios.push(
      chartAt(date, correction.seconds - radius, input.gender, profile, input.calendarConvention),
      chartAt(date, correction.seconds + radius, input.gender, profile, input.calendarConvention),
    );
  }
  const correctionChangesChart = profile.solarTime !== 'none' && key(uncorrectedChart) !== key(chart);
  if (correctionChangesChart) scenarios.push(uncorrectedChart);
  if ((nearBoundary || correctionChangesChart) && uniqueCharts(scenarios).length > 1) {
    const { selectable, blocked } = partitionScenarios(uniqueCharts(scenarios), candidateChart => candidateChart);
    if (blocked.length > 0) {
      audit.push({ step: 'blocked-scenarios', description: 'Scenarios blocked by calendar divergence filter.', data: { blocked } });
    }
    audit.push({ step: 'boundary-scenarios', description: 'Returned selectable chart-ready scenarios for the branch/day boundary.', data: { boundaryMinutes, nearBoundary, correctionChangesChart, scenarios: selectable } });
    return needs('HOUR_BOUNDARY', selectable);
  }
  return { status: 'ok', chart, audit, warnings };
}
