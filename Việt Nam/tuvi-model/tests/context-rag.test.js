'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../tuvi-core');
const { buildAnonymizedContext, assertNoBirthPii, buildPrompts, loadCorpus } = require('../src');

test('buildAnonymizedContext, scanQuestionForBirthPii và assertNoBirthPii chặn cả ngày giờ không số 0 đầu, câu hỏi tự do và thu gọn prompt < 10 KB', () => {
  const profile = core.getProfile('thienky-candidate');
  /** @type {import('../../tuvi-core').BirthInput} */
  const birth = {
    calendar: 'solar',
    date: '1990-03-05',
    time: '06:00',
    tz: 'Asia/Ho_Chi_Minh',
    place: { lat: 10.7769, lon: 106.7009 },
    gender: 'female',
  };
  const norm = core.normalizeBirth(birth, profile);
  assert.equal(norm.status, 'ok');
  const natalResult = {
    ...core.computeNatal(norm.chart, profile),
    normalization: {
      input: birth,
      chart: norm.chart,
      audit: norm.audit,
      warnings: ['CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER'],
    },
  };

  // Tamper client facts to verify buildAnonymizedContext recomputes authoritative facts from raw natal
  const tampered = { ...natalResult, facts: [{ id: 'FAKE.FACT', kind: 'chart', subjectId: 'X', predicate: 'Y' }] };
  const ctx = buildAnonymizedContext(tampered, { question: 'Trọng tâm cung Quan Lộc là gì?' });
  assert.equal(ctx.privacy.birthDataStripped, true);
  assert.equal(ctx.privacy.structuralReidentificationRisk, 'non-zero');
  assert.equal(ctx.focusPalaceId, 'PALACE.GUANLU');
  assert.ok(ctx.facts.every(f => f.id !== 'FAKE.FACT'));
  assert.ok(ctx.promptFacts.length < ctx.facts.length);

  const { systemPrompt, userPrompt } = buildPrompts(ctx);
  const totalPromptChars = systemPrompt.length + userPrompt.length;
  // Compact prompt must stay well under 10 KB (down from ~62.6 KB!) AND include profile + warnings
  assert.ok(totalPromptChars < 10_000, `Expected prompt < 10000 chars, got ${totalPromptChars}`);
  assert.match(systemPrompt, /thienky-candidate/);
  assert.match(systemPrompt, /candidate/);
  assert.match(systemPrompt, /XD2/);
  assert.match(userPrompt, /CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER/);

  const serialized = `${JSON.stringify(ctx)}\n${systemPrompt}\n${userPrompt}`;
  assertNoBirthPii(serialized, natalResult, ['Nguyễn Thị Bảo Mật']);

  // Free-text question containing unpadded birth date / spoken time MUST be rejected immediately
  assert.throws(
    () => buildAnonymizedContext(natalResult, { question: 'Tôi sinh ngày 5/3/1990 lúc 6h sáng thì sao?' }),
    err => /** @type {any} */ (err).code === 'PRIVACY_VIOLATION',
  );
  assert.throws(
    () => buildAnonymizedContext(natalResult, { question: 'Mình sinh năm 1990 cần lưu ý gì?' }),
    err => /** @type {any} */ (err).code === 'PRIVACY_VIOLATION',
  );

  // Verify PII guard catches padded, unpadded, spoken time, timezone, and name
  assert.throws(() => assertNoBirthPii('Ngày sinh: 5/3/1990', natalResult), /quyền riêng tư|PRIVACY/i);
  assert.throws(() => assertNoBirthPii('Sinh lúc 6h sáng', natalResult), /quyền riêng tư|PRIVACY/i);
  assert.throws(() => assertNoBirthPii('Múi giờ Asia/Ho_Chi_Minh', natalResult), /quyền riêng tư|PRIVACY/i);
  assert.throws(() => assertNoBirthPii('Đương số Nguyễn Thị Bảo Mật', natalResult, ['Nguyễn Thị Bảo Mật']), /quyền riêng tư|PRIVACY/i);

  // Video timestamp [00:06:00] must NOT false-positive as birth time 06:00
  assert.doesNotThrow(() => assertNoBirthPii('Bài 04 Thượng.md [00:06:00]', natalResult));

  const roundedNatal = {
    ...natalResult,
    normalization: { ...natalResult.normalization, input: { ...birth, place: { lat: 10, lon: 106 } } },
  };
  // Decadal ages and branch indexes must not be mistaken for integer coordinates.
  assert.doesNotThrow(() => assertNoBirthPii(serialized, roundedNatal));
  assert.throws(() => assertNoBirthPii(JSON.stringify({ lat: 10, lon: 106 }), roundedNatal), /freeText\.coordinates/);
  assert.throws(() => buildAnonymizedContext(roundedNatal, { question: 'Tọa độ 10, 106 có ảnh hưởng gì?' }), /freeText\.coordinates/);
  assert.throws(() => assertNoBirthPii('10.7769', natalResult), /normalization\.input\.place/);
});

test('RAG nạp đủ 1.848 câu giảng từ 16 file Thiên Kỷ và truy xuất đúng chủ đề', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.lectureCount, 16);
  assert.equal(corpus.quotes.length, 1848);
  assert.ok(corpus.quotes.every(q => q.id.startsWith('TK.') && q.url.startsWith('https://www.bilibili.com/')));

  const spt = corpus.retrieve({ question: 'Thất Sát Phá Quân Tham Lang tính cách võ quan', topK: 5 });
  assert.equal(spt.length, 5);
  assert.ok(spt.some(q => /Thất Sát|Phá Quân|Tham Lang/.test(q.text)));

  const lpk = corpus.retrieve({ question: 'Lộc phùng Kỵ và Khoa phùng Kỵ luận giải thế nào', topK: 5 });
  assert.ok(lpk.some(q => /Lộc phùng Kỵ|Khoa phùng Kỵ/.test(q.text)));

  const profile = core.getProfile('thienky-candidate');
  const natalResult = core.computeNatal({ year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' }, profile);
  const ctx = buildAnonymizedContext(natalResult);
  const hits = corpus.retrieve({ context: ctx, topK: 6 });
  assert.equal(hits.length, 6);
  assert.ok(hits.some(q => /Thiên Lương/i.test(`${q.text} ${q.tags}`)));
});
