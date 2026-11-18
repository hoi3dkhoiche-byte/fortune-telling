import type { Profile } from './types';
export type { Profile } from './types';

export const PROFILES: Readonly<Record<string, Readonly<Profile>>> = Object.freeze({
  'repro-v4': Object.freeze({
    id: 'repro-v4', brightnessSchool: 'XD2', leapMonth: 'split',
    lateZi: 'next-day', solarTime: 'none', status: 'repro',
  } as const),
  'thienky-candidate': Object.freeze({
    id: 'thienky-candidate', brightnessSchool: 'XD2', leapMonth: 'next-month',
    lateZi: 'current-day', solarTime: 'none', status: 'candidate',
  } as const),
});

/** Candidate rules have transcript support; brightness is not certified as Tianji. */
export const PROFILE_EVIDENCE = {
  'repro-v4': {
    status: 'Dataset reproduction profile; leap convention must be checked against actual rows.',
    source: 'https://github.com/Renhuai123/ziwei-doushu/releases/tag/v4.0-13d',
    limits: 'Dataset hour is a branch index; ms cannot verify late-Zi or brightness conventions.',
  },
  'thienky-candidate': {
    source: 'Bài 04 Thượng §10; Chinese 4上.md; entries.jsonl records 397–399',
    leapMonth: '00:29:35: leap month treated as the next month',
    lateZi: '00:29:59–00:30:41: late Zi belongs to the current civil day',
    brightness: 'XD2 is provisional, not a confirmed Tianji brightness table.',
    calendar: 'Astronomical calendar and historical civil-time conventions need separate verification.',
  },
} as const;

export function validateProfile(value: unknown): asserts value is Profile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Profile phải là object.');
  const profile = value as Record<string, unknown>;
  const allowed = ['id', 'brightnessSchool', 'leapMonth', 'lateZi', 'solarTime', 'status'];
  for (const key of Object.keys(profile)) if (!allowed.includes(key)) throw new TypeError(`Trường profile không hỗ trợ: ${key}`);
  if (typeof profile.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(profile.id)) throw new TypeError('Profile.id không hợp lệ.');
  for (const [key, choices] of Object.entries({
    brightnessSchool: ['QS', 'XD1', 'ZZ', 'XD2'],
    leapMonth: ['split', 'next-month', 'prev-month', 'origin-month'],
    lateZi: ['next-day', 'current-day'],
    solarTime: ['none', 'longitude', 'longitude+eot'],
    status: ['repro', 'candidate', 'confirmed'],
  })) {
    if (!choices.includes(profile[key] as string)) throw new TypeError(`Profile.${key} không hợp lệ.`);
  }
}

export function getProfile(id: string): Profile {
  if (!Object.hasOwn(PROFILES, id)) throw new RangeError(`Không có profile '${id}'. Chọn ${Object.keys(PROFILES).join(', ')}.`);
  return { ...PROFILES[id] };
}
