import { generateChart, setBrightnessSchool } from '../vendor/ziwei/algorithm';
import manifest from '../vendor/manifest.json';
import { canonicalHash } from './canonical';
import { validateProfile } from './profiles';
import { buildFacts, buildRelations } from './facts';
import { buildLabels } from './i18n';
import type { ChartReady, NatalChart, Profile } from './types';

export function validateChartReady(value: unknown): asserts value is ChartReady {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('ChartReady phải là object.');
  const input = value as Record<string, unknown>;
  const keys = ['year', 'month', 'day', 'hourBranch', 'gender'];
  for (const key of Object.keys(input)) if (!keys.includes(key)) throw new TypeError(`ChartReady không hỗ trợ trường '${key}'.`);
  for (const key of ['year', 'month', 'day', 'hourBranch']) {
    if (!Number.isInteger(input[key])) throw new TypeError(`ChartReady.${key} phải là số nguyên.`);
  }
  if ((input.year as number) < 1900 || (input.year as number) > 2050) throw new RangeError('Phạm vi năm hiện hỗ trợ: 1900–2050.');
  const probe = new Date(Date.UTC(input.year as number, (input.month as number) - 1, input.day as number));
  if (probe.getUTCFullYear() !== input.year || probe.getUTCMonth() + 1 !== input.month || probe.getUTCDate() !== input.day) {
    throw new RangeError('Ngày dương lịch không tồn tại.');
  }
  if ((input.hourBranch as number) < 0 || (input.hourBranch as number) > 11) throw new RangeError('hourBranch là chỉ số chi giờ 0–11.');
  if (input.gender !== 'male' && input.gender !== 'female') throw new TypeError('gender phải là male hoặc female.');
}

/** Pure observable natal result. No await between upstream global selection and generation. */
export function computeNatal(input: ChartReady, profile: Profile, options: { includeFacts?: boolean } = {}) {
  validateChartReady(input);
  validateProfile(profile);
  setBrightnessSchool(profile.brightnessSchool);
  let natal: NatalChart;
  try {
    const chart = generateChart({
      year: input.year, month: input.month, day: input.day, hour: input.hourBranch, gender: input.gender,
    }, { leapMonth: profile.leapMonth });
    const { currentAge, currentDaXianIndex, analysisCacheProfile, palaces, ...rest } = chart;
    natal = {
      ...rest,
      palaces: palaces.map(({ isCurrentDaXian, ...palace }) => palace).sort((a, b) => a.branch - b.branch),
    };
  } finally {
    setBrightnessSchool('default');
  }
  // Metadata enters the digest too: identical profile IDs with different values must not collide.
  const identity = { schemaVersion: 'tuvi.natal.v0', engine: manifest.snapshotSha256, profile, natal };
  const result = {
    schemaVersion: 'tuvi.natal.v0' as const,
    hash: canonicalHash(identity),
    profile: { ...profile },
    provenance: {
      repository: manifest.repository,
      sourceCommit: manifest.sourceCommit,
      vendorSnapshotSha256: manifest.snapshotSha256,
      dependencies: manifest.engineDependencies,
      calendar: 'upstream-chinese-lunar' as const,
    },
    natal,
  };
  if (options.includeFacts === false) return result;
  return { ...result, facts: buildFacts(natal), relations: buildRelations(natal), labels: buildLabels(natal) };
}
