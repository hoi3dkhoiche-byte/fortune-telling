import type { Palace, ZiweiChart } from '../vendor/ziwei/types';

export type Gender = 'male' | 'female';
export interface Profile {
  id: string;
  brightnessSchool: 'QS' | 'XD1' | 'ZZ' | 'XD2';
  leapMonth: 'split' | 'next-month' | 'prev-month' | 'origin-month';
  lateZi: 'next-day' | 'current-day';
  solarTime: 'none' | 'longitude' | 'longitude+eot';
  status: 'repro' | 'candidate' | 'confirmed';
}
/** Engine date after normalization; hourBranch is never a clock hour. */
export interface ChartReady {
  year: number;
  month: number;
  day: number;
  hourBranch: number;
  gender: Gender;
}
export interface BirthInput {
  calendar: 'solar' | 'lunar';
  date: string;
  isLeap?: boolean;
  time: string | null;
  tz: string;
  place?: { lat: number; lon: number };
  gender: Gender;
  calendarConvention?: 'chinese' | 'vietnamese';
}
export interface AuditStep {
  step: string;
  description: string;
  data?: Record<string, unknown>;
}
export type NeedsReason =
  | 'NEEDS_BIRTH_TIME' | 'HOUR_BOUNDARY' | 'CALENDAR_DIVERGENCE'
  | 'CALENDAR_CONFIRMATION' | 'AMBIGUOUS_LOCAL_TIME' | 'NONEXISTENT_LOCAL_TIME'
  | 'NEEDS_BIRTH_PLACE';
export type NormalizationResult =
  | { status: 'ok'; chart: ChartReady; audit: AuditStep[]; warnings: string[] }
  | { status: 'needs'; reason: NeedsReason; scenarios?: ChartReady[]; audit: AuditStep[]; warnings: string[] };
export type NatalChart = Omit<ZiweiChart, 'currentAge' | 'currentDaXianIndex' | 'palaces' | 'analysisCacheProfile'> & {
  palaces: Array<Omit<Palace, 'isCurrentDaXian'>>;
};
