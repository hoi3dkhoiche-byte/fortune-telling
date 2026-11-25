const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function createMockDocument() {
  class MockElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.className = '';
      this.textContent = '';
      this.children = [];
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    collectText() {
      return [this.textContent, ...this.children.map(child => child.collectText())].filter(Boolean).join('\n');
    }
  }
  return {
    createElement: tag => new MockElement(tag),
  };
}

test('translateWarning dịch đầy đủ các mã chuẩn hóa và định dạng ngày dd/mm/yyyy', async () => {
  const { translateWarning } = await import('../public/js/verification.js');
  assert.match(translateWarning('CALENDAR_DIVERGENCE_CHOICE_REQUIRED'), /lịch Việt.*lịch Trung/i);
  assert.match(translateWarning('CALENDAR_DIVERGENCE_NO_ADAPTER'), /lịch Trung Quốc/i);
  assert.match(translateWarning('CALENDAR_DIVERGENCE_CHINESE_EXPLICIT'), /quy ước lịch Trung/i);
  assert.match(translateWarning('CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER'), /adapter lịch Việt/i);
  assert.match(translateWarning('VIETNAMESE_CALENDAR_MODEL'), /mô hình thiên văn UTC\+7/i);
  assert.match(translateWarning('SHIFTED_DATE_DIVERGENCE'), /sau hiệu chỉnh/i);
  assert.equal(
    translateWarning('SCENARIO_BLOCKED_DIVERGENCE:1968-01-29'),
    'Phương án ngày 29/01/1968 bị chặn do lịch Việt và lịch Trung khác nhau.',
  );
  assert.equal(translateWarning('Cảnh báo tùy chỉnh'), 'Cảnh báo tùy chỉnh');
});

test('validateImportedChart từ chối JSON nông/hỏng và chấp nhận file lá số đủ cấu trúc', async () => {
  const { validateImportedChart } = await import('../public/js/verification.js');
  for (const invalid of [
    null,
    'text',
    [],
    {},
    { natal: {} },
    { natal: { palaces: [] } },
    { schemaVersion: 'tuvi.natal.v0', natal: {} },
    { schemaVersion: 'tuvi.natal.v0', natal: { palaces: [] } },
    {
      schemaVersion: 'tuvi.natal.v0',
      natal: {
        mingGongBranch: 0,
        shenGongBranch: 0,
        palaces: Array.from({ length: 12 }, () => ({ branch: 0, stars: [] })),
      },
    },
    {
      schemaVersion: 'tuvi.natal.v0',
      natal: {
        mingGongBranch: 0,
        shenGongBranch: 0,
        palaces: Array.from({ length: 12 }, (_, branch) => ({ branch, stars: null })),
      },
    },
  ]) {
    assert.throws(() => validateImportedChart(invalid));
  }

  const valid = JSON.parse(readFileSync(path.resolve(__dirname, '../../tuvi-core/examples/birth.output.json'), 'utf8'));
  const validated = validateImportedChart(valid);
  assert.equal(validated.importedFromFile, true);
  assert.equal(validated.schemaVersion, valid.schemaVersion);
  assert.equal(validated.natal.palaces.length, 12);

  const legacy = JSON.parse(readFileSync(path.resolve(__dirname, '../public/sample-data.json'), 'utf8'));
  assert.equal(legacy.schemaVersion, undefined);
  assert.equal(validateImportedChart(legacy).importedFromFile, true);
});

test('validateImportedChart chặn dữ liệu lồng sai trước khi chuyển vào màn lá số', async () => {
  const { validateImportedChart } = await import('../public/js/verification.js');
  const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../../tuvi-core/examples/birth.output.json'), 'utf8'));
  /** @type {Array<[(data: any) => void, RegExp]>} */
  const cases = [
    [data => { data.natal.palaces[0].stars[0] = null; }, /dữ liệu sao/i],
    [data => { data.natal.palaces[0].borrowedStars = {}; }, /dữ liệu sao/i],
    [data => { data.labels = 'invalid'; }, /nhãn cung/i],
    [data => { data.labels = []; }, /nhãn cung/i],
    [data => { data.labels.palaces[0] = null; }, /nhãn cung/i],
    [data => { data.labels.palaces[0].stars[0].brightness.labelVi = 123; }, /nhãn cung/i],
    [data => { data.relations[0].opposite = null; }, /quan hệ cung/i],
    [data => { data.relations[0].trine[0] = null; }, /quan hệ cung/i],
    [data => { data.facts[0] = null; }, /danh sách dữ kiện/i],
    [data => { data.normalization.audit = {}; }, /thông tin kiểm chứng/i],
    [data => { data.normalization.audit[0] = null; }, /thông tin kiểm chứng/i],
    [data => { data.normalization.warnings = { length: 1 }; }, /thông tin kiểm chứng/i],
    [data => {
      data.displayNatal = structuredClone(data.natal);
      data.natal.palaces[0].stars[0] = null;
    }, /dữ liệu sao/i],
  ];
  for (const [mutate, message] of cases) {
    const data = structuredClone(fixture);
    mutate(data);
    assert.throws(() => validateImportedChart(data), message);
  }
});

test('getBlockedScenarioGuidance chỉ dẫn chọn quy ước lịch khi chưa chọn và trả null khi đã chọn tường minh', async () => {
  const { getBlockedScenarioGuidance } = await import('../public/js/verification.js');
  const blockedResult = {
    audit: [{ step: 'blocked-scenarios', data: { blocked: [{ year: 1968, month: 1, day: 29, hourBranch: 0, gender: 'male' }] } }],
    warnings: ['SCENARIO_BLOCKED_DIVERGENCE:1968-01-29'],
  };

  assert.equal(getBlockedScenarioGuidance({ audit: [], warnings: [] }, undefined), null);

  const defaultGuidance = getBlockedScenarioGuidance(blockedResult, undefined);
  assert.ok(defaultGuidance);
  assert.equal(defaultGuidance.canOpenConvention, true);
  assert.match(defaultGuidance.message, /Tùy chọn nâng cao/);
  assert.match(defaultGuidance.message, /Lịch Việt Nam/);
  assert.match(defaultGuidance.message, /Lịch Trung Quốc/);

  assert.equal(getBlockedScenarioGuidance(blockedResult, 'vietnamese'), null);
  assert.equal(getBlockedScenarioGuidance(blockedResult, 'chinese'), null);
});

test('buildVerification gắn nhãn chưa kiểm tra lại cho file mở lên và dịch bước blocked-scenarios', async () => {
  const { buildVerification, validateImportedChart } = await import('../public/js/verification.js');
  const prevDoc = globalThis.document;
  globalThis.document = /** @type {any} */ (createMockDocument());
  try {
    const valid = JSON.parse(readFileSync(path.resolve(__dirname, '../../tuvi-core/examples/birth.output.json'), 'utf8'));
    const imported = validateImportedChart(valid);
    const importedEl = /** @type {any} */ (buildVerification(imported));
    const importedText = importedEl.collectText();
    assert.match(importedText, /Mở từ file · Chưa kiểm tra lại/);
    assert.match(importedText, /chưa kiểm tra lại bằng máy chủ/);
    assert.match(importedText, /Mã kiểm tra lá số \(trong file · chưa kiểm tra lại\)/);
    assert.match(importedText, /Nguồn và phiên bản \(trong file · chưa kiểm tra lại\)/);

    const engineEl = /** @type {any} */ (buildVerification({
      warnings: ['SCENARIO_BLOCKED_DIVERGENCE:1968-01-29'],
      audit: [{ step: 'blocked-scenarios', data: { blocked: [{ year: 1968, month: 1, day: 29, hourBranch: 0, gender: 'male' }] } }],
    }));
    const engineText = engineEl.collectText();
    assert.doesNotMatch(engineText, /chưa kiểm tra lại/);
    assert.match(engineText, /Phương án ngày 29\/01\/1968 bị chặn/);
    assert.match(engineText, /Phương án bị chặn do lịch khác nhau/);
  } finally {
    globalThis.document = prevDoc;
  }
});
