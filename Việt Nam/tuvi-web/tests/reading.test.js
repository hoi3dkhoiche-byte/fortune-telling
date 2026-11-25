const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { computeNatal, getProfile, normalizeBirth } = require('../../tuvi-core');

test('màn dữ kiện dùng các fact thật của core và giữ đúng sao mượn', async () => {
  const { buildFactSummary } = await import('../public/js/reading.js');
  const profile = getProfile('thienky-candidate');
  /** @type {import('../../tuvi-core').BirthInput} */
  const birth = { calendar: 'solar', date: '1990-01-06', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'male' };
  const normalized = normalizeBirth(birth, profile);
  assert.equal(normalized.status, 'ok');
  if (normalized.status !== 'ok') throw new Error('expected ok');
  const result = computeNatal(normalized.chart, profile);
  if (!('facts' in result)) throw new Error('expected facts');
  const groups = buildFactSummary(result);
  const rows = groups.flatMap(group => group.rows);
  assert.ok(rows.some(row => row.text === 'Mệnh vô chính diệu'));
  assert.ok(rows.some(row => row.text === 'Mượn Thiên Lương từ cung Thiên Di'));
  const menhGroup = groups.find(group => group.title === 'Mệnh, Thân và Cục');
  assert.ok(menhGroup);
  const menhTexts = menhGroup.rows.map(row => row.text);
  assert.ok(menhTexts[0].startsWith('Mệnh tại '));
  assert.ok(menhTexts.indexOf('Mệnh vô chính diệu') < menhTexts.findIndex(t => t.startsWith('Mượn ')));
  const sihuaGroup = groups.find(group => group.title === 'Tứ hóa bản mệnh');
  assert.ok(sihuaGroup);
  assert.deepEqual(
    sihuaGroup.rows.map(row => /Hóa (Lộc|Quyền|Khoa|Kỵ)/.exec(row.text)?.[1]),
    ['Lộc', 'Quyền', 'Khoa', 'Kỵ'],
  );
  assert.equal(rows.filter(row => row.id.startsWith('SIHUA.')).length, 4);
  assert.equal(rows.filter(row => row.id.startsWith('DAXIAN.')).length, 12);
  const ids = new Set(result.facts.map(fact => fact.id));
  assert.ok(rows.every(row => ids.has(row.id)));
  assert.deepEqual(buildFactSummary({ ...result, facts: [] }), []);
});

test('file JSON mẫu hiển thị dữ kiện dù chưa có displayNatal', async () => {
  const { buildFactSummary } = await import('../public/js/reading.js');
  const result = JSON.parse(readFileSync(path.resolve(__dirname, '../../tuvi-core/examples/birth.output.json'), 'utf8'));
  const groups = buildFactSummary(result);
  const rows = groups.flatMap(group => group.rows);
  assert.ok(rows.some(row => /^Thiên Lương tọa thủ Mệnh/.test(row.text)));
  assert.ok(rows.some(row => /Hóa Kỵ tại/.test(row.text)));
});
