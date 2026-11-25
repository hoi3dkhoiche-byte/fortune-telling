'use strict';

const core = require('../../tuvi-core');

const STRIPPED_PII_FIELDS = Object.freeze([
  'birthInfo',
  'lunarInfo',
  'normalization.input',
  'normalization.chart',
  'normalization.audit',
  'userName',
  'place',
  'tz',
  'hash',
]);

const SIHUA_ORDER = Object.freeze({ '禄': 0, '权': 1, '科': 2, '忌': 3 });

/**
 * Builds a strictly anonymized structural chart context for model reasoning.
 * NEVER includes raw birth date, birth time, timezone, geographic coordinates,
 * lunar birth year/month/day, or user name.
 *
 * @param {any} natalResult Output of `@tuvi/core` `computeNatal` (or `/api/natal`)
 * @param {{ question?: string, focusPalace?: string, retrievedQuotes?: any[] }} [options]
 */
function buildAnonymizedContext(natalResult, options = {}) {
  if (!natalResult || typeof natalResult !== 'object' || !natalResult.natal) {
    throw new TypeError('natalResult phải chứa trường natal từ @tuvi/core.');
  }

  const decorated = natalResult.displayNatal ?? core.decorateNatal(natalResult.natal);
  const facts = Array.isArray(natalResult.facts) ? natalResult.facts : core.buildFacts(natalResult.natal);
  const relations = Array.isArray(natalResult.relations) ? natalResult.relations : core.buildRelations(natalResult.natal);

  const palacesByBranch = new Map(decorated.palaces.map(p => [p.branch, p]));
  const mingPalace = decorated.palaces.find(p => p.branch === decorated.mingGongBranch);
  const shenPalace = decorated.palaces.find(p => p.branch === decorated.shenGongBranch);

  const resolveBorrowedVi = palace => {
    if (!palace.isEmpty) return [];
    const opp = palacesByBranch.get(palace.borrowedFromBranch ?? ((palace.branch + 6) % 12));
    if (!opp) return [];
    return opp.stars
      .filter(s => s.type === 'major')
      .map(s => s.labelVi || s.name);
  };

  const palaces = decorated.palaces.map(palace => {
    const majorStars = palace.stars
      .filter(s => s.type === 'major')
      .map(s => ({
        nameVi: s.labelVi || s.name,
        brightnessVi: s.brightnessLabelVi || s.brightnessRaw || '',
        siHuaVi: s.siHuaLabelVi || '',
      }));
    const otherStars = palace.stars
      .filter(s => s.type !== 'major')
      .map(s => ({
        nameVi: s.labelVi || s.name,
        type: s.type,
        brightnessVi: s.brightnessLabelVi || s.brightnessRaw || '',
        siHuaVi: s.siHuaLabelVi || '',
      }));
    return {
      id: palace.id,
      nameVi: palace.labelVi || palace.name,
      branch: palace.branch,
      branchLabelVi: palace.branchLabelVi || '',
      isMing: Boolean(palace.isMingGong),
      isShen: Boolean(palace.isShenGong),
      isEmpty: Boolean(palace.isEmpty),
      daXianAge: Array.isArray(palace.daXianAge) ? [palace.daXianAge[0], palace.daXianAge[1]] : null,
      majorStars,
      otherStars,
      borrowedStarsVi: resolveBorrowedVi(palace),
    };
  });

  // Extract the 4 natal transformations ordered Lộc -> Quyền -> Khoa -> Kỵ
  const siHuaEntries = [];
  for (const fact of facts) {
    if (fact.predicate !== 'HAS_NATAL_TRANSFORMATION') continue;
    const match = /^\/palaces\/(\d+)\/stars\/(\d+)\/siHua$/.exec(fact.sourcePath || '');
    const rawPalace = match ? natalResult.natal.palaces[Number(match[1])] : null;
    const rawStar = rawPalace && match ? rawPalace.stars[Number(match[2])] : null;
    const decPalace = decorated.palaces.find(p => p.branch === rawPalace?.branch);
    const decStar = decPalace?.stars.find(
      s => s.id === fact.subjectId && s.name === rawStar?.name && s.siHua === rawStar?.siHua,
    );
    if (decPalace && decStar) {
      siHuaEntries.push({
        transformation: decStar.siHuaLabelVi || decStar.siHua,
        starNameVi: decStar.labelVi || decStar.name,
        palaceNameVi: decPalace.labelVi || decPalace.name,
        factId: fact.id,
        _order: SIHUA_ORDER[decStar.siHua] ?? 9,
      });
    }
  }
  siHuaEntries.sort((a, b) => a._order - b._order);

  // Resolve optional focusPalace (accepts palaceId like PALACE.CAIBO or Vietnamese name like "Tài Bạch")
  let focusPalaceId = null;
  if (typeof options.focusPalace === 'string' && options.focusPalace.trim()) {
    const query = options.focusPalace.trim().toLowerCase();
    const matched = palaces.find(
      p => p.id.toLowerCase() === query || p.nameVi.toLowerCase() === query,
    );
    focusPalaceId = matched ? matched.id : null;
  }

  const cleanQuestion = typeof options.question === 'string' && options.question.trim()
    ? options.question.trim().slice(0, 500)
    : null;

  const mingSummary = palaces.find(p => p.branch === decorated.mingGongBranch);

  return {
    schemaVersion: 'tuvi.context.v0',
    privacy: {
      birthDataStripped: true,
      strippedFields: [...STRIPPED_PII_FIELDS],
    },
    profile: {
      id: natalResult.profile?.id ?? 'unknown',
      status: natalResult.profile?.status ?? 'candidate',
      brightnessSchool: natalResult.profile?.brightnessSchool ?? 'XD2',
      leapMonth: natalResult.profile?.leapMonth ?? 'next-month',
      lateZi: natalResult.profile?.lateZi ?? 'current-day',
    },
    chartSummary: {
      yinYangGender: decorated.yinYangGender === '阳男' ? 'Dương Nam'
        : decorated.yinYangGender === '阴男' ? 'Âm Nam'
        : decorated.yinYangGender === '阳女' ? 'Dương Nữ'
        : decorated.yinYangGender === '阴女' ? 'Âm Nữ'
        : (decorated.yinYangGender || ''),
      wuxingJu: decorated.wuxingJu,
      wuxingJuLabelVi: decorated.wuxingJuLabelVi || decorated.wuxingJuName || '',
      mingPalaceId: mingPalace?.id || 'PALACE.MING',
      mingBranchLabelVi: mingPalace?.branchLabelVi || '',
      shenPalaceId: shenPalace?.id || '',
      shenPalaceLabelVi: shenPalace?.labelVi || shenPalace?.name || '',
      mingIsEmpty: Boolean(mingSummary?.isEmpty),
      mingMajorStars: (mingSummary?.majorStars || []).map(s => s.nameVi),
      mingBorrowedStars: mingSummary?.borrowedStarsVi || [],
      mingZhuLabelVi: decorated.mingZhuLabelVi || decorated.mingZhu || '',
      shenZhuLabelVi: decorated.shenZhuLabelVi || decorated.shenZhu || '',
      siHua: siHuaEntries.map(({ _order, ...entry }) => entry),
    },
    palaces,
    facts: facts.map(({ id, kind, subjectId, predicate, objectId, value }) => ({
      id,
      kind,
      subjectId,
      predicate,
      ...(objectId !== undefined ? { objectId } : {}),
      ...(value !== undefined ? { value } : {}),
    })),
    relations,
    focusPalaceId,
    question: cleanQuestion,
    retrievedQuotes: Array.isArray(options.retrievedQuotes) ? options.retrievedQuotes : [],
  };
}

/**
 * Runtime privacy firewall: throws if any birth date, birth time, timezone,
 * coordinates, or user-supplied PII accidentally appears in an outbound model payload.
 *
 * @param {string} serializedText
 * @param {any} natalResult
 * @param {string[]} [extraSensitiveValues]
 */
function assertNoBirthPii(serializedText, natalResult, extraSensitiveValues = []) {
  /** @type {Array<{ label: string, value: string }>} */
  const forbidden = [];
  const addDate = (label, y, m, d) => {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return;
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    forbidden.push({ label, value: `${y}-${mm}-${dd}` });
    forbidden.push({ label, value: `${dd}/${mm}/${y}` });
  };

  const b = natalResult?.natal?.birthInfo;
  if (b) addDate('birthInfo.date', b.year, b.month, b.day);

  const l = natalResult?.natal?.lunarInfo;
  if (l) addDate('lunarInfo.date', l.lunarYear, l.lunarMonth, l.lunarDay);

  const input = natalResult?.normalization?.input;
  if (input) {
    if (typeof input.date === 'string' && input.date.length >= 8) {
      forbidden.push({ label: 'normalization.input.date', value: input.date });
    }
    if (typeof input.time === 'string' && /^\d{2}:\d{2}$/.test(input.time)) {
      forbidden.push({ label: 'normalization.input.time', value: input.time });
    }
    if (typeof input.tz === 'string' && input.tz.includes('/')) {
      forbidden.push({ label: 'normalization.input.tz', value: input.tz });
    }
    if (input.place && typeof input.place.lat === 'number' && typeof input.place.lon === 'number') {
      forbidden.push({ label: 'normalization.input.place', value: `${input.place.lat}` });
      forbidden.push({ label: 'normalization.input.place', value: `${input.place.lon}` });
    }
  }

  for (const extra of extraSensitiveValues) {
    if (typeof extra === 'string' && extra.trim().length >= 3) {
      forbidden.push({ label: 'extraSensitive', value: extra.trim() });
    }
  }

  for (const item of forbidden) {
    if (item.label === 'normalization.input.time') {
      const escaped = item.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\d:])${escaped}(?![\\d:])`);
      if (re.test(serializedText)) {
        throw new Error(`Vi phạm quyền riêng tư: phát hiện dữ kiện sinh (${item.label}) trong payload gửi tới model.`);
      }
      continue;
    }
    if (serializedText.includes(item.value)) {
      throw new Error(`Vi phạm quyền riêng tư: phát hiện dữ kiện sinh (${item.label}) trong payload gửi tới model.`);
    }
  }
}

/**
 * Builds system and user prompts enforcing Thiên Kỷ methodology, strict JSON schema,
 * factId grounding, and zero hallucination.
 *
 * @param {any} context AnonymizedContext
 */
function buildPrompts(context) {
  const systemPrompt = [
    'Bạn là trợ lý nghiên cứu Tử Vi Đẩu Số theo hệ phái Thiên Kỷ (Nghê Hải Hạ).',
    'QUY TẮC BẮT BUỘC:',
    '1. KHÔNG tự tính hay suy đoán vị trí sao. Mọi nhận định về sao, cung, Tứ Hóa, đại hạn chỉ được phép lấy từ danh sách `facts` và `palaces` trong ngữ cảnh.',
    '2. Mỗi nhận định trong `claims` BẮT BUỘC phải kèm ít nhất 1 mã `factIds` có thật từ danh sách `facts`.',
    '3. Chỉ trích dẫn `quoteIds` có trong `retrievedQuotes`. Không bịa trích dẫn.',
    '4. Tuân thủ triết lý Thiên Kỷ: Tam Tài (Thiên 1/3 + Địa 1/3 + Nhân 1/3 = 1), Dĩ quả quyết hành, tuyệt đối KHÔNG khuyên cúng sao giải hạn, mua bùa chú hay mê tín.',
    '5. Trả về DUY NHẤT một JSON object hợp lệ theo schema `tuvi.interpretation.v0` gồm: schemaVersion, summary, reasoningSteps, claims[{id, category, statement, factIds, quoteIds, confidence}], actionGuidance, disclaimer.',
  ].join('\n');

  const compactPalaces = context.palaces.map(p => ({
    id: p.id,
    nameVi: p.nameVi,
    branchLabelVi: p.branchLabelVi,
    isMing: p.isMing,
    isShen: p.isShen,
    isEmpty: p.isEmpty,
    daXianAge: p.daXianAge,
    majorStars: p.majorStars,
    borrowedStarsVi: p.borrowedStarsVi,
  }));

  const compactQuotes = (context.retrievedQuotes || []).map(q => ({
    id: q.id,
    source: `${q.sourceFile} [${q.timestamp}]`,
    tags: q.tags,
    text: q.text,
  }));

  const userPayload = {
    chartSummary: context.chartSummary,
    palaces: compactPalaces,
    facts: context.facts,
    focusPalaceId: context.focusPalaceId,
    question: context.question,
    retrievedQuotes: compactQuotes,
  };

  const userPrompt = [
    'Hãy phân tích cấu trúc lá số ẩn danh dưới đây và trả về JSON chuẩn `tuvi.interpretation.v0`:',
    JSON.stringify(userPayload, null, 2),
  ].join('\n\n');

  return { systemPrompt, userPrompt };
}

module.exports = {
  STRIPPED_PII_FIELDS,
  buildAnonymizedContext,
  assertNoBirthPii,
  buildPrompts,
};
