'use strict';

const core = require('../../tuvi-core');
const { interpretNatal, loadCorpus, createMockAdapter, createOpenAICompatibleAdapter } = require('../src');

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

async function runEval(options = {}) {
  const mode = options.mode || process.env.TUVI_EVAL_MODE || 'mock';
  const adapter = options.adapter || (mode === 'local' ? createOpenAICompatibleAdapter() : createMockAdapter());
  const corpus = loadCorpus();

  const results = [];
  let passedCases = 0;
  let totalClaims = 0;
  let totalGroundedClaims = 0;
  let totalContradictions = 0;
  let totalDoctrineViolations = 0;
  let totalQuotedCases = 0;
  let privacyFailures = 0;

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
      if (v.valid) passedCases++;
      totalClaims += v.metrics.claimCount;
      totalGroundedClaims += v.metrics.groundedClaimCount;
      totalContradictions += v.metrics.contradictionCount;
      totalDoctrineViolations += v.metrics.doctrineViolationCount;
      if (v.metrics.citedQuoteCount > 0) totalQuotedCases++;

      results.push({
        id: item.id,
        valid: v.valid,
        attempts: output.attempts,
        claims: v.metrics.claimCount,
        citedFacts: v.metrics.citedFactCount,
        citedQuotes: v.metrics.citedQuoteCount,
        errors: v.errors,
      });
    } catch (error) {
      if (String(error.message).includes('quyền riêng tư')) privacyFailures++;
      results.push({
        id: item.id,
        valid: false,
        error: error.message,
      });
    }
  }

  const summary = {
    adapter: adapter.id,
    corpusQuotes: corpus.quotes.length,
    totalCases: BENCHMARK_CASES.length,
    passedCases,
    passRate: Number((passedCases / BENCHMARK_CASES.length).toFixed(4)),
    factGroundingRate: totalClaims ? Number((totalGroundedClaims / totalClaims).toFixed(4)) : 0,
    hallucinationCount: totalContradictions,
    doctrineViolationCount: totalDoctrineViolations,
    quoteCitationCaseRate: Number((totalQuotedCases / BENCHMARK_CASES.length).toFixed(4)),
    privacyFailures,
  };

  return { summary, results };
}

if (require.main === module) {
  runEval()
    .then(report => {
      console.log(JSON.stringify(report.summary, null, 2));
      if (report.summary.passedCases !== report.summary.totalCases || report.summary.privacyFailures > 0) {
        console.error('Eval failed cases:', JSON.stringify(report.results.filter(r => !r.valid), null, 2));
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
  runEval,
};
