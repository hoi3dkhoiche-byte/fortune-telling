'use strict';

const glossary = require('../../tuvi-core/i18n/vi.json');
const { validateInterpretationSchema } = require('./schema');

const MAJOR_STAR_IDS = new Set([
  'STAR.ZIWEI', 'STAR.TIANJI', 'STAR.TAIYANG', 'STAR.WUQU', 'STAR.TIANTONG',
  'STAR.LIANZHEN', 'STAR.TIANFU', 'STAR.TAIYIN', 'STAR.TANLANG', 'STAR.JUMEN',
  'STAR.TIANXIANG', 'STAR.TIANLIANG', 'STAR.QISHA', 'STAR.POJUN',
]);

const STAR_ID_TO_VI = new Map();
const MAJOR_STAR_VI_TO_ID = new Map();
for (const entry of Object.values(glossary.stars)) {
  STAR_ID_TO_VI.set(entry.id, entry.labelVi);
  if (MAJOR_STAR_IDS.has(entry.id)) {
    MAJOR_STAR_VI_TO_ID.set(entry.labelVi.toLowerCase(), entry.id);
  }
}

const PALACE_ID_TO_VI = new Map();
const PALACE_VI_TO_ID = new Map();
for (const entry of Object.values(glossary.palaces)) {
  PALACE_ID_TO_VI.set(entry.id, entry.labelVi);
  PALACE_VI_TO_ID.set(entry.labelVi.toLowerCase(), entry.id);
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
];

const NEGATION_PREFIX = /(?:không|chớ|tránh|bài trừ|phản đối|tuyệt đối không|đừng|thay vì)[^.,;!?]*$/i;

/**
 * Escapes text for RegExp construction.
 * @param {string} text
 * @returns {string}
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MAJOR_STAR_PATTERN = [...MAJOR_STAR_VI_TO_ID.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

const PALACE_PATTERN = [...PALACE_VI_TO_ID.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

const DIRECT_STAR_PALACE_REGEX = new RegExp(
  `(${MAJOR_STAR_PATTERN})\\s+(?:tọa thủ|đóng tại|tọa tại|nhập cung|tại cung|tại)\\s+(?:cung\\s+)?(${PALACE_PATTERN})(?![\\p{L}\\p{N}])`,
  'giu',
);

const DIRECT_SIHUA_REGEX = new RegExp(
  `(${MAJOR_STAR_PATTERN})\\s+(?:·\\s*)?(hóa lộc|hóa quyền|hóa khoa|hóa kỵ)(?![\\p{L}\\p{N}])`,
  'giu',
);

/**
 * Checks if a text snippet is recommending superstition banned by Thiên Kỷ doctrine.
 * @param {string} text
 * @returns {string | null}
 */
function detectSuperstition(text) {
  const lower = text.toLowerCase();
  for (const term of SUPERSTITION_TERMS) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      const prefix = lower.slice(Math.max(0, idx - 32), idx);
      if (!NEGATION_PREFIX.test(prefix)) return term;
      idx = lower.indexOf(term, idx + term.length);
    }
  }
  return null;
}

/**
 * Checks if a matched placement statement is preceded by a borrowing/negation/aspect qualifier.
 * @param {string} text
 * @param {number} matchIndex
 * @returns {boolean}
 */
function isQualifiedClause(text, matchIndex) {
  const prefix = text.slice(Math.max(0, matchIndex - 40), matchIndex).toLowerCase();
  return /(?:mượn|không có|chưa có|vắng|xung chiếu|hội chiếu|tam hợp|đối cung|chiếu về|giáp)\s*[^.,;]*$/i.test(prefix);
}

/**
 * Validates an AI model interpretation strictly against `@tuvi/core` facts,
 * retrieved Thiên Kỷ quotes, star/palace truth, Tứ Hóa truth, and doctrine rules.
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
        citedQuoteCount: 0,
        contradictionCount: 0,
        doctrineViolationCount: 0,
      },
    };
  }

  const parsed = /** @type {any} */ (response);
  const facts = Array.isArray(natalResult?.facts) ? natalResult.facts : [];
  const factIdSet = new Set(facts.map(f => f.id));
  const quoteIdSet = new Set(allowedQuotes.map(q => q.id));

  // Build ground-truth lookup tables directly from deterministic engine facts
  /** @type {Map<string, Set<string>>} */
  const starActualPalaces = new Map();
  /** @type {Map<string, Set<string>>} */
  const starActualTransformations = new Map();
  let mingIsEmpty = false;

  for (const fact of facts) {
    if (fact.predicate === 'LOCATED_IN' && fact.subjectId.startsWith('STAR.') && fact.objectId) {
      if (!starActualPalaces.has(fact.subjectId)) starActualPalaces.set(fact.subjectId, new Set());
      starActualPalaces.get(fact.subjectId)?.add(fact.objectId);
    } else if (fact.predicate === 'HAS_NO_MAJOR_STAR' && fact.subjectId === 'PALACE.MING') {
      mingIsEmpty = fact.value === true;
    } else if (fact.predicate === 'HAS_NATAL_TRANSFORMATION' && fact.subjectId.startsWith('STAR.') && fact.objectId) {
      if (!starActualTransformations.has(fact.subjectId)) starActualTransformations.set(fact.subjectId, new Set());
      starActualTransformations.get(fact.subjectId)?.add(fact.objectId);
    }
  }

  let groundedClaimCount = 0;
  let citedFactCount = 0;
  let citedQuoteCount = 0;
  let contradictionCount = 0;
  let doctrineViolationCount = 0;

  /**
   * @param {string} text
   * @param {string} path
   */
  function auditTextTruth(text, path) {
    // 1. Check direct major star -> palace claims
    DIRECT_STAR_PALACE_REGEX.lastIndex = 0;
    let match;
    while ((match = DIRECT_STAR_PALACE_REGEX.exec(text)) !== null) {
      if (isQualifiedClause(text, match.index)) continue;
      const starVi = match[1];
      const palaceVi = match[2];
      const starId = MAJOR_STAR_VI_TO_ID.get(starVi.toLowerCase());
      const palaceId = PALACE_VI_TO_ID.get(palaceVi.toLowerCase());
      if (!starId || !palaceId) continue;
      const actualPalaces = starActualPalaces.get(starId);
      if (!actualPalaces || !actualPalaces.has(palaceId)) {
        const realPalaceNames = actualPalaces
          ? [...actualPalaces].map(id => PALACE_ID_TO_VI.get(id) || id).join(', ')
          : 'không xác định';
        contradictionCount++;
        errors.push({
          code: 'STAR_PALACE_CONTRADICTION',
          path,
          message: `Sai lệch vị trí sao: văn bản nêu '${starVi}' tại '${palaceVi}', nhưng lá số thực tế đặt '${STAR_ID_TO_VI.get(starId)}' tại '${realPalaceNames}'.`,
        });
      }
    }

    // 2. Check Mệnh vô chính diệu claim
    const emptyMingMatch = /mệnh\s+vô\s+chính\s+diệu/i.exec(text);
    if (emptyMingMatch) {
      const prefix = text.slice(Math.max(0, emptyMingMatch.index - 24), emptyMingMatch.index).toLowerCase();
      const negated = /(?:không phải|không thuộc|không)\s*$/i.test(prefix);
      if (!negated && !mingIsEmpty) {
        contradictionCount++;
        errors.push({
          code: 'EMPTY_MING_CONTRADICTION',
          path,
          message: 'Sai lệch trạng thái cung Mệnh: văn bản nêu Mệnh vô chính diệu nhưng lá số thực tế có chính tinh tọa thủ tại Mệnh.',
        });
      }
    }

    // 3. Check direct major star Tứ Hóa claims
    DIRECT_SIHUA_REGEX.lastIndex = 0;
    while ((match = DIRECT_SIHUA_REGEX.exec(text)) !== null) {
      const prefix = text.slice(Math.max(0, match.index - 28), match.index).toLowerCase();
      if (/(?:không có|không gặp|tránh|nếu|giả sử|ví dụ)\s*[^.,;]*$/i.test(prefix)) continue;
      const starVi = match[1];
      const huaVi = match[2];
      const starId = MAJOR_STAR_VI_TO_ID.get(starVi.toLowerCase());
      const huaId = TRANSFORMATION_VI_TO_ID.get(huaVi.toLowerCase());
      if (!starId || !huaId) continue;
      const actualHua = starActualTransformations.get(starId);
      if (!actualHua || !actualHua.has(huaId)) {
        contradictionCount++;
        errors.push({
          code: 'SIHUA_CONTRADICTION',
          path,
          message: `Sai lệch Tứ Hóa: văn bản nêu '${starVi} ${huaVi}', nhưng lá số bản mệnh không có biến hóa này.`,
        });
      }
    }

    // 4. Check Thiên Kỷ doctrine against superstitious remedies
    const banned = detectSuperstition(text);
    if (banned) {
      doctrineViolationCount++;
      errors.push({
        code: 'DOCTRINE_SUPERSTITION',
        path,
        message: `Vi phạm nguyên tắc Thiên Kỷ (bài trừ mê tín): phát hiện khuyến nghị '${banned}'.`,
      });
    }
  }

  auditTextTruth(parsed.summary, '$.summary');
  parsed.actionGuidance.forEach((line, idx) => auditTextTruth(line, `$.actionGuidance[${idx}]`));

  parsed.claims.forEach((claim, idx) => {
    const base = `$.claims[${idx}]`;
    let claimHasUnknownFact = false;
    for (const factId of claim.factIds) {
      citedFactCount++;
      if (!factIdSet.has(factId)) {
        claimHasUnknownFact = true;
        errors.push({
          code: 'UNKNOWN_FACT_ID',
          path: `${base}.factIds`,
          message: `factId '${factId}' không tồn tại trong dữ kiện engine của lá số.`,
        });
      }
    }
    if (!claimHasUnknownFact) groundedClaimCount++;

    if (Array.isArray(claim.quoteIds)) {
      for (const quoteId of claim.quoteIds) {
        citedQuoteCount++;
        if (quoteIdSet.size > 0 && !quoteIdSet.has(quoteId)) {
          errors.push({
            code: 'UNKNOWN_QUOTE_ID',
            path: `${base}.quoteIds`,
            message: `quoteId '${quoteId}' không nằm trong danh sách trích dẫn đã truy xuất từ kho bài giảng.`,
          });
        }
      }
    }

    auditTextTruth(claim.statement, `${base}.statement`);
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      claimCount: parsed.claims.length,
      groundedClaimCount,
      citedFactCount,
      citedQuoteCount,
      contradictionCount,
      doctrineViolationCount,
    },
  };
}

module.exports = {
  validateInterpretation,
  detectSuperstition,
};
