import type { NatalChart } from './types';
import { labelBranch, labelJu, labelPalace, labelStar, labelTransformation } from './i18n';

export type FactKind = 'placement' | 'transformation' | 'palace-relation' | 'palace-state' | 'decadal-range' | 'chart';

/** Structured chart claims, not natural-language judgments or predictions. */
export interface Fact {
  id: string;
  kind: FactKind;
  subjectId: string;
  predicate: string;
  objectId?: string;
  value?: string | number | boolean | number[];
  layer: 'natal';
  /** JSON Pointer relative to `natal`; generated from the actual input order. */
  sourcePath: string;
}

export interface RelatedPalace {
  id: string;
  branch: number;
}

export interface PalaceRelations {
  palaceId: string;
  branch: number;
  opposite: RelatedPalace;
  /** Two other palaces in the same trine, excluding the center. */
  trine: [RelatedPalace, RelatedPalace];
  /** Center plus the two trine palaces. */
  sanFang: [RelatedPalace, RelatedPalace, RelatedPalace];
  /** Center, the two trine palaces, then the opposite palace. */
  sanFangSiZheng: [RelatedPalace, RelatedPalace, RelatedPalace, RelatedPalace];
}

function indexedPalaces(natal: NatalChart) {
  if (natal.palaces.length !== 12) throw new RangeError('Facts require exactly 12 palaces.');
  const byBranch = new Map<number, { palace: NatalChart['palaces'][number]; index: number }>();
  const ids = new Set<string>();
  natal.palaces.forEach((palace, index) => {
    labelBranch(palace.branch); // validates integer range independently of array position
    if (byBranch.has(palace.branch)) throw new RangeError(`Duplicate palace branch: ${palace.branch}`);
    const id = labelPalace(palace.name).id;
    if (ids.has(id)) throw new RangeError(`Duplicate semantic palace id: ${id}`);
    ids.add(id);
    byBranch.set(palace.branch, { palace, index });
  });
  return byBranch;
}

export function buildRelations(natal: NatalChart): PalaceRelations[] {
  const byBranch = indexedPalaces(natal);
  const ref = (branch: number): RelatedPalace => {
    const record = byBranch.get(branch);
    if (!record) throw new RangeError(`Missing palace branch: ${branch}`);
    return { id: labelPalace(record.palace.name).id, branch };
  };
  return [...byBranch.keys()].sort((a, b) => a - b).map(branch => {
    const center = ref(branch);
    const a = ref((branch + 4) % 12);
    const b = ref((branch + 8) % 12);
    const opposite = ref((branch + 6) % 12);
    return {
      palaceId: center.id, branch, opposite,
      trine: [a, b], sanFang: [center, a, b], sanFangSiZheng: [center, a, b, opposite],
    };
  });
}

export function buildFacts(natal: NatalChart): Fact[] {
  const byBranch = indexedPalaces(natal);
  const facts: Fact[] = [];
  const add = (fact: Omit<Fact, 'layer'>) => facts.push({ ...fact, layer: 'natal' });
  const palaceIdAt = (branch: number) => {
    const record = byBranch.get(branch);
    if (!record) throw new RangeError(`Missing palace branch: ${branch}`);
    return labelPalace(record.palace.name).id;
  };

  add({ id: `CHART.MING@${labelBranch(natal.mingGongBranch).id}`, kind: 'chart', subjectId: 'CHART.MING', predicate: 'LOCATED_AT_BRANCH', objectId: labelBranch(natal.mingGongBranch).id, sourcePath: '/mingGongBranch' });
  add({ id: `CHART.SHEN@${palaceIdAt(natal.shenGongBranch)}`, kind: 'chart', subjectId: 'CHART.SHEN', predicate: 'LOCATED_IN', objectId: palaceIdAt(natal.shenGongBranch), sourcePath: '/shenGongBranch' });
  add({ id: `CHART.JU.${labelJu(natal.wuxingJu).id}`, kind: 'chart', subjectId: 'CHART.NATAL', predicate: 'HAS_FIVE_ELEMENTS_CLASS', objectId: labelJu(natal.wuxingJu).id, value: natal.wuxingJu, sourcePath: '/wuxingJu' });
  if (natal.mingZhu) add({ id: `CHART.MINGZHU.${labelStar(natal.mingZhu).id}`, kind: 'chart', subjectId: 'CHART.MINGZHU', predicate: 'IS_STAR', objectId: labelStar(natal.mingZhu).id, sourcePath: '/mingZhu' });
  if (natal.shenZhu) add({ id: `CHART.SHENZHU.${labelStar(natal.shenZhu).id}`, kind: 'chart', subjectId: 'CHART.SHENZHU', predicate: 'IS_STAR', objectId: labelStar(natal.shenZhu).id, sourcePath: '/shenZhu' });

  for (const [branch, { palace, index }] of byBranch) {
    const palaceId = labelPalace(palace.name).id;
    const path = `/palaces/${index}`;
    add({ id: `${palaceId}@${labelBranch(branch).id}`, kind: 'placement', subjectId: palaceId, predicate: 'LOCATED_AT_BRANCH', objectId: labelBranch(branch).id, sourcePath: `${path}/branch` });
    const empty = !palace.stars.some(star => star.type === 'major');
    add({ id: `EMPTY.${palaceId}`, kind: 'palace-state', subjectId: palaceId, predicate: 'HAS_NO_MAJOR_STAR', value: empty, sourcePath: `${path}/stars` });
    palace.stars.forEach((star, starIndex) => {
      const starId = labelStar(star.name).id;
      const starPath = `${path}/stars/${starIndex}`;
      add({ id: `${starId}@${palaceId}`, kind: 'placement', subjectId: starId, predicate: 'LOCATED_IN', objectId: palaceId, sourcePath: starPath });
      // Upstream non-transformed stars may carry siHua: ''; this is not a fifth transformation.
      if (star.siHua) {
        const hua = labelTransformation(star.siHua);
        if (!hua.known) throw new RangeError(`Unknown natal transformation: ${star.siHua}`);
        add({ id: `${hua.id}.${starId.slice('STAR.'.length)}@${palaceId}`, kind: 'transformation', subjectId: starId, predicate: 'HAS_NATAL_TRANSFORMATION', objectId: hua.id, sourcePath: `${starPath}/siHua` });
      }
      if (star.brightnessRaw) {
        const codepoint = Array.from(star.brightnessRaw).map(char => char.codePointAt(0)!.toString(16).toUpperCase()).join('_');
        add({ id: `BRIGHTNESS.${starId}@${palaceId}.U${codepoint}`, kind: 'palace-state', subjectId: starId, predicate: 'HAS_BRIGHTNESS_AT_PALACE', objectId: palaceId, value: star.brightnessRaw, sourcePath: `${starPath}/brightnessRaw` });
      }
    });
    if (empty) {
      const opposite = byBranch.get((branch + 6) % 12)!;
      const oppositeId = labelPalace(opposite.palace.name).id;
      opposite.palace.stars.forEach((star, starIndex) => {
        if (star.type !== 'major') return;
        const starId = labelStar(star.name).id;
        add({ id: `BORROW.${starId}@${palaceId}.FROM.${oppositeId}`, kind: 'palace-state', subjectId: palaceId, predicate: 'BORROWS_OPPOSITE_MAJOR_STAR', objectId: starId, sourcePath: `/palaces/${opposite.index}/stars/${starIndex}` });
      });
    }
  }

  for (const relation of buildRelations(natal)) {
    const record = byBranch.get(relation.branch)!;
    const path = `/palaces/${record.index}/branch`;
    add({ id: `OPPOSITE.${relation.palaceId}@${relation.opposite.id}`, kind: 'palace-relation', subjectId: relation.palaceId, predicate: 'OPPOSITE_TO', objectId: relation.opposite.id, sourcePath: path });
    relation.trine.forEach(other => add({ id: `TRINE.${relation.palaceId}@${other.id}`, kind: 'palace-relation', subjectId: relation.palaceId, predicate: 'TRINE_WITH', objectId: other.id, sourcePath: path }));
    relation.sanFangSiZheng.forEach(other => add({ id: `SANFANGSIZHENG.${relation.palaceId}@${other.id}`, kind: 'palace-relation', subjectId: relation.palaceId, predicate: 'HAS_SANFANGSIZHENG_MEMBER', objectId: other.id, sourcePath: path }));
  }

  natal.daXians.forEach((range, index) => {
    const palaceId = palaceIdAt(range.palaceBranch);
    if (!Number.isInteger(range.startAge) || !Number.isInteger(range.endAge) || range.startAge > range.endAge) {
      throw new RangeError('Invalid decadal age range.');
    }
    add({ id: `DAXIAN.${palaceId}.${range.startAge}-${range.endAge}`, kind: 'decadal-range', subjectId: palaceId, predicate: 'HAS_DECADAL_AGE_RANGE', value: [range.startAge, range.endAge], sourcePath: `/daXians/${index}` });
  });

  const ids = new Set<string>();
  for (const fact of facts) {
    if (ids.has(fact.id)) throw new RangeError(`Duplicate semantic fact id: ${fact.id}`);
    ids.add(fact.id);
  }
  return facts.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
