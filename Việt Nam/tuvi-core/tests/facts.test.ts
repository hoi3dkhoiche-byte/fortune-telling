import assert from 'node:assert/strict';
import test from 'node:test';
import type { NatalChart } from '../src/types';
import { buildFacts, buildRelations } from '../src/facts';
import { buildLabels, decorateNatal, labelBranch, labelPalace, labelStar, labelTransformation } from '../src/i18n';
import glossary from '../i18n/vi.json';

/** Synthetic graph fixture: tests the adapter's relations, not astrological correctness. */
function graphFixture(): NatalChart {
  const palaceNames = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '仆役', '官禄', '田宅', '福德', '父母'];
  return {
    birthInfo: { year: 1990, month: 1, day: 1, hour: 6, gender: 'male' },
    lunarInfo: { lunarYear: 1989, lunarMonth: 12, lunarDay: 5, yearStem: 5, yearBranch: 5, isLeapMonth: false },
    mingGongBranch: 0, shenGongBranch: 4, wuxingJu: 2, wuxingJuName: '水二局', ziweiPos: 2,
    palaces: palaceNames.map((name, branch) => ({
      name, branch, stem: branch % 10,
      stars: branch === 6
        ? [{ name: '七杀', type: 'major' as const }]
        : branch === 8
          ? [{ name: '天梁', type: 'major' as const, siHua: '科' as const, brightnessRaw: '庙' as const }]
          : [],
    })),
    daXians: [{ startAge: 2, endAge: 11, palaceBranch: 0, palaceName: '命宫' }],
  };
}

test('14 major stars have the selected Hán-Việt names and distinct semantic IDs', () => {
  const expected: Record<string, string> = {
    紫微: 'Tử Vi', 天机: 'Thiên Cơ', 太阳: 'Thái Dương', 武曲: 'Vũ Khúc', 天同: 'Thiên Đồng', 廉贞: 'Liêm Trinh',
    天府: 'Thiên Phủ', 太阴: 'Thái Âm', 贪狼: 'Tham Lang', 巨门: 'Cự Môn', 天相: 'Thiên Tướng', 天梁: 'Thiên Lương', 七杀: 'Thất Sát', 破军: 'Phá Quân',
  };
  const ids: string[] = [];
  for (const [source, label] of Object.entries(expected)) {
    assert.equal(labelStar(source).labelVi, label);
    assert.equal(labelStar(source).known, true);
    ids.push(labelStar(source).id);
  }
  assert.equal(new Set(ids).size, 14);
  assert.equal(labelStar('左辅').labelVi, 'Tả Phụ');
  assert.equal(labelPalace('子女').labelVi, 'Tử Tức');
  assert.equal(labelTransformation('科').labelVi, 'Hóa Khoa');
});

test('every glossary source has a unique stable ID; similar transliterations stay distinct', () => {
  for (const entries of [glossary.stars, glossary.palaces, glossary.transformations]) {
    const ids = Object.values(entries).map(value => value.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(id => /^[A-Z][A-Z0-9_.]*$/.test(id)));
  }
  assert.notEqual(labelStar('天钺').id, labelStar('天月').id);
  assert.notEqual(labelStar('天府').id, labelStar('天福').id);
  assert.notEqual(labelStar('蜚廉').id, labelStar('飞廉').id);
});

test('unknown names preserve source text and are never silently translated', () => {
  const first = labelStar('未收录星');
  assert.equal(first.known, false);
  assert.equal(first.labelVi, '未收录星');
  assert.deepEqual(first, labelStar('未收录星'));
  assert.notEqual(first.id, labelStar('未收录星二').id);
  assert.equal(labelStar('__proto__').known, false);
  assert.equal(labelStar('toString').known, false);
  const chart = graphFixture();
  chart.palaces[0].stars.push({ name: '未收录星', type: 'minor' });
  assert.deepEqual(buildLabels(chart).unknownNames, ['未收录星']);
});

test('opposition and trines use branch values even when palace arrays are reordered', () => {
  const chart = graphFixture();
  chart.palaces.reverse();
  const relations = buildRelations(chart);
  const ming = relations.find(value => value.palaceId === 'PALACE.MING')!;
  assert.equal(ming.opposite.branch, 6);
  assert.equal(ming.opposite.id, 'PALACE.QIANYI');
  assert.deepEqual(ming.trine.map(value => value.branch), [4, 8]);
  assert.deepEqual(ming.sanFang.map(value => value.branch), [0, 4, 8]);
  assert.deepEqual(ming.sanFangSiZheng.map(value => value.branch), [0, 4, 8, 6]);
  for (const relation of relations) {
    assert.equal(new Set(relation.sanFangSiZheng.map(value => value.branch)).size, 4);
    const inverse = relations.find(value => value.branch === relation.opposite.branch)!;
    assert.equal(inverse.opposite.branch, relation.branch);
  }
});

test('empty-palace borrowing is separate from real star placement', () => {
  const facts = buildFacts(graphFixture());
  assert.ok(facts.some(fact => fact.id === 'STAR.QISHA@PALACE.QIANYI' && fact.predicate === 'LOCATED_IN'));
  assert.ok(!facts.some(fact => fact.id === 'STAR.QISHA@PALACE.MING'));
  const borrowed = facts.find(fact => fact.id === 'BORROW.STAR.QISHA@PALACE.MING.FROM.PALACE.QIANYI');
  assert.equal(borrowed?.predicate, 'BORROWS_OPPOSITE_MAJOR_STAR');
  assert.equal(borrowed?.objectId, 'STAR.QISHA');
  assert.equal(borrowed?.sourcePath, '/palaces/6/stars/0');
  assert.equal(facts.find(fact => fact.id === 'EMPTY.PALACE.MING')?.value, true);
  assert.equal(facts.find(fact => fact.id === 'EMPTY.PALACE.QIANYI')?.value, false);
});

test('natal transformations and structural decadal ages are typed, without fly-star inference', () => {
  const chart = graphFixture();
  chart.palaces[8].selfSihua = [{ siHua: '忌', starName: '天梁' }];
  chart.daXians[0].siHua = { stemIndex: 0, stemName: '甲', lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' };
  const facts = buildFacts(chart);
  const transformations = facts.filter(fact => fact.kind === 'transformation');
  assert.equal(transformations.length, 1);
  assert.deepEqual(transformations[0], {
    id: 'SIHUA.KE.TIANLIANG@PALACE.GUANLU', kind: 'transformation',
    subjectId: 'STAR.TIANLIANG', predicate: 'HAS_NATAL_TRANSFORMATION', objectId: 'SIHUA.KE',
    sourcePath: '/palaces/8/stars/0/siHua', layer: 'natal',
  });
  assert.deepEqual(facts.find(fact => fact.kind === 'decadal-range')?.value, [2, 11]);
  assert.ok(facts.every(fact => fact.layer === 'natal'));
});

test('semantic claims and IDs are stable under source-array reordering', () => {
  const original = graphFixture();
  const reordered = structuredClone(original);
  reordered.palaces.reverse();
  const withoutPaths = (chart: NatalChart) => buildFacts(chart).map(({ sourcePath, ...claim }) => claim);
  assert.deepEqual(withoutPaths(original), withoutPaths(reordered));
  const facts = buildFacts(reordered);
  assert.equal(new Set(facts.map(fact => fact.id)).size, facts.length);
  assert.equal(facts.find(fact => fact.id === 'STAR.QISHA@PALACE.QIANYI')?.sourcePath, '/palaces/5/stars/0');
});

test('decorating labels preserves raw data and does not mutate the chart', () => {
  const chart = graphFixture();
  const before = structuredClone(chart);
  const decorated = decorateNatal(chart);
  assert.deepEqual(chart, before);
  assert.equal(decorated.palaces[8].stars[0].name, '天梁');
  assert.equal(decorated.palaces[8].stars[0].labelVi, 'Thiên Lương');
  assert.equal(decorated.palaces[8].stars[0].siHuaLabelVi, 'Hóa Khoa');
  assert.equal(decorated.palaces[8].stars[0].brightnessLabelVi, 'Miếu');
  assert.equal(decorated.wuxingJuLabelVi, 'Thủy Nhị Cục');
});

test('duplicate branch/name/star identities fail instead of producing ambiguous fact IDs', () => {
  const duplicateBranch = graphFixture();
  duplicateBranch.palaces[1].branch = 0;
  assert.throws(() => buildFacts(duplicateBranch), /Duplicate palace branch/);
  const duplicatePalace = graphFixture();
  duplicatePalace.palaces[1].name = '命宫';
  assert.throws(() => buildFacts(duplicatePalace), /Duplicate semantic palace id/);
  const duplicateStar = graphFixture();
  duplicateStar.palaces[6].stars.push({ name: '七杀', type: 'major' });
  assert.throws(() => buildFacts(duplicateStar), /Duplicate semantic fact id/);
  assert.throws(() => labelBranch(12), /Branch index/);
});
