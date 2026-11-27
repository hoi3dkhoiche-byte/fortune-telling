'use strict';

const glossary = require('../../tuvi-core/i18n/vi.json');
const { validateInterpretationSchema } = require('./schema');

const MAJOR_STAR_IDS = new Set([
  'STAR.ZIWEI', 'STAR.TIANJI', 'STAR.TAIYANG', 'STAR.WUQU', 'STAR.TIANTONG',
  'STAR.LIANZHEN', 'STAR.TIANFU', 'STAR.TAIYIN', 'STAR.TANLANG', 'STAR.JUMEN',
  'STAR.TIANXIANG', 'STAR.TIANLIANG', 'STAR.QISHA', 'STAR.POJUN',
]);

// Named auxiliary / Lục Cát / Lục Sát / Đào Hồng Hình Diêu stars safe from everyday single-word collisions
const TRACKED_STAR_IDS = new Set([
  ...MAJOR_STAR_IDS,
  'STAR.ZUOFU', 'STAR.YOUBI', 'STAR.WENCHANG', 'STAR.WENQU',
  'STAR.LUCUN', 'STAR.TIANMA', 'STAR.QINGYANG', 'STAR.TUOLUO',
  'STAR.HUOXING', 'STAR.LINGXING', 'STAR.TIANKUI', 'STAR.TIANYUE',
  'STAR.DIKONG', 'STAR.DIJIE', 'STAR.HONGLUAN', 'STAR.TIANXI',
  'STAR.TIANXING', 'STAR.TIANYAO',
]);

/**
 * Normalizes Unicode NFC + canonicalizes common Vietnamese tone/orthography variants
 * (e.g., NFD decomposed accents, hoá -> hóa, toạ -> tọa, kị -> kỵ, thuỷ -> thủy, quí -> quý, tị -> tỵ).
 *
 * @param {string} raw
 * @returns {string}
 */
function canonicalizeVi(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/(?<![\p{L}\p{N}])hoá(?![\p{L}\p{N}])/gu, 'hóa')
    .replace(/(?<![\p{L}\p{N}])toạ(?![\p{L}\p{N}])/gu, 'tọa')
    .replace(/(?<![\p{L}\p{N}])kị(?![\p{L}\p{N}])/gu, 'kỵ')
    .replace(/(?<![\p{L}\p{N}])thuỷ(?![\p{L}\p{N}])/gu, 'thủy')
    .replace(/(?<![\p{L}\p{N}])quí(?![\p{L}\p{N}])/gu, 'quý')
    .replace(/(?<![\p{L}\p{N}])tị(?![\p{L}\p{N}])/gu, 'tỵ')
    .replace(/(?<![\p{L}\p{N}])tả phù(?![\p{L}\p{N}])/gu, 'tả phụ')
    .replace(/(?<![\p{L}\p{N}])cung mạng(?![\p{L}\p{N}])/gu, 'cung mệnh')
    .replace(/(?<![\p{L}\p{N}])bản mạng(?![\p{L}\p{N}])/gu, 'bản mệnh')
    .replace(/\s+/gu, ' ')
    .trim();
}

const STAR_ID_TO_VI = new Map();
const TRACKED_STAR_VI_TO_ID = new Map();
for (const entry of Object.values(glossary.stars)) {
  STAR_ID_TO_VI.set(entry.id, entry.labelVi);
  if (TRACKED_STAR_IDS.has(entry.id)) {
    TRACKED_STAR_VI_TO_ID.set(canonicalizeVi(entry.labelVi), entry.id);
  }
}

const PALACE_ID_TO_VI = new Map();
const PALACE_VI_TO_ID = new Map();
for (const entry of Object.values(glossary.palaces)) {
  PALACE_ID_TO_VI.set(entry.id, entry.labelVi);
  PALACE_VI_TO_ID.set(canonicalizeVi(entry.labelVi), entry.id);
}

const BRANCH_VI_TO_ID = new Map();
for (const entry of glossary.branches) {
  BRANCH_VI_TO_ID.set(canonicalizeVi(entry.labelVi), entry.id);
}

const TRANSFORMATION_VI_TO_ID = new Map([
  ['hóa lộc', 'SIHUA.LU'],
  ['hóa quyền', 'SIHUA.QUAN'],
  ['hóa khoa', 'SIHUA.KE'],
  ['hóa kỵ', 'SIHUA.JI'],
]);

const SUPERSTITION_TERMS = [
  'cúng sao giải hạn',
  'dâng sao giải hạn',
  'làm lễ giải hạn',
  'cúng giải hạn',
  'mua bùa',
  'đeo bùa',
  'dùng bùa',
  'bùa chú',
  'yểm bùa',
  'cúng bái',
  'cúng lễ hóa giải',
  'xem bói giải hạn',
];

const FATALISTIC_PATTERNS = [
  /sống\s+thọ\s+(?:trăm|ngoài\s+\d+|\d+)\s+tuổi/iu,
  /(?:chắc\s+chắn|ắt\s+sẽ|tất\s+nhiên)\s+(?:giàu\s+có|phát\s+tài|giàu\s+sang|nghèo\s+khổ|phá\s+sản|ly\s+hôn|chết\s+yểu)/iu,
  /(?<![\p{L}\p{N}])giàu\s+có\s*,\s*sống\s+thọ/iu,
  /(?<![\p{L}\p{N}])số\s+giàu\s+sang\s+phú\s+quý\s+trọn\s+đời(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:chết\s+yểu|tuyệt\s+mạng\s+năm|trúng\s+số\s+độc\s+đắc|tai\s+nạn\s+chết\s+người)(?![\p{L}\p{N}])/iu,
];

// Phrases where "tử vi" refers to the astrological discipline/chart rather than the star STAR.ZIWEI
const DISCIPLINE_TUVI_REGEX = /(?<![\p{L}\p{N}])(?:tử\s+vi\s+đẩu\s+số|lá\s+số\s+tử\s+vi|môn\s+tử\s+vi|khoa\s+tử\s+vi|sách\s+tử\s+vi|hệ\s+phái\s+tử\s+vi|phái\s+tử\s+vi|hệ\s+tử\s+vi|học\s+tử\s+vi|xem\s+tử\s+vi|luận\s+tử\s+vi|giải\s+tử\s+vi|thuật\s+tử\s+vi|bàn\s+tử\s+vi|tử\s+vi\s+học)(?![\p{L}\p{N}])/giu;

/**
 * Strips references to "Tử Vi" as the astrological system/chart so they are never
 * mistaken for mentions of the major star `STAR.ZIWEI`.
 * @param {string} canonicalText
 * @returns {string}
 */
function stripDisciplinePhrases(canonicalText) {
  return canonicalText.replace(DISCIPLINE_TUVI_REGEX, ' ');
}

// Strict anti-superstition negation: supports "không cần/phải/nên...", "hãy bài trừ/tránh...", and comma-separated lists like "như đeo bùa, cúng bái"
const STRICT_ANTI_SUPERSTITION_PREFIX = /(?<![\p{L}\p{N}])(?:(?:hãy|cần|nên|phải|luôn)\s+(?:tuyệt đối\s+)?(?:bài trừ|phản đối|loại bỏ|tránh xa|tránh|từ bỏ|bác bỏ)|tuyệt đối không|không cần|không phải|không nên|không được|không áp dụng|không dùng|không tin|không làm|không đi|không hề|không bao giờ|không|chớ|tránh xa|tránh|bài trừ|phản đối|loại bỏ|từ bỏ|bác bỏ|đừng|thay vì)(?:(?:\s+|\s*,\s*)(?:cần|phải|nên|được|hề|bao|giờ|tin|dùng|áp|dụng|làm|đi|nghe|theo|vào|như|là|ví|dụ|chẳng|hạn|kiểu|dạng|hay|hoặc|và|chuyện|việc|hình|thức|mọi|tất|cả|các|những|trò|thói|tệ|mê|tín|dị|đoan|cúng|dâng|sao|giải|hạn|lễ|hóa|mua|đeo|yểm|xin|bùa|chú|bái|xem|bói|tốn|tiền|vô|ích)){0,16}[\s,]*$/iu;
// Do NOT split on bare dashes inside numeric ranges (e.g. 20–30 tuổi) or on "hãy" before anti-superstition verbs
const DIRECTIVE_PIVOT_SPLIT = /[.!?;:\n()]|\s+[—–]\s+|(?<![\p{L}\p{N}])(?:nhưng|mà|tuy nhiên|nên đi|cần đi|phải đi|tốt nhất là|cứ đi|hãy(?!\s+(?:tuyệt đối\s+)?(?:bài trừ|phản đối|loại bỏ|tránh|từ bỏ|bác bỏ|không)))(?![\p{L}\p{N}])/iu;
const CLAUSE_SPLIT = /[.,;!?:\n()]|\s+[—–]\s+|(?<![\p{L}\p{N}])(?:nhưng|còn|mà|đồng thời|trong khi|bên cạnh đó)(?![\p{L}\p{N}])/iu;
const SENTENCE_SPLIT = /[.!?;:\n]+|\s+[—–]\s+/u;

/**
 * @param {string} text
 * @returns {string}
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRACKED_STAR_PATTERN = [...TRACKED_STAR_VI_TO_ID.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

const PALACE_PATTERN = [...PALACE_VI_TO_ID.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

const JU_VI_TO_ID = new Map(Object.values(glossary.wuxingJu)
  .map(entry => [canonicalizeVi(entry.labelVi), entry.id]));
const BRANCH_PATTERN = [...BRANCH_VI_TO_ID.keys()].map(escapeRegex).join('|');
const JU_PATTERN = [...JU_VI_TO_ID.keys()].map(escapeRegex).join('|');
const MING_BRANCH_STATEMENT = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:cung\\s+)?mệnh\\s+(?:an tại|lập tại|tại|ở|cư)\\s+(?:cung\\s+)?(' + BRANCH_PATTERN + ')(?![\\p{L}\\p{N}])', 'giu',
);
const JU_STATEMENT = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:ngũ hành\\s+)?cục(?:\\s+(?:trên|của)\\s+lá số)?\\s+(?:là|thuộc)\\s+(' + JU_PATTERN + ')(?![\\p{L}\\p{N}])', 'giu',
);
const DECADAL_STATEMENT = new RegExp(
  '(?<![\\p{L}\\p{N}])đại hạn\\s+(?:tại|ở)\\s+(?:cung\\s+)?(' + PALACE_PATTERN
  + ')\\s+(?:từ\\s+)?(\\d+)\\s*(?:đến|[-–—])\\s*(\\d+)\\s+tuổi(?![\\p{L}\\p{N}])', 'giu',
);

// Covers: tọa thủ, đóng tại/ở, tọa tại, nhập (cung), tại (cung), ở (cung), cư (cung/tại), nằm ở/tại, thuộc cung
const DIRECT_STAR_PALACE_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}])(${TRACKED_STAR_PATTERN})\\s+(?:được\\s+|đang\\s+|vốn\\s+)?(?:tọa thủ tại|tọa thủ ở|tọa thủ|đóng tại|đóng ở|tọa tại|nhập cung|nhập tại|tại cung|ở cung|cư cung|cư tại|nằm ở|nằm tại|thuộc cung|tọa|đóng|nhập|cư|tại|ở)\\s+(?:cung\\s+)?(${PALACE_PATTERN})(?![\\p{L}\\p{N}])`,
  'giu',
);

const REVERSE_PALACE_STAR_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}])cung\\s+(${PALACE_PATTERN})\\s+có\\s+(?:chính tinh\\s+|sao\\s+)?(${TRACKED_STAR_PATTERN})(?!\\s*(?:chiếu|hội|xung|giáp))(?![\\p{L}\\p{N}])`,
  'giu',
);

const DIRECT_SIHUA_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}])(${TRACKED_STAR_PATTERN})\\s+(?:·\\s*)?(?:gặp\\s+|được\\s+|bị\\s+|có\\s+|mang\\s+)?(hóa lộc|hóa quyền|hóa khoa|hóa kỵ)(?![\\p{L}\\p{N}])`,
  'giu',
);

const STAR_MENTION_REGEX = new RegExp(`(?<![\\p{L}\\p{N}])(${TRACKED_STAR_PATTERN})(?![\\p{L}\\p{N}])`, 'giu');

/**
 * Checks if a text snippet recommends superstition banned by Thiên Kỷ doctrine.
 * Normalizes NFC/orthography and splits on clause boundaries & directive pivots so
 * an earlier unrelated "không" within 32 chars cannot mask a superstitious recommendation.
 *
 * @param {string} rawText
 * @returns {string | null}
 */
function detectSuperstition(rawText) {
  const segments = canonicalizeVi(rawText).split(DIRECTIVE_PIVOT_SPLIT);
  for (const seg of segments) {
    for (const term of SUPERSTITION_TERMS) {
      let idx = seg.indexOf(term);
      while (idx !== -1) {
        const immediatePrefix = seg.slice(Math.max(0, idx - 110), idx);
        if (!STRICT_ANTI_SUPERSTITION_PREFIX.test(immediatePrefix)) {
          return term;
        }
        idx = seg.indexOf(term, idx + term.length);
      }
    }
  }
  return null;
}

/**
 * Detects ungrounded fatalistic fortune-telling statements (longevity guarantees,
 * guaranteed wealth/poverty, etc.) that cannot be derived from structural chart facts.
 * Splits on sentence boundaries (NOT commas!) so patterns like "giàu có, sống thọ" match cleanly.
 *
 * @param {string} rawText
 * @returns {string | null}
 */
function detectFatalisticClaim(rawText) {
  const sentences = canonicalizeVi(rawText).split(SENTENCE_SPLIT);
  for (const sent of sentences) {
    for (const pattern of FATALISTIC_PATTERNS) {
      const m = pattern.exec(sent);
      if (m) {
        const prefix = sent.slice(Math.max(0, m.index - 48), m.index);
        if (!/(?<![\p{L}\p{N}])(?:không|chớ|tránh|không thể khẳng định|không phán đoán|không kết luận)(?![\p{L}\p{N}])[^.!?;]*$/iu.test(prefix)) {
          return m[0];
        }
      }
    }
  }
  return null;
}

/**
 * Checks whether a structured assertion matches an engine Fact from `@tuvi/core`.
 * @param {{ subjectId: string, predicate: string, objectId?: string, value?: unknown }} assertion
 * @param {{ subjectId: string, predicate: string, objectId?: string, value?: unknown }} fact
 * @returns {boolean}
 */
function matchesEngineFact(assertion, fact) {
  if (fact.subjectId !== assertion.subjectId || fact.predicate !== assertion.predicate) {
    return false;
  }
  if (assertion.objectId !== undefined && fact.objectId !== assertion.objectId) {
    return false;
  }
  if (assertion.value !== undefined && JSON.stringify(fact.value) !== JSON.stringify(assertion.value)) {
    return false;
  }
  return true;
}

/**
 * Validates an AI model interpretation strictly against `@tuvi/core` facts,
 * structured `assertions`, retrieved Thiên Kỷ quotes, NFC-normalized text truth,
 * anti-fatalism rules, and Thiên Kỷ anti-superstition doctrine.
 *
 * @param {unknown} response
 * @param {any} natalResult
 * @param {Array<{ id: string }>} [allowedQuotes]
 */
function validateInterpretation(response, natalResult, allowedQuotes = []) {
  /** @type {Array<{ code: string, path: string, message: string }>} */
  const errors = [];
  /** @type {Array<{ code: string, path: string, message: string }>} */
  const warnings = [];

  const schemaErrors = validateInterpretationSchema(response);
  if (schemaErrors.length > 0) {
    return {
      valid: false,
      errors: schemaErrors,
      warnings,
      metrics: {
        claimCount: 0,
        groundedClaimCount: 0,
        citedFactCount: 0,
        verifiedAssertionCount: 0,
        citedQuoteCount: 0,
        contradictionCount: 0,
        doctrineViolationCount: 0,
      },
    };
  }

  const parsed = /** @type {any} */ (response);
  const facts = Array.isArray(natalResult?.facts) ? natalResult.facts : [];
  const factById = new Map(facts.map(f => [f.id, f]));
  const quoteIdSet = new Set((allowedQuotes || []).map(q => q.id));

  // Build ground-truth lookup tables directly from deterministic engine facts
  /** @type {Map<string, Set<string>>} */
  const starActualPalaces = new Map();
  /** @type {Map<string, Set<string>>} */
  const starActualTransformations = new Map();
  /** @type {Set<string>} */
  const borrowedMajorStars = new Set();
  /** @type {Map<string, unknown>} */
  const decadalByPalace = new Map();
  let mingBranchId = '';
  let juId = '';
  let mingIsEmpty = false;
  let shenPalaceId = '';

  for (const fact of facts) {
    if (fact.predicate === 'LOCATED_IN' && fact.subjectId.startsWith('STAR.') && fact.objectId) {
      if (!starActualPalaces.has(fact.subjectId)) starActualPalaces.set(fact.subjectId, new Set());
      starActualPalaces.get(fact.subjectId)?.add(fact.objectId);
    } else if (fact.predicate === 'LOCATED_IN' && fact.subjectId === 'CHART.SHEN' && fact.objectId) {
      shenPalaceId = fact.objectId;
    } else if (fact.predicate === 'HAS_NO_MAJOR_STAR' && fact.subjectId === 'PALACE.MING') {
      mingIsEmpty = fact.value === true;
    } else if (fact.predicate === 'HAS_NATAL_TRANSFORMATION' && fact.subjectId.startsWith('STAR.') && fact.objectId) {
      if (!starActualTransformations.has(fact.subjectId)) starActualTransformations.set(fact.subjectId, new Set());
      starActualTransformations.get(fact.subjectId)?.add(fact.objectId);
    } else if (fact.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR' && fact.objectId) {
      borrowedMajorStars.add(fact.objectId);
    } else if (fact.predicate === 'LOCATED_AT_BRANCH' && fact.subjectId === 'CHART.MING' && fact.objectId) {
      mingBranchId = fact.objectId;
    } else if (fact.predicate === 'HAS_FIVE_ELEMENTS_CLASS' && fact.objectId) {
      juId = fact.objectId;
    } else if (fact.predicate === 'HAS_DECADAL_AGE_RANGE') {
      decadalByPalace.set(fact.subjectId, fact.value);
    }
  }

  let groundedClaimCount = 0;
  let citedFactCount = 0;
  let verifiedAssertionCount = 0;
  let citedQuoteCount = 0;
  let contradictionCount = 0;
  let doctrineViolationCount = 0;

  /**
   * @param {string} starId
   * @param {string} palaceId
   * @param {string} starVi
   * @param {string} palaceVi
   * @param {string} path
   */
  function checkPlacementPair(starId, palaceId, starVi, palaceVi, path) {
    // Allow "tại cung Thân" if the star is located in the chart's Thân palace
    const targetPalaceId = palaceVi === 'thân' && shenPalaceId ? shenPalaceId : palaceId;
    const actualPalaces = starActualPalaces.get(starId);
    if (!actualPalaces || !actualPalaces.has(targetPalaceId)) {
      const realPalaceNames = actualPalaces
        ? [...actualPalaces].map(id => PALACE_ID_TO_VI.get(id) || id).join(', ')
        : 'không xác định';
      contradictionCount++;
      errors.push({
        code: 'STAR_PALACE_CONTRADICTION',
        path,
        message: `Sai lệch vị trí sao: văn bản nêu '${starVi}' ở '${PALACE_ID_TO_VI.get(targetPalaceId) || palaceVi}', nhưng lá số thực tế đặt '${STAR_ID_TO_VI.get(starId)}' tại '${realPalaceNames}'.`,
      });
    }
  }

  /**
   * Audits any natural-language field after NFC + orthographic canonicalization.
   * @param {string} rawText
   * @param {string} path
   */
  function auditTextTruth(rawText, path) {
    const normalizedText = stripDisciplinePhrases(canonicalizeVi(rawText));
    const clauses = normalizedText.split(CLAUSE_SPLIT);

    // Check direct factual statements anywhere in a sentence (including after introductory commas).
    for (const part of normalizedText.split(SENTENCE_SPLIT)) {
      const sentence = part.trim();
      MING_BRANCH_STATEMENT.lastIndex = 0;
      let mBranch;
      while ((mBranch = MING_BRANCH_STATEMENT.exec(sentence)) !== null) {
        const pre = sentence.slice(Math.max(0, mBranch.index - 22), mBranch.index);
        if (/(?:không phải|không)\s*$/iu.test(pre)) continue;
        if (mingBranchId && BRANCH_VI_TO_ID.get(mBranch[1]) !== mingBranchId) {
          contradictionCount++;
          errors.push({ code: 'MING_BRANCH_CONTRADICTION', path, message: 'Địa chi của cung Mệnh trong câu không khớp lá số.' });
        }
      }

      JU_STATEMENT.lastIndex = 0;
      let mJu;
      while ((mJu = JU_STATEMENT.exec(sentence)) !== null) {
        const pre = sentence.slice(Math.max(0, mJu.index - 22), mJu.index);
        if (/(?:không phải|không)\s*$/iu.test(pre)) continue;
        if (juId && JU_VI_TO_ID.get(mJu[1]) !== juId) {
          contradictionCount++;
          errors.push({ code: 'FIVE_ELEMENTS_CLASS_CONTRADICTION', path, message: 'Ngũ hành Cục trong câu không khớp lá số.' });
        }
      }

      DECADAL_STATEMENT.lastIndex = 0;
      let mDec;
      while ((mDec = DECADAL_STATEMENT.exec(sentence)) !== null) {
        const pre = sentence.slice(Math.max(0, mDec.index - 22), mDec.index);
        if (/(?:không phải|không)\s*$/iu.test(pre)) continue;
        const palaceId = PALACE_VI_TO_ID.get(mDec[1]);
        const range = palaceId ? decadalByPalace.get(palaceId) : undefined;
        if (Array.isArray(range) && (Number(mDec[2]) !== range[0] || Number(mDec[3]) !== range[1])) {
          contradictionCount++;
          errors.push({ code: 'DECADAL_RANGE_CONTRADICTION', path, message: 'Khoảng tuổi đại hạn trong câu không khớp cung trên lá số.' });
        }
      }
    }

    for (const clause of clauses) {
      // 1a. Forward star -> palace placement
      DIRECT_STAR_PALACE_REGEX.lastIndex = 0;
      let match;
      while ((match = DIRECT_STAR_PALACE_REGEX.exec(clause)) !== null) {
        const starVi = match[1];
        const palaceVi = match[2];
        const starId = TRACKED_STAR_VI_TO_ID.get(starVi);
        const palaceId = PALACE_VI_TO_ID.get(palaceVi);
        if (!starId || !palaceId) continue;

        const immediateBefore = clause.slice(Math.max(0, match.index - 26), match.index);
        if (/(?:không có|chưa có|vắng|không phải)\s*(?:chính tinh\s+|sao\s+)?$/iu.test(immediateBefore)) {
          continue;
        }
        if (/mượn\s*(?:chính tinh\s+|sao\s+)?$/iu.test(immediateBefore)) {
          // Only valid if this star is genuinely borrowed by an empty palace OR actually sits in palaceId
          const actualPalaces = starActualPalaces.get(starId);
          if (borrowedMajorStars.has(starId) || actualPalaces?.has(palaceId)) {
            continue;
          }
        }
        checkPlacementPair(starId, palaceId, starVi, palaceVi, path);
      }

      // 1b. Reverse "cung <Palace> có <Star>"
      REVERSE_PALACE_STAR_REGEX.lastIndex = 0;
      while ((match = REVERSE_PALACE_STAR_REGEX.exec(clause)) !== null) {
        const palaceVi = match[1];
        const starVi = match[2];
        const palaceId = PALACE_VI_TO_ID.get(palaceVi);
        const starId = TRACKED_STAR_VI_TO_ID.get(starVi);
        if (!starId || !palaceId) continue;

        const immediateBefore = clause.slice(Math.max(0, match.index - 18), match.index);
        if (/(?:không|chẳng)\s*$/iu.test(immediateBefore)) continue;
        checkPlacementPair(starId, palaceId, starVi, palaceVi, path);
      }

      // 2. Check Mệnh vô chính diệu
      const emptyMingMatch = /mệnh\s+vô\s+chính\s+diệu/iu.exec(clause);
      if (emptyMingMatch) {
        const prefix = clause.slice(Math.max(0, emptyMingMatch.index - 22), emptyMingMatch.index);
        const negated = /(?:không phải là|không phải|không thuộc|không)\s*$/iu.test(prefix);
        if (!negated && !mingIsEmpty) {
          contradictionCount++;
          errors.push({
            code: 'EMPTY_MING_CONTRADICTION',
            path,
            message: 'Sai lệch trạng thái cung Mệnh: văn bản nêu Mệnh vô chính diệu nhưng lá số thực tế có chính tinh tọa thủ tại Mệnh.',
          });
        }
      }

      // 3. Check Tứ Hóa claims (handles Hóa/hoá, Kỵ/Kị, and both major + auxiliary stars like Văn Khúc)
      DIRECT_SIHUA_REGEX.lastIndex = 0;
      while ((match = DIRECT_SIHUA_REGEX.exec(clause)) !== null) {
        const prefix = clause.slice(Math.max(0, match.index - 22), match.index);
        if (/(?:không có|không phải|không gặp|tránh|nếu|giả sử|ví dụ)\s*$/iu.test(prefix)) continue;
        const starVi = match[1];
        const huaVi = match[2];
        const starId = TRACKED_STAR_VI_TO_ID.get(starVi);
        const huaId = TRANSFORMATION_VI_TO_ID.get(huaVi);
        if (!starId || !huaId) continue;
        const actualHua = starActualTransformations.get(starId);
        if (!actualHua || !actualHua.has(huaId)) {
          contradictionCount++;
          errors.push({
            code: 'SIHUA_CONTRADICTION',
            path,
            message: `Sai lệch Tứ Hóa: văn bản nêu '${STAR_ID_TO_VI.get(starId)} ${huaVi}', nhưng lá số bản mệnh không có biến hóa này.`,
          });
        }
      }
    }

    // 4. Check Thiên Kỷ anti-superstition doctrine
    const banned = detectSuperstition(rawText);
    if (banned) {
      doctrineViolationCount++;
      errors.push({
        code: 'DOCTRINE_SUPERSTITION',
        path,
        message: `Vi phạm nguyên tắc Thiên Kỷ (bài trừ mê tín): phát hiện khuyến nghị '${banned}'.`,
      });
    }

    // 5. Check ungrounded fatalistic fortune-telling claims
    const fatalistic = detectFatalisticClaim(rawText);
    if (fatalistic) {
      contradictionCount++;
      errors.push({
        code: 'UNGROUNDED_FATALISTIC_CLAIM',
        path,
        message: `Nhận định định mệnh tuyệt đối không có cơ sở trong dữ kiện cấu trúc engine: '${fatalistic}'.`,
      });
    }
  }

  auditTextTruth(parsed.summary, '$.summary');
  parsed.reasoningSteps.forEach((step, idx) => auditTextTruth(step, `$.reasoningSteps[${idx}]`));
  parsed.actionGuidance.forEach((line, idx) => auditTextTruth(line, `$.actionGuidance[${idx}]`));

  parsed.claims.forEach((claim, idx) => {
    const base = `$.claims[${idx}]`;
    let claimValid = true;

    // A. Verify every cited factId exists in engine facts
    const claimFactSet = new Set();
    for (const factId of claim.factIds) {
      citedFactCount++;
      claimFactSet.add(factId);
      if (!factById.has(factId)) {
        claimValid = false;
        contradictionCount++;
        errors.push({
          code: 'UNKNOWN_FACT_ID',
          path: `${base}.factIds`,
          message: `factId '${factId}' không tồn tại trong dữ kiện engine của lá số.`,
        });
      }
    }

    // B. Verify every structured assertion matches a real engine fact AND aligns with claim.factIds
    const matchedFactIdsForAssertions = new Set();
    const assertedEntities = new Set();
    claim.assertions.forEach((assertion, aIdx) => {
      assertedEntities.add(assertion.subjectId);
      if (assertion.objectId) assertedEntities.add(assertion.objectId);

      const matchingFacts = facts.filter(f => matchesEngineFact(assertion, f));
      if (matchingFacts.length === 0) {
        claimValid = false;
        contradictionCount++;
        errors.push({
          code: 'ASSERTION_NOT_IN_FACTS',
          path: `${base}.assertions[${aIdx}]`,
          message: `Assertion (${assertion.subjectId} ${assertion.predicate} ${assertion.objectId ?? JSON.stringify(assertion.value)}) không khớp với bất kỳ dữ kiện nào của lá số.`,
        });
        return;
      }

      verifiedAssertionCount++;
      const linked = matchingFacts.filter(f => claimFactSet.has(f.id));
      if (linked.length === 0) {
        claimValid = false;
        errors.push({
          code: 'UNREFERENCED_FACT_ID',
          path: `${base}.assertions[${aIdx}]`,
          message: `Assertion khớp dữ kiện '${matchingFacts[0].id}' nhưng mã này chưa được khai báo trong claim.factIds.`,
        });
      } else {
        for (const f of linked) matchedFactIdsForAssertions.add(f.id);
      }
    });

    // C. Reject arbitrary extra factIds slapped onto a claim without a corresponding structured assertion
    for (const factId of claim.factIds) {
      if (factById.has(factId) && !matchedFactIdsForAssertions.has(factId)) {
        claimValid = false;
        errors.push({
          code: 'UNREFERENCED_FACT_ID',
          path: `${base}.factIds`,
          message: `factId '${factId}' được gắn vào claim nhưng không có assertion cấu trúc nào biểu diễn dữ kiện này.`,
        });
      }
    }

    // D. Verify every star mentioned in claim.statement is grounded in the claim's asserted entities or palaces
    //    (Strip discipline/chart phrases like "tử vi đẩu số", "lá số tử vi" first so they are not mistaken for STAR.ZIWEI!)
    const normalizedStmt = stripDisciplinePhrases(canonicalizeVi(claim.statement));
    STAR_MENTION_REGEX.lastIndex = 0;
    let sMatch;
    while ((sMatch = STAR_MENTION_REGEX.exec(normalizedStmt)) !== null) {
      const starId = TRACKED_STAR_VI_TO_ID.get(sMatch[1]);
      if (!starId) continue;
      if (!assertedEntities.has(starId)) {
        // Also allow if the star actually sits in one of the palaces asserted by this claim
        const starPalaces = starActualPalaces.get(starId);
        const sitsInAssertedPalace = starPalaces && [...starPalaces].some(pid => assertedEntities.has(pid));
        if (!sitsInAssertedPalace) {
          claimValid = false;
          contradictionCount++;
          errors.push({
            code: 'CLAIM_STATEMENT_UNGROUNDED',
            path: `${base}.statement`,
            message: `Câu nhận định nhắc tới sao '${STAR_ID_TO_VI.get(starId)}' nhưng sao này không nằm trong assertions của claim.`,
          });
        }
      }
    }

    // E. Strict quoteId check — rejects fabricated quoteIds EVEN WHEN allowedQuotes is empty!
    if (Array.isArray(claim.quoteIds)) {
      for (const quoteId of claim.quoteIds) {
        citedQuoteCount++;
        if (!quoteIdSet.has(quoteId)) {
          claimValid = false;
          errors.push({
            code: 'UNKNOWN_QUOTE_ID',
            path: `${base}.quoteIds`,
            message: `quoteId '${quoteId}' không nằm trong danh sách trích dẫn đã truy xuất từ kho bài giảng.`,
          });
        }
      }
    }

    const errorsBeforeText = errors.length;
    auditTextTruth(claim.statement, `${base}.statement`);
    if (errors.length > errorsBeforeText) claimValid = false;

    if (claimValid) groundedClaimCount++;
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      claimCount: parsed.claims.length,
      groundedClaimCount,
      citedFactCount,
      verifiedAssertionCount,
      citedQuoteCount,
      contradictionCount,
      doctrineViolationCount,
    },
  };
}

module.exports = {
  canonicalizeVi,
  validateInterpretation,
  detectSuperstition,
  detectFatalisticClaim,
};
