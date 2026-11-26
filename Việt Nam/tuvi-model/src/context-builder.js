'use strict';

const core = require('../../tuvi-core');
const { ModelLayerError } = require('./schema');

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

const MAJOR_STAR_IDS = new Set([
  'STAR.ZIWEI', 'STAR.TIANJI', 'STAR.TAIYANG', 'STAR.WUQU', 'STAR.TIANTONG',
  'STAR.LIANZHEN', 'STAR.TIANFU', 'STAR.TAIYIN', 'STAR.TANLANG', 'STAR.JUMEN',
  'STAR.TIANXIANG', 'STAR.TIANLIANG', 'STAR.QISHA', 'STAR.POJUN',
]);

const KEY_AUX_STAR_IDS = new Set([
  'STAR.ZUOFU', 'STAR.YOUBI', 'STAR.WENCHANG', 'STAR.WENQU',
  'STAR.LUCUN', 'STAR.TIANMA', 'STAR.QINGYANG', 'STAR.TUOLUO',
  'STAR.HUOXING', 'STAR.LINGXING', 'STAR.TIANKUI', 'STAR.TIANYUE',
  'STAR.DIKONG', 'STAR.DIJIE',
]);

// Free-text birth date / clock time / timezone / coordinate patterns
const FREE_TEXT_PII_PATTERNS = [
  // Numeric dates: 5/3/1990, 05/03/1990, 5-3-1990, 1990-03-05, 1990/3/5, 05.03.1990
  {
    label: 'freeText.numericDate',
    re: /(?<!\d)(?:(?:19\d{2}|20\d{2})[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19\d{2}|20\d{2}))(?!\d)/u,
  },
  // Vietnamese spoken dates: "ngày 5 tháng 3", "tháng 3 năm 1990", "sinh năm 1990", "sn 1990"
  {
    label: 'freeText.spokenBirthDate',
    re: /(?<![\p{L}\p{N}])(?:sinh\s+ngày|ngày\s+sinh|ngày\s+\d{1,2}\s+tháng\s+\d{1,2}|tháng\s+\d{1,2}\s+năm\s+(?:19|20)\d{2}|sinh\s+năm\s+(?:19|20)\d{2}|sn\s*(?:19|20)\d{2})(?![\p{L}\p{N}])/iu,
  },
  // Clock birth times: "6h sáng", "6h30", "18 giờ 15", "lúc 06:00" (ignoring [00:06:00] lecture timestamps)
  {
    label: 'freeText.clockBirthTime',
    re: /(?:(?<![\p{L}\p{N}])(?:sinh\s+lúc|lúc)\s+\d{1,2}\s*(?:h|giờ|:)\s*\d{0,2}|(?<![\p{L}\p{N}])(?:[01]?\d|2[0-3])\s*(?:h|giờ)\s*(?:[0-5]\d)?\s*(?:phút\s*)?(?:sáng|trưa|chiều|tối|đêm|khuya)(?![\p{L}\p{N}]))/iu,
  },
  // IANA timezones
  {
    label: 'freeText.ianaTimezone',
    re: /\b(?:Asia|Europe|America|Australia|Pacific|Africa|Etc)\/[A-Za-z0-9_+-]+\b/u,
  },
];

/**
 * Scans free-form user input (such as `question`) for birth dates, clock birth times,
 * or IANA timezones so users cannot accidentally send birth PII in free text.
 *
 * @param {string | null | undefined} question
 */
function scanQuestionForBirthPii(question) {
  if (typeof question !== 'string' || !question.trim()) return;
  const normalized = question.normalize('NFC');
  for (const { label, re } of FREE_TEXT_PII_PATTERNS) {
    if (re.test(normalized)) {
      throw new ModelLayerError(
        'PRIVACY_VIOLATION',
        `Câu hỏi chứa thông tin ngày/giờ sinh hoặc múi giờ (${label}). Vui lòng chỉ hỏi về chủ đề luận giải, không nhập ngày giờ sinh vào câu hỏi.`,
        { label },
      );
    }
  }
}

/**
 * Estimates token count for mixed Vietnamese + JSON text (~2.7 chars/token).
 * @param {string} text
 * @returns {number}
 */
function estimatePromptTokens(text) {
  return Math.ceil(String(text || '').length / 2.7);
}

/**
 * Selects a compact, high-signal subset of `@tuvi/core` facts centered on Mệnh, Thân,
 * Phúc Đức, Tứ Hóa, and the active `focusPalaceId` + its Tam Phương Tứ Chính
 * (including `HAS_BRIGHTNESS_AT_PALACE` and `HAS_SANFANGSIZHENG_MEMBER` so models have IDs to cite).
 *
 * @param {any[]} allFacts
 * @param {any[]} relations
 * @param {{ mingPalaceId: string, shenPalaceId: string, focusPalaceId: string | null }} anchors
 */
function selectPromptFacts(allFacts, relations, anchors) {
  const mingId = anchors.mingPalaceId || 'PALACE.MING';
  const centerId = anchors.focusPalaceId || mingId;
  const primaryPalaces = new Set([mingId, 'PALACE.FUDE', centerId]);
  if (anchors.shenPalaceId) primaryPalaces.add(anchors.shenPalaceId);

  const activePalaces = new Set(primaryPalaces);
  const centerRel = Array.isArray(relations)
    ? relations.find(r => r.palaceId === centerId)
    : null;
  if (centerRel && Array.isArray(centerRel.sanFangSiZheng)) {
    for (const relPalace of centerRel.sanFangSiZheng) {
      if (relPalace?.id) activePalaces.add(relPalace.id);
    }
  }

  const firstThreeDecadeIds = new Set(
    allFacts
      .filter(f => f.predicate === 'HAS_DECADAL_AGE_RANGE' && Array.isArray(f.value))
      .sort((a, b) => a.value[0] - b.value[0])
      .slice(0, 3)
      .map(f => f.id),
  );

  const filtered = allFacts.filter(fact => {
    if (fact.kind === 'chart' || fact.kind === 'transformation') return true;
    if (fact.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR') {
      return primaryPalaces.has(fact.subjectId);
    }
    if (fact.predicate === 'HAS_NO_MAJOR_STAR') {
      return fact.subjectId === mingId || (fact.value === true && primaryPalaces.has(fact.subjectId));
    }
    if (fact.predicate === 'HAS_DECADAL_AGE_RANGE') {
      return firstThreeDecadeIds.has(fact.id) || fact.subjectId === centerId || fact.subjectId === mingId;
    }
    if (fact.predicate === 'LOCATED_AT_BRANCH') {
      return fact.subjectId === 'CHART.MING' || fact.subjectId === centerId || fact.subjectId === mingId;
    }
    if (fact.predicate === 'LOCATED_IN') {
      if (MAJOR_STAR_IDS.has(fact.subjectId)) return true;
      if (KEY_AUX_STAR_IDS.has(fact.subjectId) && fact.objectId === centerId) return true;
      return false;
    }
    if (fact.predicate === 'HAS_BRIGHTNESS_AT_PALACE') {
      return MAJOR_STAR_IDS.has(fact.subjectId) && Boolean(fact.objectId && (fact.objectId === centerId || fact.objectId === mingId));
    }
    if (fact.predicate === 'OPPOSITE_TO' || fact.predicate === 'TRINE_WITH') {
      return fact.subjectId === centerId;
    }
    if (fact.predicate === 'HAS_SANFANGSIZHENG_MEMBER') {
      return fact.subjectId === centerId;
    }
    return false;
  });

  const factPriority = fact => {
    if (fact.kind === 'chart' || fact.kind === 'transformation') return 0;
    if (fact.subjectId === mingId || fact.objectId === mingId || fact.subjectId === centerId || fact.objectId === centerId) return 1;
    if (fact.predicate === 'LOCATED_IN' && MAJOR_STAR_IDS.has(fact.subjectId)) return 2;
    return 3;
  };
  return filtered.sort((a, b) => factPriority(a) - factPriority(b));
}

/**
 * Builds a structural chart context with direct birth identifiers stripped.
 * Always recomputes `facts`, `relations`, and `displayNatal` from `natalResult.natal`
 * when `recomputeFromNatal !== false` so untrusted client modifications cannot poison context.
 *
 * @param {any} natalResult Output of `@tuvi/core` `computeNatal`
 * @param {{ question?: string, focusPalace?: string, retrievedQuotes?: any[], recomputeFromNatal?: boolean }} [options]
 */
function buildAnonymizedContext(natalResult, options = {}) {
  if (!natalResult || typeof natalResult !== 'object' || !natalResult.natal) {
    throw new TypeError('natalResult phải chứa trường natal từ @tuvi/core.');
  }

  scanQuestionForBirthPii(options.question);

  const recompute = options.recomputeFromNatal !== false;
  const decorated = recompute
    ? core.decorateNatal(natalResult.natal)
    : (natalResult.displayNatal ?? core.decorateNatal(natalResult.natal));
  const facts = recompute
    ? core.buildFacts(natalResult.natal)
    : (Array.isArray(natalResult.facts) ? natalResult.facts : core.buildFacts(natalResult.natal));
  const relations = recompute
    ? core.buildRelations(natalResult.natal)
    : (Array.isArray(natalResult.relations) ? natalResult.relations : core.buildRelations(natalResult.natal));

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
        id: s.id,
        nameVi: s.labelVi || s.name,
        brightnessVi: s.brightnessLabelVi || s.brightnessRaw || '',
        siHuaVi: s.siHuaLabelVi || '',
      }));
    const otherStars = palace.stars
      .filter(s => s.type !== 'major')
      .map(s => ({
        id: s.id,
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
        transformationId: fact.objectId,
        transformation: decStar.siHuaLabelVi || decStar.siHua,
        starId: fact.subjectId,
        starNameVi: decStar.labelVi || decStar.name,
        palaceId: decPalace.id,
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
    const query = options.focusPalace.normalize('NFC').trim().toLowerCase();
    const matched = palaces.find(
      p => p.id.toLowerCase() === query || p.nameVi.normalize('NFC').toLowerCase() === query,
    );
    focusPalaceId = matched ? matched.id : null;
  }

  // Also infer focusPalaceId from question if user mentioned a specific palace name
  const cleanQuestion = typeof options.question === 'string' && options.question.trim()
    ? options.question.normalize('NFC').trim().slice(0, 500)
    : null;
  if (!focusPalaceId && cleanQuestion) {
    const qLower = cleanQuestion.toLowerCase();
    const mentioned = palaces.find(p => p.id !== 'PALACE.MING' && qLower.includes(p.nameVi.normalize('NFC').toLowerCase()));
    if (mentioned) focusPalaceId = mentioned.id;
  }

  const mingSummary = palaces.find(p => p.branch === decorated.mingGongBranch);
  const rawWarnings = Array.isArray(natalResult.normalization?.warnings)
    ? natalResult.normalization.warnings
    : (Array.isArray(natalResult.warnings) ? natalResult.warnings : []);
  // Keep only safe warning codes (strip any embedded date suffix like SCENARIO_BLOCKED_DIVERGENCE:1968-01-29!)
  const safeWarnings = rawWarnings
    .filter(w => typeof w === 'string' && /^[A-Z0-9_:-]+$/.test(w))
    .map(w => w.replace(/:\d{4}-\d{2}-\d{2}$/, ''));

  const strippedFacts = facts.map(({ id, kind, subjectId, predicate, objectId, value }) => ({
    id,
    kind,
    subjectId,
    predicate,
    ...(objectId !== undefined ? { objectId } : {}),
    ...(value !== undefined ? { value } : {}),
  }));

  const promptFacts = selectPromptFacts(strippedFacts, relations, {
    mingPalaceId: mingPalace?.id || 'PALACE.MING',
    shenPalaceId: shenPalace?.id || '',
    focusPalaceId,
  });

  return {
    schemaVersion: 'tuvi.context.v0',
    privacy: {
      birthDataStripped: true,
      strippedFields: [...STRIPPED_PII_FIELDS],
      structuralReidentificationRisk: /** @type {const} */ ('non-zero'),
    },
    profile: {
      id: natalResult.profile?.id ?? 'unknown',
      status: natalResult.profile?.status ?? 'candidate',
      brightnessSchool: natalResult.profile?.brightnessSchool ?? 'XD2',
      leapMonth: natalResult.profile?.leapMonth ?? 'next-month',
      lateZi: natalResult.profile?.lateZi ?? 'current-day',
    },
    warnings: safeWarnings,
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
    facts: strippedFacts,
    promptFacts,
    relations,
    focusPalaceId,
    question: cleanQuestion,
    retrievedQuotes: Array.isArray(options.retrievedQuotes) ? options.retrievedQuotes : [],
  };
}

/**
 * Runtime privacy firewall: throws `ModelLayerError('PRIVACY_VIOLATION', ...)` if any
 * exact OR unpadded birth date, clock birth time, timezone, coordinates, or user-supplied
 * sensitive value appears in an outbound model payload.
 *
 * Generic free-text regex scanning (`FREE_TEXT_PII_PATTERNS`) is applied ONLY to user-entered
 * free text (via `scanQuestionForBirthPii` or when `options.scanFreeTextPatterns` is not false
 * on standalone strings), never on static lecture quotes from the Thiên Kỷ corpus (which
 * legitimately explain concepts like "11 giờ đêm đến 1 giờ sáng" for Giờ Tý).
 *
 * @param {string} serializedText
 * @param {any} natalResult
 * @param {string[]} [extraSensitiveValues]
 * @param {{ scanFreeTextPatterns?: boolean }} [options]
 * @returns {{ passed: true, checkedLength: number }}
 */
function assertNoBirthPii(serializedText, natalResult, extraSensitiveValues = [], options = {}) {
  const normalized = String(serializedText ?? '').normalize('NFC');
  const withoutTimestamps = normalized.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '');

  const shouldScanGenericPatterns = options.scanFreeTextPatterns !== false;
  if (shouldScanGenericPatterns) {
    for (const { label, re } of FREE_TEXT_PII_PATTERNS) {
      if (re.test(withoutTimestamps)) {
        throw new ModelLayerError(
          'PRIVACY_VIOLATION',
          `Vi phạm quyền riêng tư: phát hiện ngày giờ sinh, múi giờ hoặc tọa độ (${label}) trong dữ liệu gửi tới model.`,
          { label },
        );
      }
    }
  }

  /** @type {Array<{ label: string, value: string, isTime?: boolean }>} */
  const forbidden = [];
  const addDateVariants = (label, y, m, d) => {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return;
    const absM = Math.abs(m);
    const mm = String(absM).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    // Both zero-padded AND unpadded variants (e.g. 05/03/1990 AND 5/3/1990!)
    forbidden.push({ label, value: `${y}-${mm}-${dd}` });
    forbidden.push({ label, value: `${y}-${absM}-${d}` });
    forbidden.push({ label, value: `${dd}/${mm}/${y}` });
    forbidden.push({ label, value: `${d}/${absM}/${y}` });
    forbidden.push({ label, value: `${dd}-${mm}-${y}` });
    forbidden.push({ label, value: `${d}-${absM}-${y}` });
  };

  const b = natalResult?.natal?.birthInfo;
  if (b) addDateVariants('birthInfo.date', b.year, b.month, b.day);

  const l = natalResult?.natal?.lunarInfo;
  if (l) addDateVariants('lunarInfo.date', l.lunarYear, l.lunarMonth, l.lunarDay);

  const input = natalResult?.normalization?.input;
  if (input) {
    if (typeof input.date === 'string' && input.date.length >= 6) {
      forbidden.push({ label: 'normalization.input.date', value: input.date });
      const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.date);
      if (parts) addDateVariants('normalization.input.date', Number(parts[1]), Number(parts[2]), Number(parts[3]));
    }
    if (typeof input.time === 'string' && /^\d{1,2}:\d{2}$/.test(input.time)) {
      forbidden.push({ label: 'normalization.input.time', value: input.time, isTime: true });
    }
    if (typeof input.tz === 'string' && input.tz.trim().length >= 3) {
      forbidden.push({ label: 'normalization.input.tz', value: input.tz.trim() });
    }
    if (input.place && typeof input.place.lat === 'number' && typeof input.place.lon === 'number') {
      forbidden.push({ label: 'normalization.input.place', value: `${input.place.lat}` });
      forbidden.push({ label: 'normalization.input.place', value: `${input.place.lon}` });
    }
  }

  for (const extra of extraSensitiveValues) {
    if (typeof extra === 'string' && extra.normalize('NFC').trim().length >= 3) {
      forbidden.push({ label: 'extraSensitive', value: extra.normalize('NFC').trim() });
    }
  }

  for (const item of forbidden) {
    if (item.isTime) {
      const escaped = item.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\d:\\[])${escaped}(?![\\d:\\]])`);
      if (re.test(withoutTimestamps)) {
        throw new ModelLayerError(
          'PRIVACY_VIOLATION',
          `Vi phạm quyền riêng tư: phát hiện dữ kiện sinh (${item.label}) trong payload gửi tới model.`,
          { label: item.label },
        );
      }
      continue;
    }
    if (withoutTimestamps.includes(item.value)) {
      throw new ModelLayerError(
        'PRIVACY_VIOLATION',
        `Vi phạm quyền riêng tư: phát hiện dữ kiện sinh (${item.label}) trong payload gửi tới model.`,
        { label: item.label },
      );
    }
  }

  return { passed: true, checkedLength: normalized.length };
}

/**
 * Builds profile-aware system and user prompts within a configurable token budget
 * (`maxPromptTokens`, default 4096 at ~2.7 Vietnamese chars/token ≈ 11,000 chars max;
 * typical output ~8.5–10.5 KB ≈ 3.1k–3.9k tokens), enforcing structured `assertions`,
 * `factIds`, `quoteIds`, profile caveats, and zero hallucination.
 *
 * @param {any} context AnonymizedContext
 * @param {{ maxPromptTokens?: number }} [options]
 */
function buildPrompts(context, options = {}) {
  const configuredMaxTokens = options.maxPromptTokens
    ?? (Number(process.env.TUVI_PROMPT_MAX_TOKENS) || 4096);
  const maxPromptTokens = Math.max(1200, configuredMaxTokens);
  const maxCharBudget = Math.floor(maxPromptTokens * 2.7) - 1;

  const profile = context.profile || {};
  const candidateNote = profile.status !== 'confirmed'
    ? `Lưu ý cấu hình: profile '${profile.id}' đang ở trạng thái '${profile.status}' (bảng sáng '${profile.brightnessSchool}', tháng nhuận '${profile.leapMonth}', Tý muộn '${profile.lateZi}'); tuyệt đối không tuyên bố lá số hay độ sáng đã được xác nhận 100%.`
    : `Cấu hình lập số: profile '${profile.id}' (bảng sáng '${profile.brightnessSchool}').`;

  const systemPrompt = [
    'Bạn là trợ lý phân tích cấu trúc Tử Vi Đẩu Số theo hệ phái Thiên Kỷ (Nghê Hải Hạ).',
    candidateNote,
    'QUY TẮC BẮT BUỘC:',
    '1. KHÔNG tự tính hay suy đoán vị trí sao. Mọi nhận định về sao, cung, độ sáng, Tứ Hóa, đại hạn chỉ được phép lấy từ `facts` và `palaces` trong ngữ cảnh.',
    '2. Mỗi phần tử trong `claims` BẮT BUỘC phải có cả `factIds` VÀ mảng `assertions` có cấu trúc `{ subjectId, predicate, objectId?, value? }` khớp chính xác từng dữ kiện đã dùng trong `facts`. Không gắn thừa `factId` ngoài `assertions`.',
    '3. Chỉ trích dẫn `quoteIds` có thật trong `retrievedQuotes` (nếu `retrievedQuotes` rỗng thì để `quoteIds: []`). Không bịa trích dẫn, không phán đoán định mệnh tuyệt đối về tuổi thọ hay giàu sang chắc chắn.',
    '4. Tuân thủ triết lý Thiên Kỷ: Tam Tài (Thiên 1/3 + Địa 1/3 + Nhân 1/3 = 1), Dĩ quả quyết hành, tuyệt đối KHÔNG khuyên cúng sao giải hạn, mua bùa chú hay mê tín.',
    '5. Trả về DUY NHẤT một JSON object hợp lệ theo schema `tuvi.interpretation.v0`: { schemaVersion, summary, reasoningSteps, claims: [{ id, category, statement, assertions, factIds, quoteIds, confidence }], actionGuidance, disclaimer }.',
  ].join('\n');

  const compactPalaces = context.palaces.map(p => ({
    id: p.id,
    nameVi: p.nameVi,
    branch: p.branchLabelVi,
    ...(p.isMing ? { isMing: true } : {}),
    ...(p.isShen ? { isShen: true } : {}),
    ...(p.isEmpty ? { isEmpty: true, borrowed: p.borrowedStarsVi } : {}),
    daXian: p.daXianAge,
    majorStars: p.majorStars.map(s => `${s.nameVi}${s.brightnessVi ? `(${s.brightnessVi})` : ''}${s.siHuaVi ? `[${s.siHuaVi}]` : ''}`),
  }));

  const selectedFacts = (Array.isArray(context.promptFacts) ? context.promptFacts : context.facts)
    .map(({ id, subjectId, predicate, objectId, value }) => ({
      id,
      subjectId,
      predicate,
      ...(objectId !== undefined ? { objectId } : {}),
      ...(value !== undefined ? { value } : {}),
    }));

  const buildUserPrompt = (factsSlice, quotesSlice, quoteMaxLen) => {
    const compactQuotes = quotesSlice.map(q => ({
      id: q.id,
      source: `${q.sourceFile} [${q.timestamp}]`,
      text: typeof q.text === 'string' && q.text.length > quoteMaxLen ? `${q.text.slice(0, quoteMaxLen)}…` : q.text,
    }));

    const userPayload = {
      profile: context.profile,
      ...(Array.isArray(context.warnings) && context.warnings.length > 0 ? { warnings: context.warnings } : {}),
      chartSummary: context.chartSummary,
      palaces: compactPalaces,
      facts: factsSlice,
      focusPalaceId: context.focusPalaceId,
      question: context.question,
      retrievedQuotes: compactQuotes,
    };

    const serializedPayload = [
      '{',
      `"profile":${JSON.stringify(userPayload.profile)},`,
      ...(userPayload.warnings ? [`"warnings":${JSON.stringify(userPayload.warnings)},`] : []),
      `"chartSummary":${JSON.stringify(userPayload.chartSummary)},`,
      `"focusPalaceId":${JSON.stringify(userPayload.focusPalaceId)},`,
      `"question":${JSON.stringify(userPayload.question)},`,
      '"palaces":[',
      userPayload.palaces.map(p => JSON.stringify(p)).join(',\n'),
      '],',
      '"facts":[',
      userPayload.facts.map(f => JSON.stringify(f)).join(',\n'),
      '],',
      '"retrievedQuotes":[',
      userPayload.retrievedQuotes.map(q => JSON.stringify(q)).join(',\n'),
      ']',
      '}',
    ].join('\n');

    return [
      'Hãy phân tích cấu trúc lá số dưới đây và trả về JSON chuẩn `tuvi.interpretation.v0`:',
      serializedPayload,
    ].join('\n\n');
  };

  const allQuotes = Array.isArray(context.retrievedQuotes) ? context.retrievedQuotes : [];
  let workingFacts = selectedFacts;
  let workingQuotes = allQuotes;
  let userPrompt = buildUserPrompt(workingFacts, workingQuotes, 360);
  const totalLen = () => systemPrompt.length + 1 + userPrompt.length;

  // Enforce configurable token budget progressively across quote length, quote count, and low-priority tail facts
  if (totalLen() > maxCharBudget && workingQuotes.length > 0) {
    userPrompt = buildUserPrompt(workingFacts, workingQuotes, 200);
  }
  while (totalLen() > maxCharBudget && workingQuotes.length > 2) {
    workingQuotes = workingQuotes.slice(0, -1);
    userPrompt = buildUserPrompt(workingFacts, workingQuotes, 180);
  }
  while (totalLen() > maxCharBudget && workingFacts.length > 10) {
    workingFacts = workingFacts.slice(0, Math.max(10, workingFacts.length - 4));
    userPrompt = buildUserPrompt(workingFacts, workingQuotes, 180);
  }
  while (totalLen() > maxCharBudget && workingQuotes.length > 0) {
    workingQuotes = workingQuotes.slice(0, -1);
    userPrompt = buildUserPrompt(workingFacts, workingQuotes, 160);
  }

  const promptChars = systemPrompt.length + userPrompt.length;
  const promptTokensEstimate = estimatePromptTokens(`${systemPrompt}\n${userPrompt}`);

  return { systemPrompt, userPrompt, promptChars, promptTokensEstimate, maxPromptTokens };
}

module.exports = {
  STRIPPED_PII_FIELDS,
  estimatePromptTokens,
  scanQuestionForBirthPii,
  selectPromptFacts,
  buildAnonymizedContext,
  assertNoBirthPii,
  buildPrompts,
};
