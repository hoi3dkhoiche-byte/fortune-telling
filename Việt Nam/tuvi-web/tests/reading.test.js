const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { computeNatal, getProfile, normalizeBirth } = require('../../tuvi-core');

test('màn dữ kiện dùng các fact thật của core và giữ đúng sao mượn', async () => {
  const { buildFactSummary } = await import('../public/js/reading.js');
  const profile = getProfile('thienky-candidate');
  const birth = { calendar: 'solar', date: '1990-01-06', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'male' };
  const normalized = normalizeBirth(birth, profile);
  assert.equal(normalized.status, 'ok');
  const result = computeNatal(normalized.chart, profile);
  const rows = buildFactSummary(result).flatMap(group => group.rows);
  assert.ok(rows.some(row => row.text === 'Mệnh vô chính diệu'));
  assert.ok(rows.some(row => row.text === 'Mượn Thiên Lương từ cung Thiên Di'));
  assert.equal(rows.filter(row => row.id.startsWith('SIHUA.')).length, 4);
  assert.equal(rows.filter(row => row.id.startsWith('DAXIAN.')).length, 12);
  const ids = new Set(result.facts.map(fact => fact.id));
  assert.ok(rows.every(row => ids.has(row.id)));
  assert.deepEqual(buildFactSummary({ ...result, facts: [] }), []);
});

test('file JSON mẫu hiển thị dữ kiện dù chưa có displayNatal', async () => {
  const { buildFactSummary } = await import('../public/js/reading.js');
  const result = JSON.parse(readFileSync(path.resolve(__dirname, '../../tuvi-core/examples/birth.output.json'), 'utf8'));
  const rows = buildFactSummary(result).flatMap(group => group.rows);
  assert.ok(rows.some(row => /^Thiên Lương tọa thủ Mệnh/.test(row.text)));
  assert.ok(rows.some(row => /Hóa Kỵ tại/.test(row.text)));
});
