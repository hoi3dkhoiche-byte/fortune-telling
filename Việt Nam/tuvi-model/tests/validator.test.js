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
        assertions: [
          { subjectId: mingFact.subjectId, predicate: mingFact.predicate, objectId: mingFact.objectId },
          { subjectId: tianliangFact.subjectId, predicate: tianliangFact.predicate, objectId: tianliangFact.objectId },
        ],
        factIds: [mingFact.id, tianliangFact.id],
        quoteIds: ['TK.03T.001'],
        confidence: 'high',
      },
    ],
    actionGuidance: ['Giữ sự chính trực, không mê tín hay cúng bái.'],
    disclaimer: 'Tham khảo học thuật.',
  };
}

test('validateInterpretation chấp nhận phản hồi có cấu trúc assertions khớp facts và trích dẫn', () => {
  const natal = getBaselineNatal();
  const response = makeValidInterpretation(natal);
  const report = validateInterpretation(response, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.metrics.claimCount, 1);
  assert.equal(report.metrics.groundedClaimCount, 1);
  assert.equal(report.metrics.verifiedAssertionCount, 2);
  assert.equal(report.metrics.contradictionCount, 0);
  assert.equal(report.metrics.doctrineViolationCount, 0);
});

test('câu trực tiếp sai Mệnh, Cục hoặc khoảng tuổi đại hạn bị chặn dù assertions khớp', () => {
  const natal = getBaselineNatal();
  const quotes = [{ id: 'TK.03T.001' }];
  for (const [statement, code] of [
    ['Mệnh tại Dần.', 'MING_BRANCH_CONTRADICTION'],
    ['Cục trên lá số là Thủy Nhị Cục.', 'FIVE_ELEMENTS_CLASS_CONTRADICTION'],
    ['Đại hạn tại Mệnh từ 20 đến 30 tuổi.', 'DECADAL_RANGE_CONTRADICTION'],
    ['Đại hạn ở cung Mệnh 20–30 tuổi.', 'DECADAL_RANGE_CONTRADICTION'],
  ]) {
    const response = makeValidInterpretation(natal);
    response.claims[0].statement = statement;
    const report = validateInterpretation(response, natal, quotes);
    assert.equal(report.valid, false, statement);
    assert.ok(report.errors.some(error => error.code === code && error.path === '$.claims[0].statement'));
  }
  const [start, end] = natal.facts.find(f => f.predicate === 'HAS_DECADAL_AGE_RANGE' && f.subjectId === 'PALACE.MING').value;
  const correct = makeValidInterpretation(natal);
  correct.summary = 'Mệnh tại Mùi. Cục trên lá số là Thổ Ngũ Cục. Đại hạn ở cung Mệnh ' + start + '–' + end + ' tuổi.';
  assert.equal(validateInterpretation(correct, natal, quotes).valid, true);
});

test('validateInterpretation chặn thiếu assertions, assertion sai, factId thừa và quoteId bịa (kể cả khi allowedQuotes rỗng)', () => {
  const natal = getBaselineNatal();
  const juFact = natal.facts.find(f => f.predicate === 'HAS_FIVE_ELEMENTS_CLASS');

  const missingAssertions = makeValidInterpretation(natal);
  delete /** @type {any} */ (missingAssertions.claims[0]).assertions;
  const schemaReport = validateInterpretation(missingAssertions, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(schemaReport.valid, false);
  assert.ok(schemaReport.errors.some(e => e.code === 'SCHEMA_INVALID'));

  const wrongAssertion = makeValidInterpretation(natal);
  wrongAssertion.claims[0].statement = 'Cung Mệnh vững vàng.';
  wrongAssertion.claims[0].assertions.push({
    subjectId: 'STAR.ZIWEI',
    predicate: 'LOCATED_IN',
    objectId: 'PALACE.MING',
  });
  const wrongAssertionReport = validateInterpretation(wrongAssertion, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(wrongAssertionReport.valid, false);
  assert.ok(wrongAssertionReport.errors.some(e => e.code === 'ASSERTION_NOT_IN_FACTS'));

  const extraFactId = makeValidInterpretation(natal);
  extraFactId.claims[0].factIds.push(juFact.id);
  const extraFactReport = validateInterpretation(extraFactId, natal, [{ id: 'TK.03T.001' }]);
  assert.equal(extraFactReport.valid, false);
  assert.ok(extraFactReport.errors.some(e => e.code === 'UNREFERENCED_FACT_ID'));

  // Regression: quoteIds bịa khi danh sách allowedQuotes rỗng ([]) vẫn phải bị chặn
  const fakeQuoteOnEmpty = makeValidInterpretation(natal);
  fakeQuoteOnEmpty.claims[0].quoteIds = ['TK.99X.999'];
  const emptyQuoteReport = validateInterpretation(fakeQuoteOnEmpty, natal, []);
  assert.equal(emptyQuoteReport.valid, false);
  assert.ok(emptyQuoteReport.errors.some(e => e.code === 'UNKNOWN_QUOTE_ID'));
});

test('validateInterpretation bắt trọn bộ 7 lỗ hổng lách văn bản: cư/ở cung, NFD, hoá kị, tam hợp không dấu câu, phán thọ/giàu, không trước mê tín', () => {
  const natal = getBaselineNatal();
  const allowed = [{ id: 'TK.03T.001' }];

  // 1. "Tử Vi cư Phụ Mẫu" & "ở cung"
  const cuVerb = makeValidInterpretation(natal);
  cuVerb.summary = 'Tử Vi cư Phụ Mẫu mang lại uy quyền.';
  assert.ok(validateInterpretation(cuVerb, natal, allowed).errors.some(e => e.code === 'STAR_PALACE_CONTRADICTION'));

  const oCungVerb = makeValidInterpretation(natal);
  oCungVerb.summary = 'Vũ Khúc ở cung Tài Bạch rất vượng.';
  assert.ok(validateInterpretation(oCungVerb, natal, allowed).errors.some(e => e.code === 'STAR_PALACE_CONTRADICTION'));

  // 2. Unicode NFD tách dấu
  const nfdText = makeValidInterpretation(natal);
  nfdText.claims[0].statement = 'Tử Vi tọa thủ Mệnh'.normalize('NFD');
  assert.ok(validateInterpretation(nfdText, natal, allowed).errors.some(e => e.code === 'STAR_PALACE_CONTRADICTION'));

  // 3. Chính tả "Hóa Kị" và "hoá kỵ"
  const hoaKi = makeValidInterpretation(natal);
  hoaKi.summary = 'Thiên Lương Hóa Kị cần đề phòng.';
  assert.ok(validateInterpretation(hoaKi, natal, allowed).errors.some(e => e.code === 'SIHUA_CONTRADICTION'));

  const hoaKyTone = makeValidInterpretation(natal);
  hoaKyTone.summary = 'Thiên Lương hoá kỵ cần đề phòng.';
  assert.ok(validateInterpretation(hoaKyTone, natal, allowed).errors.some(e => e.code === 'SIHUA_CONTRADICTION'));

  // 4. Đi sau "tam hợp" không có dấu câu ngăn
  const tamHopBypass = makeValidInterpretation(natal);
  tamHopBypass.summary = 'Xét tam hợp Mệnh Tài Quan có Tử Vi tọa thủ Mệnh rất sáng.';
  assert.ok(validateInterpretation(tamHopBypass, natal, allowed).errors.some(e => e.code === 'STAR_PALACE_CONTRADICTION'));

  // 5. Câu định mệnh "giàu có, sống thọ trăm tuổi" gắn một factId hợp lệ
  const fatalistic = makeValidInterpretation(natal);
  fatalistic.claims[0].statement = 'Thiên Lương tọa thủ Mệnh nên giàu có, sống thọ trăm tuổi.';
  assert.ok(validateInterpretation(fatalistic, natal, allowed).errors.some(e => e.code === 'UNGROUNDED_FATALISTIC_CLAIM'));

  // 6. Câu mê tín có chữ "không" đứng trước trong vòng 32 ký tự
  const superstitionBypass = makeValidInterpretation(natal);
  superstitionBypass.actionGuidance = ['Không nên chủ quan hãy đi cúng sao giải hạn đầu năm.'];
  assert.ok(validateInterpretation(superstitionBypass, natal, allowed).errors.some(e => e.code === 'DOCTRINE_SUPERSTITION'));

  // 7. Mệnh vô chính diệu sai & câu bài trừ mê tín hợp lệ
  const wrongEmpty = makeValidInterpretation(natal);
  wrongEmpty.summary = 'Lá số này thuộc thế Mệnh vô chính diệu.';
  assert.ok(validateInterpretation(wrongEmpty, natal, allowed).errors.some(e => e.code === 'EMPTY_MING_CONTRADICTION'));

  const rational = makeValidInterpretation(natal);
  rational.actionGuidance = ['Tuyệt đối không cúng sao giải hạn, không dùng bùa chú; cải vận bằng hành động thực tế.'];
  const okReport = validateInterpretation(rational, natal, allowed);
  assert.equal(okReport.valid, true, JSON.stringify(okReport.errors));
});

test('validateInterpretation không chặn nhầm cụm tử vi đẩu số / lá số tử vi, câu bài trừ mê tín hợp lệ, nhưng bắt câu sai sau dấu phẩy', () => {
  const profile = core.getProfile('thienky-candidate');
  const norm1990Aug = core.normalizeBirth(
    { calendar: 'solar', date: '1990-08-15', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'female' },
    profile,
  );
  assert.equal(norm1990Aug.status, 'ok');
  const coLuongNatal = /** @type {any} */ (core.computeNatal(norm1990Aug.chart, profile));
  const mingFact = coLuongNatal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
  const tianjiFact = coLuongNatal.facts.find(f => f.subjectId === 'STAR.TIANJI' && f.objectId === 'PALACE.MING');

  // Repro from review: "Theo tử vi đẩu số, ..." & "lá số tử vi" on 1990-08-15 (where Tử Vi is NOT in Mệnh)
  const disciplineResponse = {
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    summary: 'Theo tử vi đẩu số, lá số tử vi này có Thiên Cơ tọa thủ Mệnh tại Thìn.',
    reasoningSteps: ['Đối chiếu cung Mệnh trên lá số tử vi.'],
    claims: [
      {
        id: 'CLAIM.1',
        category: 'menh-than',
        statement: 'Theo tử vi đẩu số, cung Mệnh trên lá số tử vi tại Thìn có Thiên Cơ tọa thủ.',
        assertions: [
          { subjectId: mingFact.subjectId, predicate: mingFact.predicate, objectId: mingFact.objectId },
          { subjectId: tianjiFact.subjectId, predicate: tianjiFact.predicate, objectId: tianjiFact.objectId },
        ],
        factIds: [mingFact.id, tianjiFact.id],
        quoteIds: [],
        confidence: 'high',
      },
    ],
    actionGuidance: [
      'Không cần cúng sao giải hạn.',
      'Không phải cúng bái hay mua bùa.',
      'Hãy bài trừ mê tín như đeo bùa, cúng bái.',
    ],
    disclaimer: 'Tham khảo học thuật.',
  };
  const disciplineReport = validateInterpretation(disciplineResponse, coLuongNatal, []);
  assert.equal(disciplineReport.valid, true, JSON.stringify(disciplineReport.errors));

  // Real star Tử Vi falsely claimed in Mệnh on the same chart MUST still be caught
  const realStarFalse = structuredClone(disciplineResponse);
  realStarFalse.claims[0].statement = 'Theo tử vi đẩu số, sao Tử Vi tọa thủ Mệnh tại Thìn.';
  const realStarReport = validateInterpretation(realStarFalse, coLuongNatal, []);
  assert.equal(realStarReport.valid, false);
  assert.ok(realStarReport.errors.some(e => e.code === 'STAR_PALACE_CONTRADICTION' || e.code === 'CLAIM_STATEMENT_UNGROUNDED'));

  // Fatalistic "giàu có, sống thọ" with comma (without "trăm tuổi") MUST now be caught
  const commaFatalistic = makeValidInterpretation(getBaselineNatal());
  commaFatalistic.claims[0].statement = 'Thiên Lương tọa thủ Mệnh tất giàu có, sống thọ viên mãn.';
  const commaFatalisticReport = validateInterpretation(commaFatalistic, getBaselineNatal(), [{ id: 'TK.03T.001' }]);
  assert.equal(commaFatalisticReport.valid, false);
  assert.ok(commaFatalisticReport.errors.some(e => e.code === 'UNGROUNDED_FATALISTIC_CLAIM'));

  // Contradictions after introductory comma MUST be caught
  const postCommaMing = makeValidInterpretation(getBaselineNatal());
  postCommaMing.summary = 'Theo tổng cục, cung Mệnh tại Tý.';
  assert.ok(validateInterpretation(postCommaMing, getBaselineNatal(), [{ id: 'TK.03T.001' }]).errors.some(e => e.code === 'MING_BRANCH_CONTRADICTION'));
});
