'use strict';

const fs = require('node:fs');
const path = require('node:path');
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

  const normCoLuong = core.normalizeBirth(
    { calendar: 'solar', date: '1990-08-15', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'female' },
    profile,
  );
  if (normCoLuong.status !== 'ok') throw new Error('Failed to normalize Co-Luong chart');
  const coLuongNatal = /** @type {any} */ (core.computeNatal(normCoLuong.chart, profile));

  const mingFact = baseNatal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
  const tlFact = baseNatal.facts.find(f => f.subjectId === 'STAR.TIANLIANG' && f.objectId === 'PALACE.MING');
  const tlKhoaFact = baseNatal.facts.find(f => f.subjectId === 'STAR.TIANLIANG' && f.predicate === 'HAS_NATAL_TRANSFORMATION');
  const tlBrightFact = baseNatal.facts.find(
    f => f.subjectId === 'STAR.TIANLIANG' && f.predicate === 'HAS_BRIGHTNESS_AT_PALACE' && f.objectId === 'PALACE.MING',
  );
  const sfszFact = baseNatal.facts.find(
    f => f.subjectId === 'PALACE.MING' && f.predicate === 'HAS_SANFANGSIZHENG_MEMBER',
  );
  const mingDecadalFact = baseNatal.facts.find(
    f => f.subjectId === 'PALACE.MING' && f.predicate === 'HAS_DECADAL_AGE_RANGE',
  );
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
        assertions: /** @type {Array<{ subjectId: string, predicate: string, objectId?: string, value?: unknown }>} */ ([
          { subjectId: mingFact.subjectId, predicate: mingFact.predicate, objectId: mingFact.objectId },
          { subjectId: tlFact.subjectId, predicate: tlFact.predicate, objectId: tlFact.objectId },
        ]),
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
    {
      id: 'adv-post-comma-ming-branch-contradiction',
      expectedValid: false,
      expectedCode: 'MING_BRANCH_CONTRADICTION',
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => { const r = validBase(); r.summary = 'Nhìn tổng thể, cung Mệnh an tại Tý.'; return r; })(),
    },

    // --- 14 True-Negative Cases (realistic LLM-style valid payloads that MUST pass: expectedValid = true) ---
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
    {
      id: 'tn-valid-tu-vi-dau-so-discipline-phrase-1990-08-15',
      expectedValid: true,
      natal: coLuongNatal,
      quotes: [],
      response: (() => {
        const clMing = coLuongNatal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
        const tianji = coLuongNatal.facts.find(f => f.subjectId === 'STAR.TIANJI' && f.objectId === 'PALACE.MING');
        const tianliang = coLuongNatal.facts.find(f => f.subjectId === 'STAR.TIANLIANG' && f.objectId === 'PALACE.MING');
        return {
          schemaVersion: INTERPRETATION_SCHEMA_VERSION,
          summary: 'Theo tử vi đẩu số, bộ Cơ Lương tọa thủ Mệnh tại Thìn thiên về tư duy phân tích và mưu lược.',
          reasoningSteps: ['Đối chiếu chính tinh cung Mệnh trên lá số tử vi hiện tại.'],
          claims: [
            {
              id: 'CLAIM.1',
              category: 'menh-than',
              statement: 'Theo tử vi đẩu số, trên lá số tử vi này Thiên Cơ và Thiên Lương đồng độ tại cung Mệnh ở Thìn.',
              assertions: [
                { subjectId: clMing.subjectId, predicate: clMing.predicate, objectId: clMing.objectId },
                { subjectId: tianji.subjectId, predicate: tianji.predicate, objectId: tianji.objectId },
                { subjectId: tianliang.subjectId, predicate: tianliang.predicate, objectId: tianliang.objectId },
              ],
              factIds: [clMing.id, tianji.id, tianliang.id],
              quoteIds: [],
              confidence: 'high',
            },
          ],
          actionGuidance: ['Tập trung trau dồi chuyên môn thực chất.'],
          disclaimer: 'Tham khảo học thuật.',
        };
      })(),
    },
    {
      id: 'tn-valid-khong-can-cung-sao-giai-han',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.actionGuidance = ['Không cần cúng sao giải hạn, hãy tập trung cải thiện thói quen làm việc và sức khỏe.'];
        return r;
      })(),
    },
    {
      id: 'tn-valid-khong-phai-cung-bai-hay-mua-bua',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.actionGuidance = ['Không phải cúng bái hay mua bùa mà đổi được vận, trọng tâm là hành động thực tế.'];
        return r;
      })(),
    },
    {
      id: 'tn-valid-hay-bai-tru-me-tin-nhu-deo-bua-cung-bai',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.actionGuidance = ['Hãy bài trừ mê tín như đeo bùa, cúng bái và xem bói toán định mệnh.'];
        return r;
      })(),
    },
    {
      id: 'tn-valid-negated-fatalistic-clause',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.summary = 'Môn tử vi dùng để tham chiếu xu hướng tính cách, tuyệt đối không phán đoán giàu có, sống thọ trăm tuổi một cách máy móc.';
        return r;
      })(),
    },
    {
      id: 'tn-valid-brightness-citation',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.claims[0].statement = `Thiên Lương tọa thủ Mệnh tại Mùi đạt độ sáng ${tlBrightFact.value}.`;
        r.claims[0].assertions.push({
          subjectId: tlBrightFact.subjectId,
          predicate: tlBrightFact.predicate,
          objectId: tlBrightFact.objectId,
          value: tlBrightFact.value,
        });
        r.claims[0].factIds.push(tlBrightFact.id);
        return r;
      })(),
    },
    {
      id: 'tn-valid-sanfangsizheng-citation',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.claims[0].statement = 'Cung Mệnh tại Mùi có Thiên Lương tọa thủ Mệnh và hội chiếu tam phương tứ chính đồng bộ.';
        r.claims[0].assertions.push({
          subjectId: sfszFact.subjectId,
          predicate: sfszFact.predicate,
          objectId: sfszFact.objectId,
        });
        r.claims[0].factIds.push(sfszFact.id);
        return r;
      })(),
    },
    {
      id: 'tn-valid-orthography-hoa-khoa-and-sihua',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.summary = 'Cung Mệnh toạ thủ tại Mùi, có Thiên Lương hoá khoa chủ sự học hỏi điềm đạm.';
        r.claims[0].statement = 'Thiên Lương hoá khoa toạ thủ Mệnh tại cung Mùi.';
        r.claims[0].assertions.push({
          subjectId: tlKhoaFact.subjectId,
          predicate: tlKhoaFact.predicate,
          objectId: tlKhoaFact.objectId,
        });
        r.claims[0].factIds.push(tlKhoaFact.id);
        return r;
      })(),
    },
    {
      id: 'tn-valid-intro-comma-ming-ju-decadal',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        const [start, end] = mingDecadalFact.value;
        r.summary = `Xét tổng cục trên lá số tử vi, cung Mệnh an tại Mùi, Cục là Thổ Ngũ Cục, đại hạn tại Mệnh từ ${start} đến ${end} tuổi.`;
        r.claims[0].assertions.push(
          { subjectId: juFact.subjectId, predicate: juFact.predicate, objectId: juFact.objectId, value: juFact.value },
          { subjectId: mingDecadalFact.subjectId, predicate: mingDecadalFact.predicate, value: mingDecadalFact.value },
        );
        r.claims[0].factIds.push(juFact.id, mingDecadalFact.id);
        return r;
      })(),
    },
    {
      id: 'tn-valid-trine-mention-without-false-contradiction',
      expectedValid: true,
      natal: baseNatal,
      quotes: allowedQuotes,
      response: (() => {
        const r = validBase();
        r.summary = 'Cung Mệnh tại Mùi có Thiên Lương tọa thủ Mệnh; khi luận cần xét đồng thời tam hợp Mệnh – Tài Bạch – Quan Lộc.';
        return r;
      })(),
    },
  ];
}

async function runEval(options = {}) {
  const mode = options.mode || process.env.TUVI_EVAL_MODE || 'mock';
  const adapter = options.adapter || (mode === 'local'
    ? createOpenAICompatibleAdapter({
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.structuredOutputs !== undefined ? { structuredOutputs: options.structuredOutputs } : {}),
      })
    : createMockAdapter());
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

  // 2. End-to-End Pipeline Smoke, Pass@1, Latency & Prompt Budget Evaluation across 10 Charts
  const results = [];
  let smokePassedCases = 0;
  let passAt1Cases = 0;
  let totalClaims = 0;
  let totalGroundedClaims = 0;
  let totalQuotedCases = 0;
  let privacyFailures = 0;
  let maxPromptChars = 0;
  let totalPromptChars = 0;
  let maxPromptTokensEstimate = 0;
  let totalPromptTokensEstimate = 0;
  /** @type {number[]} */
  const latenciesMs = [];
  /** @type {Record<string, number>} */
  const errorHistogram = {};

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

    const startedAt = performance.now();
    try {
      const output = await interpretNatal(natal, {
        adapter,
        corpus,
        question: item.question,
        focusPalace: item.focusPalace,
        extraSensitiveValues: ['Nguyễn Văn Eval'],
      });
      const elapsedMs = Math.round(performance.now() - startedAt);
      latenciesMs.push(elapsedMs);
      const v = output.validation;
      if (v.valid && output.interpretation !== null) {
        smokePassedCases++;
        if (output.attempts === 1) passAt1Cases++;
      } else {
        for (const err of v.errors || []) {
          errorHistogram[err.code] = (errorHistogram[err.code] ?? 0) + 1;
        }
      }
      totalClaims += v.metrics.claimCount;
      totalGroundedClaims += v.metrics.groundedClaimCount;
      if (v.metrics.citedQuoteCount > 0) totalQuotedCases++;
      maxPromptChars = Math.max(maxPromptChars, output.promptChars);
      totalPromptChars += output.promptChars;
      maxPromptTokensEstimate = Math.max(maxPromptTokensEstimate, output.promptTokensEstimate);
      totalPromptTokensEstimate += output.promptTokensEstimate;
      if (!output.privacy.directBirthIdentifiersStripped) privacyFailures++;

      results.push({
        id: item.id,
        valid: v.valid,
        attempts: output.attempts,
        latencyMs: elapsedMs,
        promptChars: output.promptChars,
        promptTokensEstimate: output.promptTokensEstimate,
        claims: v.metrics.claimCount,
        verifiedAssertions: v.metrics.verifiedAssertionCount,
        citedFacts: v.metrics.citedFactCount,
        citedQuotes: v.metrics.citedQuoteCount,
        errors: v.errors,
      });
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      latenciesMs.push(elapsedMs);
      const msg = error instanceof Error ? error.message : String(error);
      const code = (error && /** @type {any} */ (error).code) || 'UNEXPECTED_ERROR';
      errorHistogram[code] = (errorHistogram[code] ?? 0) + 1;
      if (msg.includes('quyền riêng tư') || code === 'PRIVACY_VIOLATION') {
        privacyFailures++;
      }
      results.push({
        id: item.id,
        valid: false,
        latencyMs: elapsedMs,
        error: msg,
      });
    }
  }

  const sortedLat = [...latenciesMs].sort((a, b) => a - b);
  const avgLatencyMs = sortedLat.length
    ? Math.round(sortedLat.reduce((acc, x) => acc + x, 0) / sortedLat.length)
    : 0;
  const p95LatencyMs = sortedLat.length
    ? sortedLat[Math.min(sortedLat.length - 1, Math.floor(sortedLat.length * 0.95))]
    : 0;

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
    passAt1Cases,
    passAt1Rate: Number((passAt1Cases / BENCHMARK_CASES.length).toFixed(4)),
    structuralAssertionRate: totalClaims ? Number((totalGroundedClaims / totalClaims).toFixed(4)) : 0,
    quoteCitationCaseRate: Number((totalQuotedCases / BENCHMARK_CASES.length).toFixed(4)),
    avgPromptChars: Math.round(totalPromptChars / BENCHMARK_CASES.length),
    maxPromptChars,
    avgPromptTokensEstimate: Math.round(totalPromptTokensEstimate / BENCHMARK_CASES.length),
    maxPromptTokensEstimate,
    avgLatencyMs,
    p95LatencyMs,
    errorHistogram,
    privacyFailures,
  };

  return { summary, adversarialDetails, results };
}

function parseCliArgs(argv) {
  /** @type {Record<string, string>} */
  const parsed = {};
  for (const arg of argv) {
    const m = /^--([a-z0-9-]+)=(.+)$/i.exec(arg);
    if (m) parsed[m[1]] = m[2];
  }
  return parsed;
}

if (require.main === module) {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  runEval({
    mode: cliArgs.mode,
    model: cliArgs.model,
    baseUrl: cliArgs['base-url'],
    structuredOutputs: cliArgs.structured ? cliArgs.structured === '1' || cliArgs.structured === 'true' : undefined,
  })
    .then(report => {
      if (cliArgs['save-report']) {
        const outPath = path.resolve(cliArgs['save-report']);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      }
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
