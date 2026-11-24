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
  assert.match(translateWarning('CALENDAR_DIVERGENCE_NO_ADAPTER'), /lịch Trung Quốc/i);
  assert.match(translateWarning('CALENDAR_DIVERGENCE_CHINESE_EXPLICIT'), /quy ước lịch Trung/i);
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
});

test('getBlockedScenarioGuidance chỉ dẫn mở lịch Trung hoặc báo rõ giới hạn lịch Việt', async () => {
  const { getBlockedScenarioGuidance } = await import('../public/js/verification.js');
  const blockedResult = {
    audit: [{ step: 'blocked-scenarios', data: { blocked: [{ year: 1968, month: 1, day: 29, hourBranch: 0, gender: 'male' }] } }],
    warnings: ['SCENARIO_BLOCKED_DIVERGENCE:1968-01-29'],
  };

  assert.equal(getBlockedScenarioGuidance({ audit: [], warnings: [] }, undefined), null);

  const defaultGuidance = getBlockedScenarioGuidance(blockedResult, undefined);
  assert.equal(defaultGuidance.canOpenChineseConvention, true);
  assert.match(defaultGuidance.message, /Tùy chọn nâng cao/);
  assert.match(defaultGuidance.message, /Lịch Trung Quốc/);

  const vnGuidance = getBlockedScenarioGuidance(blockedResult, 'vietnamese');
  assert.equal(vnGuidance.canOpenChineseConvention, false);
  assert.match(vnGuidance.message, /Lịch Việt Nam/);
  assert.match(vnGuidance.message, /không thể mở/);
});

test('buildVerification gắn nhãn chưa kiểm tra lại cho file mở lên và dịch bước blocked-scenarios', async () => {
  const { buildVerification, validateImportedChart } = await import('../public/js/verification.js');
  const prevDoc = globalThis.document;
  globalThis.document = createMockDocument();
  try {
    const valid = JSON.parse(readFileSync(path.resolve(__dirname, '../../tuvi-core/examples/birth.output.json'), 'utf8'));
    const imported = validateImportedChart(valid);
    const importedEl = buildVerification(imported);
    const importedText = importedEl.collectText();
    assert.match(importedText, /Mở từ file · Chưa kiểm tra lại/);
    assert.match(importedText, /chưa kiểm tra lại bằng máy chủ/);
    assert.match(importedText, /Mã kiểm tra lá số \(trong file · chưa kiểm tra lại\)/);
    assert.match(importedText, /Nguồn và phiên bản \(trong file · chưa kiểm tra lại\)/);

    const engineEl = buildVerification({
      warnings: ['SCENARIO_BLOCKED_DIVERGENCE:1968-01-29'],
      audit: [{ step: 'blocked-scenarios', data: { blocked: [{ year: 1968, month: 1, day: 29, hourBranch: 0, gender: 'male' }] } }],
    });
    const engineText = engineEl.collectText();
    assert.doesNotMatch(engineText, /chưa kiểm tra lại/);
    assert.match(engineText, /Phương án ngày 29\/01\/1968 bị chặn/);
    assert.match(engineText, /Phương án bị chặn do lịch khác nhau/);
  } finally {
    globalThis.document = prevDoc;
  }
});
