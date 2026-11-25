'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../tuvi-core');
const { buildAnonymizedContext, assertNoBirthPii, buildPrompts, loadCorpus } = require('../src');

test('buildAnonymizedContext và assertNoBirthPii loại bỏ hoàn toàn ngày giờ sinh, múi giờ, tọa độ và tên', () => {
  const profile = core.getProfile('thienky-candidate');
  /** @type {import('../../tuvi-core').BirthInput} */
  const birth = {
    calendar: 'solar',
    date: '1990-08-15',
    time: '06:00',
    tz: 'Asia/Ho_Chi_Minh',
    place: { lat: 10.7769, lon: 106.7009 },
    gender: 'female',
  };
  const norm = core.normalizeBirth(birth, profile);
  assert.equal(norm.status, 'ok');
  const natalResult = {
    ...core.computeNatal(norm.chart, profile),
    normalization: { input: birth, chart: norm.chart, audit: norm.audit, warnings: norm.warnings },
  };

  const ctx = buildAnonymizedContext(natalResult, { question: 'Sự nghiệp năm nay?' });
  assert.equal(ctx.privacy.birthDataStripped, true);
  assert.equal('birthInfo' in ctx, false);
  assert.equal('lunarInfo' in ctx, false);
  assert.equal('normalization' in ctx, false);
  assert.equal(ctx.palaces.length, 12);
  assert.ok(ctx.facts.length > 50);

  const { systemPrompt, userPrompt } = buildPrompts(ctx);
  const serialized = `${JSON.stringify(ctx)}\n${systemPrompt}\n${userPrompt}`;
  assertNoBirthPii(serialized, natalResult, ['Nguyễn Thị Bảo Mật']);

  // Verify PII guard catches accidental leakage
  assert.throws(() => assertNoBirthPii('Ngày sinh: 1990-08-15', natalResult), /quyền riêng tư/);
  assert.throws(() => assertNoBirthPii('Sinh lúc 06:00 giờ sáng', natalResult), /quyền riêng tư/);
  assert.throws(() => assertNoBirthPii('Múi giờ Asia/Ho_Chi_Minh', natalResult), /quyền riêng tư/);
  assert.throws(() => assertNoBirthPii('Đương số Nguyễn Thị Bảo Mật', natalResult, ['Nguyễn Thị Bảo Mật']), /quyền riêng tư/);

  // Video timestamp [00:06:00] must NOT false-positive as birth time 06:00
  assert.doesNotThrow(() => assertNoBirthPii('Bài 04 Thượng.md [00:06:00]', natalResult));
});

test('RAG nạp đủ 1.848 câu giảng từ 16 file Thiên Kỷ và truy xuất đúng chủ đề', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.lectureCount, 16);
  assert.equal(corpus.quotes.length, 1848);
  assert.ok(corpus.quotes.every(q => q.id.startsWith('TK.') && q.url.startsWith('https://www.bilibili.com/')));

  // Query for Thất Sát / Phá Quân / Tham Lang
  const spt = corpus.retrieve({ question: 'Thất Sát Phá Quân Tham Lang tính cách võ quan', topK: 5 });
  assert.equal(spt.length, 5);
  assert.ok(spt.some(q => /Thất Sát|Phá Quân|Tham Lang/.test(q.text)));

  // Query for Lộc phùng Kỵ / Khoa phùng Kỵ
  const lpk = corpus.retrieve({ question: 'Lộc phùng Kỵ và Khoa phùng Kỵ luận giải thế nào', topK: 5 });
  assert.ok(lpk.some(q => /Lộc phùng Kỵ|Khoa phùng Kỵ/.test(q.text)));

  // Query driven by an anonymized chart context (1990-01-01 Thiên Lương tại Mệnh)
  const profile = core.getProfile('thienky-candidate');
  const natalResult = core.computeNatal({ year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' }, profile);
  const ctx = buildAnonymizedContext(natalResult);
  const hits = corpus.retrieve({ context: ctx, topK: 6 });
  assert.equal(hits.length, 6);
  assert.ok(hits.some(q => /Thiên Lương/i.test(`${q.text} ${q.tags}`)));
});
