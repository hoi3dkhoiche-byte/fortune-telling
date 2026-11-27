'use strict';

const core = require('../../tuvi-core');
const { INTERPRETATION_SCHEMA_VERSION, buildResponseJsonSchema } = require('./schema');
const { buildAnonymizedContext, assertNoBirthPii, buildPrompts } = require('./context-builder');
const { loadCorpus } = require('./rag');
const { validateInterpretation } = require('./validator');
const { extractJsonResponse } = require('./adapters/openai-compatible');

const MAJOR_STAR_IDS = new Set([
  'STAR.ZIWEI', 'STAR.TIANJI', 'STAR.TAIYANG', 'STAR.WUQU', 'STAR.TIANTONG',
  'STAR.LIANZHEN', 'STAR.TIANFU', 'STAR.TAIYIN', 'STAR.TANLANG', 'STAR.JUMEN',
  'STAR.TIANXIANG', 'STAR.TIANLIANG', 'STAR.QISHA', 'STAR.POJUN',
]);

const TOPIC_PROMPTS = Object.freeze([
  { focusPalace: undefined, question: 'Tổng quan cấu trúc Mệnh Thân, Tứ Hóa và hướng rèn luyện bản thân theo Thiên Kỷ?' },
  { focusPalace: 'Quan Lộc', question: 'Cấu trúc cung Quan Lộc và định hướng sự nghiệp phù hợp?' },
  { focusPalace: 'Tài Bạch', question: 'Cung Tài Bạch và nguyên tắc quản trị tài chính trên lá số này?' },
  { focusPalace: 'Phu Thê', question: 'Cung Phu Thê và điểm cần lưu tâm trong quan hệ phối ngẫu?' },
  { focusPalace: 'Phúc Đức', question: 'Cung Phúc Đức và nền tảng tinh thần, nội tâm của lá số?' },
  { focusPalace: 'Thiên Di', question: 'Cung Thiên Di và xu hướng tương tác ngoài xã hội?' },
  { focusPalace: 'Điền Trạch', question: 'Cung Điền Trạch và tích lũy nền tảng an cư?' },
  { focusPalace: 'Tật Ách', question: 'Cung Tật Ách và thói quen sinh hoạt cần giữ gìn?' },
]);

const STAR_TRAIT_NOTES = Object.freeze({
  'Tử Vi': 'tư chất bao quát, trọng sự điềm tĩnh và năng lực tổ chức',
  'Thiên Cơ': 'tư duy linh hoạt, mạnh về phân tích kế hoạch và tham mưu',
  'Thái Dương': 'tính cách quang minh, chủ động gánh vác và hướng ngoại',
  'Vũ Khúc': 'tác phong quyết đoán, thực tế và kỷ luật trong hành động',
  'Thiên Đồng': 'khí chất ôn hòa, coi trọng sự cân bằng tinh thần',
  'Liêm Trinh': 'nguyên tắc rõ ràng, sắc sảo và trọng kỷ cương',
  'Thiên Phủ': 'năng lực bảo toàn, thận trọng và quản trị nguồn lực ổn định',
  'Thái Âm': 'chiều sâu nội tâm, tinh tế và bền bỉ tích lũy',
  'Tham Lang': 'đa tài, giỏi giao tế và giàu sức bật khám phá',
  'Cự Môn': 'khả năng phản biện, nghiên cứu chuyên sâu và lập luận chặt chẽ',
  'Thiên Tướng': 'tinh thần phò tá công tâm, giữ chữ tín và chuẩn mực',
  'Thiên Lương': 'nguyên tắc thanh liêm, chín chắn và có xu hướng che chở, giảng giải',
  'Thất Sát': 'ý chí độc lập, dám chịu trách nhiệm trước thử thách lớn',
  'Phá Quân': 'tinh thần khai phá, đổi mới mạnh mẽ bằng hành động đi trước',
});

/**
 * Converts a `@tuvi/core` fact record into a structured assertion object.
 * @param {any} fact
 */
function toAssertion(fact) {
  return {
    subjectId: fact.subjectId,
    predicate: fact.predicate,
    ...(fact.objectId !== undefined ? { objectId: fact.objectId } : {}),
    ...(fact.value !== undefined ? { value: fact.value } : {}),
  };
}

/**
 * Picks up to `limit` retrieved quote IDs matching keywords.
 * @param {any[]} quotes
 * @param {string[]} keywords
 * @param {number} [limit]
 * @returns {string[]}
 */
function pickTrainingQuotes(quotes, keywords, limit = 2) {
  if (!Array.isArray(quotes) || quotes.length === 0) return [];
  const lower = keywords.filter(Boolean).map(k => k.normalize('NFC').toLowerCase());
  const matched = quotes.filter(q => {
    const hay = `${q.tags || ''} ${q.section || ''} ${q.text || ''}`.normalize('NFC').toLowerCase();
    return lower.some(k => hay.includes(k));
  });
  const chosen = matched.length > 0 ? matched : quotes.slice(0, 1);
  return chosen.slice(0, limit).map(q => q.id);
}

/**
 * Builds the 6-step Thiên Kỷ Chain-of-Thought `<think>` block from structural chart context.
 * Never includes any birth dates/times/coordinates.
 *
 * @param {any} context AnonymizedContext
 * @returns {string[]}
 */
function buildChainOfThought(context) {
  const { chartSummary, palaces, focusPalaceId, retrievedQuotes, profile } = context;
  const targetId = focusPalaceId || chartSummary.mingPalaceId || 'PALACE.MING';
  const targetPalace = palaces.find(p => p.id === targetId) || palaces.find(p => p.isMing);
  const fudePalace = palaces.find(p => p.id === 'PALACE.FUDE');

  const mingStep = chartSummary.mingIsEmpty
    ? `1. Quét Mệnh/Thân: Cung Mệnh tại ${chartSummary.mingBranchLabelVi} thuộc thế Mệnh vô chính diệu${chartSummary.mingBorrowedStars.length ? `, mượn chính tinh ${chartSummary.mingBorrowedStars.join(', ')} từ đối cung Thiên Di` : ''}; Thân cư ${chartSummary.shenPalaceLabelVi}.`
    : `1. Quét Mệnh/Thân: Cung Mệnh tại ${chartSummary.mingBranchLabelVi} có ${chartSummary.mingMajorStars.join(', ')} tọa thủ; Thân cư ${chartSummary.shenPalaceLabelVi}.`;

  const juStep = `2. Xét Ngũ Hành Cục: Lá số thuộc ${chartSummary.wuxingJuLabelVi} (${chartSummary.yinYangGender}), cấu hình '${profile.id}' (${profile.status}, bảng sáng ${profile.brightnessSchool}).`;

  const fudeStars = fudePalace?.majorStars?.length
    ? fudePalace.majorStars.map(s => s.nameVi).join(', ')
    : (fudePalace?.borrowedStarsVi?.length ? `vô chính diệu (mượn ${fudePalace.borrowedStarsVi.join(', ')})` : 'vô chính diệu');
  const focusNote = targetPalace && targetPalace.id !== 'PALACE.MING'
    ? `; trọng tâm đang xét là cung ${targetPalace.nameVi} (${targetPalace.branchLabelVi})`
    : '';
  const trineStep = `3. Kiểm tra Phúc Đức & Tam Phương Tứ Chính: Cung Phúc Đức có ${fudeStars}${focusNote}, cần phối hợp đối cung và hai cung tam hợp thay vì nhìn đơn cung.`;

  const siHuaSummary = (chartSummary.siHua || [])
    .map(item => `${item.starNameVi} ${item.transformation} (${item.palaceNameVi})`)
    .join(', ');
  const siHuaStep = `4. Quét Tứ Hóa bản mệnh: ${siHuaSummary || 'Đối chiếu trục Lộc – Quyền – Khoa – Kỵ trên 12 cung'}.`;

  const quoteRefs = (retrievedQuotes || []).slice(0, 3).map(q => q.id).join(', ');
  const ragStep = quoteRefs
    ? `5. Đối chiếu khẩu quyết Thiên Kỷ: Tham chiếu trực tiếp trích dẫn [${quoteRefs}] để giữ đúng nguyên lý luận đoán.`
    : '5. Đối chiếu khẩu quyết Thiên Kỷ: Không có trích dẫn khớp sát, giữ nguyên phân tích bám chặt dữ kiện cấu trúc.';

  const actionStep = '6. Đúc kết Dĩ Quả Quyết Hành: Vận dụng nguyên lý Nhân đạo 1/3 + Địa lý 1/3 thắng Thiên mệnh 1/3; bác bỏ mọi hình thức cúng bái, bùa chú.';

  return [mingStep, juStep, trineStep, siHuaStep, ragStep, actionStep];
}

/**
 * Generates a natural-language Vietnamese Thiên Kỷ structured interpretation (`tuvi.interpretation.v0`)
 * grounded 100% in `context.promptFacts` and `retrievedQuotes` (guaranteed to pass `validateInterpretation`).
 *
 * @param {any} context AnonymizedContext
 */
function synthesizeGroundedInterpretation(context) {
  const { chartSummary, palaces, promptFacts, retrievedQuotes, focusPalaceId, profile } = context;
  const usableFacts = Array.isArray(promptFacts) && promptFacts.length > 0 ? promptFacts : context.facts;
  const findFacts = fn => usableFacts.filter(fn);
  const palaceById = new Map(palaces.map(p => [p.id, p]));

  const reasoningSteps = buildChainOfThought(context);
  const mingPalace = palaces.find(p => p.isMing);
  const mingFact = findFacts(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH')[0];
  const shenFact = findFacts(f => f.subjectId === 'CHART.SHEN' && f.predicate === 'LOCATED_IN')[0];
  const juFact = findFacts(f => f.predicate === 'HAS_FIVE_ELEMENTS_CLASS')[0];

  /** @type {any[]} */
  const claims = [];
  let seq = 1;
  const nextId = () => `CLAIM.${seq++}`;

  // Claim 1: Mệnh + Thân + Độ sáng / Vô chính diệu
  if (mingPalace && mingFact) {
    if (chartSummary.mingIsEmpty) {
      const emptyFacts = findFacts(
        f => f.subjectId === mingPalace.id && (f.predicate === 'HAS_NO_MAJOR_STAR' || f.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR'),
      );
      const selected = [mingFact, ...(shenFact ? [shenFact] : []), ...emptyFacts];
      const borrowedTrait = chartSummary.mingBorrowedStars
        .map(st => STAR_TRAIT_NOTES[st])
        .filter(Boolean)[0];
      const borrowClause = chartSummary.mingBorrowedStars.length > 0
        ? `, mượn chính tinh ${chartSummary.mingBorrowedStars.join(', ')} từ đối cung Thiên Di${borrowedTrait ? ` (${borrowedTrait})` : ''}`
        : '';
      const shenClause = shenFact && chartSummary.shenPalaceLabelVi
        ? `; cung Thân cư tại ${chartSummary.shenPalaceLabelVi}`
        : '';
      claims.push({
        id: nextId(),
        category: 'menh-than',
        statement: `Theo tử vi đẩu số, cung Mệnh an tại ${chartSummary.mingBranchLabelVi} thuộc thế Mệnh vô chính diệu${borrowClause}${shenClause}.`,
        assertions: selected.map(toAssertion),
        factIds: selected.map(f => f.id),
        quoteIds: pickTrainingQuotes(retrievedQuotes, ['vô chính diệu', ...chartSummary.mingBorrowedStars], 2),
        confidence: 'high',
      });
    } else {
      const mingMajorFacts = findFacts(
        f => f.objectId === mingPalace.id && f.predicate === 'LOCATED_IN' && MAJOR_STAR_IDS.has(f.subjectId),
      );
      const mingBrightFacts = findFacts(
        f => f.objectId === mingPalace.id && f.predicate === 'HAS_BRIGHTNESS_AT_PALACE' && MAJOR_STAR_IDS.has(f.subjectId),
      );
      const selected = [mingFact, ...(shenFact ? [shenFact] : []), ...mingMajorFacts, ...mingBrightFacts];
      const starDetails = mingPalace.majorStars
        .map(s => `${s.nameVi}${s.brightnessVi ? ` (${s.brightnessVi})` : ''}`)
        .join(', ');
      const primaryTrait = chartSummary.mingMajorStars.map(st => STAR_TRAIT_NOTES[st]).filter(Boolean).join('; ');
      const shenClause = shenFact && chartSummary.shenPalaceLabelVi
        ? `, kết hợp Thân cư ${chartSummary.shenPalaceLabelVi}`
        : '';
      claims.push({
        id: nextId(),
        category: 'menh-than',
        statement: `Cung Mệnh tại ${chartSummary.mingBranchLabelVi} có ${starDetails} tọa thủ Mệnh${shenClause}${primaryTrait ? `, nổi bật ở ${primaryTrait}` : ''}.`,
        assertions: selected.map(toAssertion),
        factIds: selected.map(f => f.id),
        quoteIds: pickTrainingQuotes(retrievedQuotes, chartSummary.mingMajorStars, 2),
        confidence: 'high',
      });
    }
  }

  // Claim 2: Ngũ Hành Cục & Đại hạn đầu
  const decadalFacts = findFacts(f => f.predicate === 'HAS_DECADAL_AGE_RANGE' && Array.isArray(f.value))
    .sort((a, b) => a.value[0] - b.value[0])
    .slice(0, 2);
  if (juFact && chartSummary.wuxingJuLabelVi) {
    const selected = [juFact, ...decadalFacts];
    const decText = decadalFacts.length > 0
      ? `; nhịp đại hạn mở đầu từ ${decadalFacts.map(f => `${f.value[0]}–${f.value[1]} tuổi (${palaceById.get(f.subjectId)?.nameVi || f.subjectId})`).join(' chuyển sang ')}`
      : '';
    claims.push({
      id: nextId(),
      category: 'ngu-hanh-cuc',
      statement: `Ngũ hành cục của lá số là ${chartSummary.wuxingJuLabelVi} (${chartSummary.yinYangGender})${decText}.`,
      assertions: selected.map(toAssertion),
      factIds: selected.map(f => f.id),
      quoteIds: pickTrainingQuotes(retrievedQuotes, ['cục', 'đại hạn'], 1),
      confidence: 'high',
    });
  }

  // Claim 3: Tứ Hóa bản mệnh
  if (chartSummary.siHua.length > 0) {
    const siHuaFacts = chartSummary.siHua
      .map(item => usableFacts.find(f => f.id === item.factId))
      .filter(Boolean);
    if (siHuaFacts.length > 0) {
      const siHuaClauses = chartSummary.siHua
        .map(item => `${item.starNameVi} ${item.transformation} tại cung ${item.palaceNameVi}`)
        .join(', ');
      const jiEntry = chartSummary.siHua.find(item => item.transformation === 'Hóa Kỵ');
      const jiReminder = jiEntry
        ? `; cần đặc biệt quản trị rủi ro và giữ sự điềm tĩnh ở phương diện cung ${jiEntry.palaceNameVi}`
        : '';
      claims.push({
        id: nextId(),
        category: 'tu-hoa',
        statement: `Trục Tứ Hóa bản mệnh ghi nhận ${siHuaClauses}${jiReminder}.`,
        assertions: siHuaFacts.map(toAssertion),
        factIds: siHuaFacts.map(f => f.id),
        quoteIds: pickTrainingQuotes(retrievedQuotes, ['hóa lộc', 'hóa kỵ', ...chartSummary.siHua.map(s => s.starNameVi)], 2),
        confidence: 'high',
      });
    }
  }

  // Claim 4: Cung trọng tâm (focusPalace hoặc Mệnh) & Tam phương tứ chính
  const centerId = focusPalaceId || chartSummary.mingPalaceId || 'PALACE.MING';
  const centerPalace = palaceById.get(centerId) || mingPalace;
  if (centerPalace) {
    const relFacts = findFacts(
      f => f.subjectId === centerPalace.id && (f.predicate === 'OPPOSITE_TO' || f.predicate === 'TRINE_WITH'),
    );
    const centerMajorFacts = centerPalace.id !== mingPalace?.id
      ? findFacts(f => f.objectId === centerPalace.id && f.predicate === 'LOCATED_IN' && MAJOR_STAR_IDS.has(f.subjectId))
      : [];
    const selected = [...centerMajorFacts, ...relFacts];
    if (selected.length > 0) {
      const oppFact = relFacts.find(f => f.predicate === 'OPPOSITE_TO');
      const trineFacts = relFacts.filter(f => f.predicate === 'TRINE_WITH');
      const oppName = oppFact ? (palaceById.get(oppFact.objectId)?.nameVi || oppFact.objectId) : '';
      const trineNames = trineFacts.map(f => palaceById.get(f.objectId)?.nameVi || f.objectId);
      const starIntro = centerMajorFacts.length > 0
        ? `có ${centerPalace.majorStars.map(s => s.nameVi).join(', ')} tọa thủ, `
        : '';
      claims.push({
        id: nextId(),
        category: 'tam-phuong',
        statement: `Khi xét cung ${centerPalace.nameVi}, cung này ${starIntro}luôn hội chiếu đồng bộ với đối cung ${oppName} và hai cung tam hợp ${trineNames.join(', ')}.`,
        assertions: selected.map(toAssertion),
        factIds: selected.map(f => f.id),
        quoteIds: pickTrainingQuotes(retrievedQuotes, [centerPalace.nameVi, 'tam phương'], 1),
        confidence: 'high',
      });
    }
  }

  const mingHeadline = chartSummary.mingIsEmpty
    ? `cung Mệnh vô chính diệu tại ${chartSummary.mingBranchLabelVi}`
    : `cung Mệnh tại ${chartSummary.mingBranchLabelVi} có ${chartSummary.mingMajorStars.join(', ')} tọa thủ Mệnh`;

  return {
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    summary: `Theo tử vi đẩu số hệ phái Thiên Kỷ, lá số thuộc ${chartSummary.wuxingJuLabelVi}, ${mingHeadline}, Thân cư ${chartSummary.shenPalaceLabelVi}; trọng tâm là nhận diện đúng cấu trúc Tứ Hóa và tam phương tứ chính để chủ động rèn luyện nhân sự.`,
    reasoningSteps,
    claims,
    actionGuidance: [
      'Áp dụng nguyên tắc Dĩ quả quyết hành: tập trung nâng cao năng lực thực chất, giữ kỷ luật tài chính và ứng xử chân thành thay vì trông chờ may rủi.',
      'Tuyệt đối không cần cúng sao giải hạn, không phải cúng bái hay mua bùa chú; vận mệnh chuyển hóa bằng hành động thực tế (Nhân đạo 1/3) và môi trường sống hợp lý (Địa lý 1/3).',
    ],
    disclaimer: `Phân tích tham khảo học thuật từ dữ kiện cấu trúc @tuvi/core (profile '${profile.id}', trạng thái '${profile.status}', bảng sáng '${profile.brightnessSchool}').`,
  };
}

/**
 * Formats an assistant turn containing `<think>...</think>` followed by canonical JSON.
 * @param {any} interpretation
 */
function formatAssistantWithCoT(interpretation) {
  const thinkBody = (interpretation.reasoningSteps || []).join('\n');
  return `<think>\n${thinkBody}\n</think>\n${JSON.stringify(interpretation, null, 2)}`;
}

/**
 * Mutates a valid interpretation into a realistic `rejected` sample for DPO training
 * across 5 failure modes (`STAR_PALACE_CONTRADICTION`, `SIHUA_CONTRADICTION`,
 * `UNKNOWN_FACT_OR_QUOTE`, `DOCTRINE_SUPERSTITION`, `UNGROUNDED_FATALISTIC_CLAIM`).
 *
 * @param {any} validInterpretation
 * @param {any} context
 * @param {number} modeIndex
 */
function buildRejectedVariant(validInterpretation, context, modeIndex) {
  const rejected = structuredClone(validInterpretation);
  const variant = modeIndex % 5;

  if (variant === 0) {
    // Mode 0: Star-palace hallucination
    const mingStars = new Set(context.chartSummary.mingMajorStars || []);
    const wrongStar = !mingStars.has('Tử Vi') ? 'Tử Vi' : 'Phá Quân';
    rejected.summary = `${wrongStar} tọa thủ Mệnh mang lại uy quyền vượt trội.`;
    return { rejected, rejectionCode: 'STAR_PALACE_CONTRADICTION' };
  }
  if (variant === 1) {
    // Mode 1: Wrong Tứ Hóa hallucination
    const actualJi = context.chartSummary.siHua?.find(s => s.transformation === 'Hóa Kỵ')?.starNameVi;
    const wrongJiStar = actualJi === 'Thiên Lương' ? 'Vũ Khúc' : 'Thiên Lương';
    rejected.summary = `Năm sinh có ${wrongJiStar} Hóa Kỵ gây biến động mạnh.`;
    return { rejected, rejectionCode: 'SIHUA_CONTRADICTION' };
  }
  if (variant === 2) {
    // Mode 2: Fabricated quoteId & ungrounded factId
    rejected.claims[0].quoteIds = ['TK.99X.999'];
    rejected.claims[0].factIds.push('FAKE.HALLUCINATED.FACT');
    return { rejected, rejectionCode: 'UNKNOWN_FACT_ID' };
  }
  if (variant === 3) {
    // Mode 3: Violating Thiên Kỷ anti-superstition doctrine
    rejected.actionGuidance = ['Năm nay gặp sát tinh nên đi cúng sao giải hạn và đeo bùa bình an đầu năm.'];
    return { rejected, rejectionCode: 'DOCTRINE_SUPERSTITION' };
  }
  // Mode 4: Ungrounded fatalistic guarantee
  rejected.claims[0].statement = `${rejected.claims[0].statement} Đương số chắc chắn phát tài, giàu có, sống thọ trăm tuổi.`;
  return { rejected, rejectionCode: 'UNGROUNDED_FATALISTIC_CLAIM' };
}

/**
 * Builds a verified SFT + DPO + Distillation bundle for a single computed natal chart.
 * Throws immediately if PII firewall or Validator fails on `chosen` (or passes on `rejected`).
 *
 * @param {any} natalResult
 * @param {{
 *   corpus?: any,
 *   question?: string,
 *   focusPalace?: string,
 *   variantIndex?: number,
 *   maxPromptTokens?: number,
 * }} [options]
 */
function buildTrainingBundle(natalResult, options = {}) {
  const corpus = options.corpus || loadCorpus();
  const baseContext = buildAnonymizedContext(natalResult, {
    question: options.question,
    focusPalace: options.focusPalace,
  });
  const retrievedQuotes = corpus.retrieve({
    context: baseContext,
    question: baseContext.question || undefined,
    focusPalace: baseContext.focusPalaceId || undefined,
    topK: 6,
  });
  const context = { ...baseContext, retrievedQuotes };
  const {
    systemPrompt,
    userPrompt,
    promptChars,
    promptTokensEstimate,
    includedFacts,
    includedQuotes,
  } = buildPrompts(context, {
    maxPromptTokens: options.maxPromptTokens,
  });
  const budgetedContext = {
    ...context,
    promptFacts: includedFacts,
    retrievedQuotes: includedQuotes,
  };

  // Strict PII check on outbound prompts
  const promptWithoutQuotes = buildPrompts({ ...context, retrievedQuotes: [] }, {
    maxPromptTokens: options.maxPromptTokens,
  }).userPrompt;
  assertNoBirthPii(`${systemPrompt}\n${promptWithoutQuotes}`, natalResult, [], { scanFreeTextPatterns: false });

  const chosenInterpretation = synthesizeGroundedInterpretation(budgetedContext);
  const chosenValidation = validateInterpretation(chosenInterpretation, natalResult, includedQuotes);
  if (!chosenValidation.valid) {
    throw new Error(`Chosen training sample failed validation: ${JSON.stringify(chosenValidation.errors)}`);
  }
  const chosenAssistant = formatAssistantWithCoT(chosenInterpretation);
  assertNoBirthPii(chosenAssistant, natalResult, [], { scanFreeTextPatterns: false });

  const { rejected, rejectionCode } = buildRejectedVariant(
    chosenInterpretation,
    budgetedContext,
    options.variantIndex ?? 0,
  );
  const rejectedValidation = validateInterpretation(rejected, natalResult, includedQuotes);
  if (rejectedValidation.valid) {
    throw new Error(`Rejected DPO sample unexpectedly passed validation (${rejectionCode}).`);
  }
  const rejectedAssistant = formatAssistantWithCoT(rejected);

  const responseJsonSchema = buildResponseJsonSchema(budgetedContext, includedQuotes);
  const metadata = {
    profileId: budgetedContext.profile.id,
    wuxingJu: budgetedContext.chartSummary.wuxingJu,
    yinYangGender: budgetedContext.chartSummary.yinYangGender,
    mingBranch: budgetedContext.chartSummary.mingBranchLabelVi,
    mingIsEmpty: budgetedContext.chartSummary.mingIsEmpty,
    mingMajorStars: budgetedContext.chartSummary.mingMajorStars,
    siHuaStars: budgetedContext.chartSummary.siHua.map(s => `${s.starNameVi}:${s.transformation}`),
    focusPalaceId: budgetedContext.focusPalaceId,
    promptChars,
    promptTokensEstimate,
    quoteIds: includedQuotes.map(q => q.id),
  };

  return {
    sft: {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: chosenAssistant },
      ],
      metadata,
    },
    dpo: {
      prompt: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      chosen: [{ role: 'assistant', content: chosenAssistant }],
      rejected: [{ role: 'assistant', content: rejectedAssistant }],
      rejectionCode,
      observedErrors: rejectedValidation.errors.map(e => e.code),
      metadata,
    },
    distillPrompt: {
      systemPrompt,
      userPrompt,
      responseJsonSchema,
      metadata,
    },
  };
}

/**
 * Deterministically samples a stratified set of charts covering all 14 major stars,
 * empty-Ming charts, all 10 Heavenly Stems (Tứ Hóa tables), all 5 Cục, late-Zi, leap months,
 * and Vietnamese/Chinese divergent dates.
 *
 * @param {{ count?: number, profileId?: string }} [options]
 */
function sampleStratifiedCharts(options = {}) {
  const targetCount = Math.max(20, Math.min(5000, Number(options.count) || 120));
  const profileId = options.profileId || 'thienky-candidate';
  const profile = core.getProfile(profileId);

  /** @type {Array<{ birth: import('../../tuvi-core').BirthInput, natalResult: any, topic: { focusPalace?: string, question?: string } }>} */
  const selected = [];
  const seenHashes = new Set();
  const coveredMajorStars = new Set();
  const coveredStems = new Set();
  const coveredJu = new Set();
  let emptyMingCount = 0;

  const tryAdd = (birth, topicIdx) => {
    let norm;
    try {
      norm = core.normalizeBirth(birth, profile, { boundaryMinutes: 0 });
    } catch {
      return null;
    }
    if (norm.status !== 'ok') return null;
    const computed = core.computeNatal(norm.chart, profile);
    if (seenHashes.has(computed.hash)) return null;
    const decorated = core.decorateNatal(computed.natal);
    const ming = decorated.palaces.find(p => p.branch === decorated.mingGongBranch);
    const mingMajors = (ming?.stars || []).filter(s => s.type === 'major').map(s => s.id);
    const stem = computed.natal.lunarInfo.yearStem;
    const ju = computed.natal.wuxingJu;

    const bringsNewCoverage = mingMajors.some(id => !coveredMajorStars.has(id))
      || !coveredStems.has(stem)
      || !coveredJu.has(ju)
      || (mingMajors.length === 0 && emptyMingCount < Math.ceil(targetCount * 0.15));

    seenHashes.add(computed.hash);
    for (const id of mingMajors) coveredMajorStars.add(id);
    coveredStems.add(stem);
    coveredJu.add(ju);
    if (mingMajors.length === 0) emptyMingCount++;

    const topic = TOPIC_PROMPTS[topicIdx % TOPIC_PROMPTS.length];
    const item = {
      birth,
      natalResult: {
        ...computed,
        normalization: { input: birth, chart: norm.chart, audit: norm.audit, warnings: norm.warnings },
      },
      topic,
      bringsNewCoverage,
    };
    return item;
  };

  // Seed special boundary & calendar-divergent cases first
  /** @type {import('../../tuvi-core').BirthInput[]} */
  const specialSeeds = [
    { calendar: 'solar', date: '1968-01-29', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'vietnamese' },
    { calendar: 'solar', date: '1968-01-29', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'female', calendarConvention: 'chinese' },
    { calendar: 'solar', date: '2025-01-29', time: '08:00', tz: 'Asia/Ho_Chi_Minh', gender: 'female', calendarConvention: 'vietnamese' },
    { calendar: 'lunar', date: '1990-05-15', isLeap: true, time: '00:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
    { calendar: 'solar', date: '1995-10-23', time: '14:00', tz: 'Asia/Ho_Chi_Minh', gender: 'male', calendarConvention: 'vietnamese' },
    { calendar: 'solar', date: '1990-03-10', time: '23:30', tz: 'Asia/Ho_Chi_Minh', gender: 'female' },
    { calendar: 'solar', date: '1990-01-06', time: '06:00', tz: 'Asia/Ho_Chi_Minh', gender: 'male' },
  ];
  specialSeeds.forEach((seed, idx) => {
    const added = tryAdd(seed, idx);
    if (added) selected.push(added);
  });

  // Deterministic stride across years 1954..2030, months 1..12, days 1..28, hours 0..22
  const hours = ['00:20', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '23:30'];
  let cursor = 0;
  while (selected.length < targetCount && cursor < targetCount * 16) {
    const year = 1954 + ((cursor * 7) % 76);
    const month = ((cursor * 5) % 12) + 1;
    const day = ((cursor * 11) % 28) + 1;
    const time = hours[cursor % hours.length];
    const gender = cursor % 2 === 0 ? 'male' : 'female';
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    /** @type {import('../../tuvi-core').BirthInput} */
    const candidateBirth = {
      calendar: 'solar',
      date,
      time,
      tz: 'Asia/Ho_Chi_Minh',
      gender,
      ...(cursor % 9 === 0 ? { calendarConvention: 'vietnamese' } : { calendarConvention: 'chinese' }),
    };
    const item = tryAdd(candidateBirth, cursor);
    if (item && (item.bringsNewCoverage || cursor >= 60)) {
      selected.push(item);
    }
    cursor++;
  }

  return {
    items: selected.slice(0, targetCount),
    coverage: {
      totalCharts: Math.min(selected.length, targetCount),
      majorStarsCovered: coveredMajorStars.size,
      stemsCovered: coveredStems.size,
      wuxingJuCovered: coveredJu.size,
      emptyMingCharts: emptyMingCount,
    },
  };
}

/**
 * Verifies an SFT JSONL record (`{ messages: [system, user, assistant] }`) produced by
 * an external Teacher LLM by extracting the embedded chart `facts` + `retrievedQuotes`
 * from the user prompt and running `extractJsonResponse` + `validateInterpretation` + PII scan.
 *
 * @param {any} record
 */
function verifyDatasetRecord(record) {
  if (!record || !Array.isArray(record.messages) || record.messages.length < 3) {
    return { valid: false, errors: [{ code: 'INVALID_RECORD', path: '$.messages', message: 'Bản ghi phải có mảng messages gồm system, user, assistant.' }] };
  }
  const userMsg = record.messages.find(m => m?.role === 'user')?.content || '';
  const assistantMsg = record.messages.find(m => m?.role === 'assistant')?.content || '';

  const braceStart = userMsg.indexOf('{');
  const braceEnd = userMsg.lastIndexOf('}');
  if (braceStart === -1 || braceEnd <= braceStart) {
    return { valid: false, errors: [{ code: 'PROMPT_PAYLOAD_MISSING', path: '$.messages[user]', message: 'Không tìm thấy JSON ngữ cảnh trong user prompt.' }] };
  }

  let promptPayload;
  try {
    promptPayload = JSON.parse(userMsg.slice(braceStart, braceEnd + 1));
  } catch (err) {
    return { valid: false, errors: [{ code: 'PROMPT_JSON_INVALID', path: '$.messages[user]', message: String(err) }] };
  }

  // Scan assistant output for accidentally hallucinated dates/times/coordinates
  try {
    assertNoBirthPii(assistantMsg, {}, [], { scanFreeTextPatterns: true });
  } catch (piiErr) {
    return { valid: false, errors: [{ code: 'PRIVACY_VIOLATION', path: '$.messages[assistant]', message: piiErr.message }] };
  }

  let parsedAssistant;
  try {
    parsedAssistant = extractJsonResponse(assistantMsg);
  } catch (parseErr) {
    return { valid: false, errors: [{ code: 'JSON_PARSE_ERROR', path: '$.messages[assistant]', message: String(parseErr) }] };
  }

  const syntheticNatal = { facts: Array.isArray(promptPayload.facts) ? promptPayload.facts : [] };
  const allowedQuotes = Array.isArray(promptPayload.retrievedQuotes) ? promptPayload.retrievedQuotes : [];
  return validateInterpretation(parsedAssistant, syntheticNatal, allowedQuotes);
}

module.exports = {
  TOPIC_PROMPTS,
  buildChainOfThought,
  synthesizeGroundedInterpretation,
  formatAssistantWithCoT,
  buildTrainingBundle,
  sampleStratifiedCharts,
  verifyDatasetRecord,
};
