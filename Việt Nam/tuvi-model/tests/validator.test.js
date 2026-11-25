'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../tuvi-core');
const { validateInterpretation, INTERPRETATION_SCHEMA_VERSION } = require('../src');

function getBaselineNatal() {
  const profile = core.getProfile('thienky-candidate');
  const norm = core.normalizeBirth(
    { calendar: 'solar', date: '1990-01-01', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profile,
  );
  assert.equal(norm.status, 'ok');
  return /** @type {any} */ (core.computeNatal(norm.chart, profile));
}

function makeValidInterpretation(natal) {
  const mingFact = natal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
  const tianliangFact = natal.facts.find(f => f.subjectId === 'STAR.TIANLIANG' && f.objectId === 'PALACE.MING');
  return {
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    summary: 'Cung Mệnh tại Mùi có Thiên Lương tọa thủ Mệnh.',
    reasoningSteps: ['Bước 1: Quét Mệnh Thân tại Mùi có Thiên Lương.'],
    claims: [
      {
        id: 'CLAIM.1',
        category: 'menh-than',
        statement: 'Thiên Lương tọa thủ Mệnh tại cung Mùi.',
        factIds: [mingFact.id, tianliangFact.id],
        quoteIds: ['TK.03T.001'],
        confidence: 'high',
      },
    ],
    actionGuidance: ['Giữ sự chính trực, không mê tín hay cúng bái.'],
    disclaimer: 'Tham khảo học thuật.',
  };
}

test('validateInterpretation chấp nhận phản hồi hợp lệ khớp 100% facts và trích dẫn', () => {
  const natal = getBaselineNatal();
  const response = makeValidInterpretation(natal);
  const report = validateInterpretation(response, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.metrics.claimCount, 1);
  assert.equal(report.metrics.groundedClaimCount, 1);
  assert.equal(report.metrics.contradictionCount, 0);
  assert.equal(report.metrics.doctrineViolationCount, 0);
});

test('validateInterpretation chặn schema sai, factId bịa và quoteId bịa', () => {
  const natal = getBaselineNatal();

  const badSchema = validateInterpretation({ summary: 'thiếu trường' }, natal);
  assert.equal(badSchema.valid, false);
  assert.ok(badSchema.errors.some(e => e.code === 'SCHEMA_INVALID'));

  const badFact = makeValidInterpretation(natal);
  badFact.claims[0].factIds = ['STAR.FAKE@PALACE.MING'];
  const badFactReport = validateInterpretation(badFact, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(badFactReport.valid, false);
  assert.ok(badFactReport.errors.some(e => e.code === 'UNKNOWN_FACT_ID'));

  const badQuote = makeValidInterpretation(natal);
  badQuote.claims[0].quoteIds = ['TK.99X.999'];
  const badQuoteReport = validateInterpretation(badQuote, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(badQuoteReport.valid, false);
  assert.ok(badQuoteReport.errors.some(e => e.code === 'UNKNOWN_QUOTE_ID'));
});

test('validateInterpretation phát hiện ảo giác vị trí sao, Mệnh vô chính diệu sai và Tứ Hóa sai', () => {
  const natal = getBaselineNatal();

  // 1. Hallucinated major star in Mệnh (Tử Vi is NOT in Mệnh for 1990-01-01 12:30)
  const wrongStar = makeValidInterpretation(natal);
  wrongStar.claims[0].statement = 'Tử Vi tọa thủ Mệnh giúp quyền uy hiển hách.';
  const wrongStarReport = validateInterpretation(wrongStar, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(wrongStarReport.valid, false);
  assert.ok(wrongStarReport.errors.some(e => e.code === 'STAR_PALACE_CONTRADICTION'));

  // 2. Falsely claims Mệnh vô chính diệu when Thiên Lương sits in Mệnh
  const wrongEmpty = makeValidInterpretation(natal);
  wrongEmpty.claims[0].statement = 'Lá số này thuộc thế Mệnh vô chính diệu.';
  const wrongEmptyReport = validateInterpretation(wrongEmpty, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(wrongEmptyReport.valid, false);
  assert.ok(wrongEmptyReport.errors.some(e => e.code === 'EMPTY_MING_CONTRADICTION'));

  // 3. Falsely claims Tử Vi Hóa Kỵ (for Kỷ year, Văn Khúc Hóa Kỵ, NOT Tử Vi!)
  const wrongSiHua = makeValidInterpretation(natal);
  wrongSiHua.claims[0].statement = 'Trong lá số có Tử Vi Hóa Kỵ gây trắc trở.';
  const wrongSiHuaReport = validateInterpretation(wrongSiHua, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(wrongSiHuaReport.valid, false);
  assert.ok(wrongSiHuaReport.errors.some(e => e.code === 'SIHUA_CONTRADICTION'));

  // 4. Borrowing / aspect mention must NOT trigger false-positive placement contradiction
  const borrowingOk = makeValidInterpretation(natal);
  borrowingOk.claims[0].statement = 'Cung Thiên Di không có chính tinh nên mượn Thiên Lương tọa thủ Mệnh từ đối cung chiếu về.';
  const borrowingReport = validateInterpretation(borrowingOk, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(borrowingReport.valid, true, JSON.stringify(borrowingReport.errors));
});

test('validateInterpretation chặn khuyến nghị mê tín/cúng bái nhưng cho phép câu bài trừ mê tín', () => {
  const natal = getBaselineNatal();

  const superstitious = makeValidInterpretation(natal);
  superstitious.actionGuidance.push('Nên đi cúng sao giải hạn và mua bùa bình an đầu năm.');
  const badReport = validateInterpretation(superstitious, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(badReport.valid, false);
  assert.ok(badReport.errors.some(e => e.code === 'DOCTRINE_SUPERSTITION'));

  const rational = makeValidInterpretation(natal);
  rational.actionGuidance = ['Tuyệt đối không cúng sao giải hạn, không dùng bùa chú; hãy cải vận bằng hành vi thực tế.'];
  const okReport = validateInterpretation(rational, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(okReport.valid, true, JSON.stringify(okReport.errors));
});
