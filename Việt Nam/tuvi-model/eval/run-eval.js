'use strict';

const core = require('../../tuvi-core');
const {
  INTERPRETATION_SCHEMA_VERSION,
  validateInterpretation,
  interpretNatal,
  loadCorpus,
  createMockAdapter,
  createOpenAICompatibleAdapter,
} = require('../src');

/** @type {Array<{ id: string, description: string, birth: import('../../tuvi-core').BirthInput, profileId: string, question?: string, focusPalace?: string }>} */
const BENCHMARK_CASES = [
  {
    id: 'baseline-1990-tianliang',
    description: 'Mệnh Thân đồng cung tại Mùi, Thiên Lương Hóa Khoa',
    birth: { calendar: 'solar', date: '1990-01-01', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profileId: 'thienky-candidate',
    question: 'Tổng quan tính cách và điểm cần đề phòng theo Thiên Kỷ?',
  },
  {
    id: 'empty-ming-borrow-1990',
    description: 'Mệnh vô chính diệu, mượn Thiên Lương từ Thiên Di',
    birth: { calendar: 'solar', date: '1990-01-06', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profileId: 'thienky-candidate',
    question: 'Mệnh vô chính diệu cần lưu ý gì?',
  },
  {
    id: 'co-luong-1990-female',
    description: 'Cơ Lương tọa Mệnh tại Thìn, Thân cư Thiên Di',
    birth: { calendar: 'solar', date: '1990-08-15', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'female' },
    profileId: 'thienky-candidate',
    focusPalace: 'Quan Lộc',
  },
  {
    id: 'leap-fifth-1990-thienky',
    description: 'Âm lịch tháng 5 nhuận năm 1990 (thienky-candidate chuyển tháng 6)',
    birth: { calendar: 'lunar', date: '1990-05-15', isLeap: true, time: '00:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profileId: 'thienky-candidate',
  },
  {
    id: 'leap-fifth-1990-repro',
    description: 'Âm lịch tháng 5 nhuận năm 1990 (repro-v4 giữ tháng 5)',
    birth: { calendar: 'lunar', date: '1990-05-15', isLeap: true, time: '00:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profileId: 'repro-v4',
  },
  {
    id: 'late-zi-1990-repro',
    description: 'Giờ Tý muộn 23:30 sang ngày hôm sau (repro-v4)',
    birth: { calendar: 'solar', date: '1990-03-10', time: '23:30', tz: 'Asia/Ho_Chi_Minh', gender: 'female' },
    profileId: 'repro-v4',
    focusPalace: 'Tài Bạch',
  },
  {
    id: 'vn-calendar-1968-tet',
    description: 'Ngày lệch lịch 1968-01-29 (Mùng 1 Tết Mậu Thân Việt Nam)',
    birth: { calendar: 'solar', date: '1968-01-29', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'vietnamese' },
    profileId: 'thienky-candidate',
    question: 'Trọng tâm sự nghiệp và Tứ Hóa bản mệnh?',
  },
  {
    id: 'cn-calendar-1968-eve',
    description: 'Cùng ngày dương 1968-01-29 theo lịch Trung (30 Tết Đinh Mùi)',
    birth: { calendar: 'solar', date: '1968-01-29', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'chinese' },
    profileId: 'thienky-candidate',
  },
  {
    id: 'sat-pha-tham-1985',
    description: 'Ca 1985 nữ mệnh kiểm tra phân loại chính tinh & Tứ Hóa',
    birth: { calendar: 'solar', date: '1985-04-20', time: '14:30', tz: 'Asia/Ho_Chi_Minh', gender: 'female' },
    profileId: 'thienky-candidate',
    focusPalace: 'Phu Thê',
  },
  {
    id: 'year-2000-male',
    description: 'Ca Canh Thìn năm 2000 nam mệnh',
    birth: { calendar: 'solar', date: '2000-10-12', time: '20:15', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profileId: 'thienky-candidate',
    question: 'Cung Tài Bạch và đại hạn đầu đời thế nào?',
  },
];

/**
 * Builds non-circular adversarial & true-negative test cases against real computed charts
 * to measure the validator's actual recall and false-positive rate independently of MockAdapter.
 */
function buildAdversarialCases() {
  const profile = core.getProfile('thienky-candidate');
  const normBase = core.normalizeBirth(
    { calendar: 'solar', date: '1990-01-01', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profile,
  );
  if (normBase.status !== 'ok') throw new Error('Failed to normalize baseline chart');
  const baseNatal = /** @type {any} */ (core.computeNatal(normBase.chart, profile));

  const normEmpty = core.normalizeBirth(
    { calendar: 'solar', date: '1990-01-06', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    profile,
  );
  if (normEmpty.status !== 'ok') throw new Error('Failed to normalize empty-Ming chart');
  const emptyNatal = /** @type {any} */ (core.computeNatal(normEmpty.chart, profile));

  const mingFact = baseNatal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
  const tlFact = baseNatal.facts.find(f => f.subjectId === 'STAR.TIANLIANG' && f.objectId === 'PALACE.MING');
  const juFact = baseNatal.facts.find(f => f.predicate === 'HAS_FIVE_ELEMENTS_CLASS');

  const validBase = () => ({
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    summary: 'Cung Mệnh tại Mùi có Thiên Lương tọa thủ Mệnh.',
    reasoningSteps: ['Kiểm tra cung Mệnh tại Mùi và chính tinh Thiên Lương.'],
    claims: [
      {
        id: 'CLAIM.1',
        category: 'menh-than',
        statement: 'Thiên Lương tọa thủ Mệnh tại cung Mùi.',
        assertions: [
          { subjectId: mingFact.subjectId, predicate: mingFact.predicate, objectId: mingFact.objectId },
          { subjectId: tlFact.subjectId, predicate: tlFact.predicate, objectId: tlFact.objectId },
        ],
        factIds: [mingFact.id, tlFact.id],
        quoteIds: ['TK.03T.001'],
        confidence: 'high',
      },
    ],
    actionGuidance: ['Hành động thực tế, tuyệt đối không cúng sao giải hạn hay dùng bùa chú.'],
    disclaimer: 'Tham khảo học thuật.',
  });

  const allowedQuotes = [{ id: 'TK.03T.001' }];

  return [
    // --- 12 Adversarial Positive Cases (must be caught: expectedValid = false) ---
    {
      id: 'adv-verb-cu-no-cung',
      expectedValid: false,
      expectedCode: 'STAR_PALACE_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Tử Vi cư Phụ Mẫu rất sáng.'; return r; })(),
    },
    {
      id: 'adv-verb-o-cung',
      expectedValid: false,
      expectedCode: 'STAR_PALACE_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Thiên Lương ở cung Tài Bạch chủ tài lộc.'; return r; })(),
    },
    {
      id: 'adv-unicode-nfd-decomposed',
      expectedValid: false,
      expectedCode: 'STAR_PALACE_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Tử Vi tọa thủ Mệnh'.normalize('NFD'); return r; })(),
    },
    {
      id: 'adv-orthography-hoa-ki',
      expectedValid: false,
      expectedCode: 'SIHUA_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Thiên Lương hoá kị gây trở ngại.'; return r; })(),
    },
    {
      id: 'adv-tam-hop-no-punctuation-bypass',
      expectedValid: false,
      expectedCode: 'STAR_PALACE_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Xét tam hợp Mệnh Tài Quan có Tử Vi tọa thủ Mệnh rất sáng.'; return r; })(),
    },
    {
      id: 'adv-fatalistic-longevity-wealth',
      expectedValid: false,
      expectedCode: 'UNGROUNDED_FATALISTIC_CLAIM',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.claims[0].statement = 'Thiên Lương tọa thủ Mệnh nên giàu có, sống thọ trăm tuổi.'; return r; })(),
    },
    {
      id: 'adv-fake-quote-when-empty-quotes',
      expectedValid: false,
      expectedCode: 'UNKNOWN_QUOTE_ID',
      natal: baseNatal,
      quotes: [],
      response: validBase(),
    },
    {
      id: 'adv-khong-within-32chars-superstition',
      expectedValid: false,
      expectedCode: 'DOCTRINE_SUPERSTITION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.actionGuidance = ['Không nên chủ quan hãy đi cúng sao giải hạn đầu năm.']; return r; })(),
    },
    {
      id: 'adv-false-structured-assertion',
      expectedValid: false,
      expectedCode: 'ASSERTION_NOT_IN_FACTS',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.claims[0].statement = 'Cung Mệnh vững vàng.';
        r.claims[0].assertions.push({ subjectId: 'STAR.ZIWEI', predicate: 'LOCATED_IN', objectId: 'PALACE.MING' });
        return r;
      })(),
    },
    {
      id: 'adv-extra-unreferenced-factid',
      expectedValid: false,
      expectedCode: 'UNREFERENCED_FACT_ID',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.claims[0].factIds.push(juFact.id);
        return r;
      })(),
    },
    {
      id: 'adv-ungrounded-star-in-statement',
      expectedValid: false,
      expectedCode: 'CLAIM_STATEMENT_UNGROUNDED',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.claims[0].statement = 'Thiên Lương tọa thủ Mệnh kết hợp với Tham Lang mạnh mẽ.';
        return r;
      })(),
    },
    {
      id: 'adv-aux-star-wrong-sihua',
      expectedValid: false,
      expectedCode: 'SIHUA_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Năm sinh có Văn Xương Hóa Kỵ cần lưu ý giấy tờ.'; return r; })(),
    },

    // --- 4 True-Negative Cases (independent valid payloads that MUST pass: expectedValid = true) ---
    {
      id: 'tn-valid-baseline-nfc',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: validBase(),
    },
    {
      id: 'tn-valid-baseline-nfd-accents',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.claims[0].statement = r.claims[0].statement.normalize('NFD');
        return r;
      })(),
    },
    {
      id: 'tn-valid-anti-superstition-clause',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.actionGuidance = ['Chủ động rèn luyện năng lực thực tế, thay vì tin vào mê tín hay cúng bái.'];
        return r;
      })(),
    },
    {
      id: 'tn-valid-empty-ming-borrow',
      expectedValid: true,
      natal: emptyNatal,
      quotes: [],
      response: (() => {
        const mFact = emptyNatal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
        const eFact = emptyNatal.facts.find(f => f.subjectId === 'PALACE.MING' && f.predicate === 'HAS_NO_MAJOR_STAR');
        const bFact = emptyNatal.facts.find(
          f => f.subjectId === 'PALACE.MING' && f.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR' && f.objectId === 'STAR.TIANLIANG',
        );
        return {
          schemaVersion: INTERPRETATION_SCHEMA_VERSION,
          summary: 'Lá số thuộc thế Mệnh vô chính diệu, mượn Thiên Lương từ đối cung Thiên Di.',
          reasoningSteps: ['Kiểm tra cung Mệnh vô chính diệu và sao mượn đối cung.'],
          claims: [
            {
              id: 'CLAIM.1',
              category: 'menh-than',
              statement: 'Cung Mệnh vô chính diệu, mượn chính tinh Thiên Lương ở cung Thiên Di.',
              assertions: [
                { subjectId: mFact.subjectId, predicate: mFact.predicate, objectId: mFact.objectId },
                { subjectId: eFact.subjectId, predicate: eFact.predicate, value: true },
                { subjectId: bFact.subjectId, predicate: bFact.predicate, objectId: bFact.objectId },
              ],
              factIds: [mFact.id, eFact.id, bFact.id],
              quoteIds: [],
              confidence: 'high',
            },
          ],
          actionGuidance: ['Xét đồng bộ đối cung Thiên Di khi đưa ra quyết định.'],
          disclaimer: 'Tham khảo học thuật.',
        };
      })(),
    },
  ];
}

async function runEval(options = {}) {
  const mode = options.mode || process.env.TUVI_EVAL_MODE || 'mock';
  const adapter = options.adapter || (mode === 'local' ? createOpenAICompatibleAdapter() : createMockAdapter());
  const corpus = loadCorpus();

  // 1. Non-circular Adversarial & True-Negative Detector Evaluation
  const adversarialCases = buildAdversarialCases();
  let adversarialPositives = 0;
  let adversarialCaught = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  const adversarialDetails = [];

  for (const adv of adversarialCases) {
    const report = validateInterpretation(adv.response, adv.natal, adv.quotes);
    if (!adv.expectedValid) {
      adversarialPositives++;
      const matchedCode = adv.expectedCode ? report.errors.some(e => e.code === adv.expectedCode) : !report.valid;
      const caught = !report.valid && matchedCode;
      if (caught) adversarialCaught++;
      adversarialDetails.push({
        id: adv.id,
        passed: caught,
        expectedCode: adv.expectedCode,
        actualCodes: report.errors.map(e => e.code),
      });
    } else {
      trueNegatives++;
      if (!report.valid) falsePositives++;
      adversarialDetails.push({
        id: adv.id,
        passed: report.valid,
        actualCodes: report.errors.map(e => e.code),
      });
    }
  }

  // 2. End-to-End Pipeline Smoke & Prompt Budget Evaluation across 10 Charts
  const results = [];
  let smokePassedCases = 0;
  let totalClaims = 0;
  let totalGroundedClaims = 0;
  let totalQuotedCases = 0;
  let privacyFailures = 0;
  let maxPromptChars = 0;
  let totalPromptChars = 0;

  for (const item of BENCHMARK_CASES) {
    const profile = core.getProfile(item.profileId);
    const normalized = core.normalizeBirth(item.birth, profile);
    if (normalized.status !== 'ok') {
      throw new Error(`Benchmark case '${item.id}' did not normalize cleanly: ${normalized.reason}`);
    }
    const natal = {
      ...core.computeNatal(normalized.chart, profile),
      normalization: { input: item.birth, chart: normalized.chart, audit: normalized.audit, warnings: normalized.warnings },
    };

    try {
      const output = await interpretNatal(natal, {
        adapter,
        corpus,
        question: item.question,
        focusPalace: item.focusPalace,
        extraSensitiveValues: ['Nguyễn Văn Eval'],
      });
      const v = output.validation;
      if (v.valid && output.interpretation !== null) smokePassedCases++;
      totalClaims += v.metrics.claimCount;
      totalGroundedClaims += v.metrics.groundedClaimCount;
      if (v.metrics.citedQuoteCount > 0) totalQuotedCases++;
      maxPromptChars = Math.max(maxPromptChars, output.promptChars);
      totalPromptChars += output.promptChars;
      if (!output.privacy.directBirthIdentifiersStripped) privacyFailures++;

      results.push({
        id: item.id,
        valid: v.valid,
        attempts: output.attempts,
        promptChars: output.promptChars,
        claims: v.metrics.claimCount,
        verifiedAssertions: v.metrics.verifiedAssertionCount,
        citedFacts: v.metrics.citedFactCount,
        citedQuotes: v.metrics.citedQuoteCount,
        errors: v.errors,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('quyền riêng tư') || (error && /** @type {any} */ (error).code === 'PRIVACY_VIOLATION')) {
        privacyFailures++;
      }
      results.push({
        id: item.id,
        valid: false,
        error: msg,
      });
    }
  }

  const adversarialRecall = adversarialPositives ? Number((adversarialCaught / adversarialPositives).toFixed(4)) : 0;
  const falsePositiveRate = trueNegatives ? Number((falsePositives / trueNegatives).toFixed(4)) : 0;

  const summary = {
    adapter: adapter.id,
    corpusQuotes: corpus.quotes.length,
    adversarialCases: adversarialPositives,
    adversarialCaught,
    adversarialRecall,
    trueNegativeCases: trueNegatives,
    falsePositiveRate,
    smokeTotalCases: BENCHMARK_CASES.length,
    smokePassedCases,
    smokePassRate: Number((smokePassedCases / BENCHMARK_CASES.length).toFixed(4)),
    structuralAssertionRate: totalClaims ? Number((totalGroundedClaims / totalClaims).toFixed(4)) : 0,
    quoteCitationCaseRate: Number((totalQuotedCases / BENCHMARK_CASES.length).toFixed(4)),
    avgPromptChars: Math.round(totalPromptChars / BENCHMARK_CASES.length),
    maxPromptChars,
    privacyFailures,
  };

  return { summary, adversarialDetails, results };
}

if (require.main === module) {
  runEval()
    .then(report => {
      console.log(JSON.stringify(report.summary, null, 2));
      const failedAdv = report.adversarialDetails.filter(d => !d.passed);
      if (
        report.summary.adversarialRecall < 1
        || report.summary.falsePositiveRate > 0
        || report.summary.smokePassedCases !== report.summary.smokeTotalCases
        || report.summary.privacyFailures > 0
        || report.summary.maxPromptChars > 12_000
      ) {
        if (failedAdv.length > 0) console.error('Adversarial failures:', JSON.stringify(failedAdv, null, 2));
        console.error('Smoke failures:', JSON.stringify(report.results.filter(r => !r.valid), null, 2));
        process.exitCode = 1;
      }
    })
    .catch(err => {
      console.error(err);
      process.exitCode = 1;
    });
}

module.exports = {
  BENCHMARK_CASES,
  buildAdversarialCases,
  runEval,
};
