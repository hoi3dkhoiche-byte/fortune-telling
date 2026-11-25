'use strict';

const INTERPRETATION_SCHEMA_VERSION = 'tuvi.interpretation.v0';
const CLAIM_CATEGORIES = Object.freeze([
  'menh-than',
  'ngu-hanh-cuc',
  'tu-hoa',
  'tam-phuong',
  'dai-han',
  'cach-cuc',
  'cai-van',
]);
const CLAIM_CONFIDENCES = Object.freeze(['high', 'medium', 'low']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates structural compliance with `tuvi.interpretation.v0`.
 * @param {unknown} value
 * @returns {Array<{ code: string, path: string, message: string }>}
 */
function validateInterpretationSchema(value) {
  /** @type {Array<{ code: string, path: string, message: string }>} */
  const errors = [];
  const fail = (path, message) => errors.push({ code: 'SCHEMA_INVALID', path, message });

  if (!isRecord(value)) {
    fail('$', 'Phản hồi luận giải phải là một JSON object.');
    return errors;
  }
  if (value.schemaVersion !== INTERPRETATION_SCHEMA_VERSION) {
    fail('$.schemaVersion', `schemaVersion phải là '${INTERPRETATION_SCHEMA_VERSION}'.`);
  }
  if (!isNonEmptyString(value.summary)) {
    fail('$.summary', 'summary phải là chuỗi không rỗng.');
  }
  if (!Array.isArray(value.reasoningSteps) || value.reasoningSteps.length === 0 || !value.reasoningSteps.every(isNonEmptyString)) {
    fail('$.reasoningSteps', 'reasoningSteps phải là mảng chuỗi không rỗng.');
  }
  if (!Array.isArray(value.actionGuidance) || !value.actionGuidance.every(isNonEmptyString)) {
    fail('$.actionGuidance', 'actionGuidance phải là mảng các chuỗi hướng dẫn hành động.');
  }
  if (!isNonEmptyString(value.disclaimer)) {
    fail('$.disclaimer', 'disclaimer phải là chuỗi không rỗng.');
  }
  if (!Array.isArray(value.claims) || value.claims.length === 0) {
    fail('$.claims', 'claims phải có ít nhất 1 nhận định gắn factId.');
    return errors;
  }

  const seenIds = new Set();
  value.claims.forEach((claim, idx) => {
    const base = `$.claims[${idx}]`;
    if (!isRecord(claim)) {
      fail(base, 'Mỗi claim phải là một object.');
      return;
    }
    if (!isNonEmptyString(claim.id)) {
      fail(`${base}.id`, 'claim.id phải là chuỗi không rỗng.');
    } else if (seenIds.has(claim.id)) {
      fail(`${base}.id`, `claim.id bị trùng lặp: '${claim.id}'.`);
    } else {
      seenIds.add(claim.id);
    }
    if (!CLAIM_CATEGORIES.includes(claim.category)) {
      fail(`${base}.category`, `claim.category phải thuộc [${CLAIM_CATEGORIES.join(', ')}].`);
    }
    if (!isNonEmptyString(claim.statement)) {
      fail(`${base}.statement`, 'claim.statement phải là chuỗi không rỗng.');
    }
    if (!CLAIM_CONFIDENCES.includes(claim.confidence)) {
      fail(`${base}.confidence`, `claim.confidence phải thuộc [${CLAIM_CONFIDENCES.join(', ')}].`);
    }
    if (!Array.isArray(claim.factIds) || claim.factIds.length === 0 || !claim.factIds.every(isNonEmptyString)) {
      fail(`${base}.factIds`, 'Mỗi claim bắt buộc phải gắn ít nhất 1 factId hợp lệ.');
    }
    if (claim.quoteIds !== undefined && (!Array.isArray(claim.quoteIds) || !claim.quoteIds.every(isNonEmptyString))) {
      fail(`${base}.quoteIds`, 'quoteIds (nếu có) phải là mảng các mã trích dẫn không rỗng.');
    }
  });

  return errors;
}

module.exports = {
  INTERPRETATION_SCHEMA_VERSION,
  CLAIM_CATEGORIES,
  CLAIM_CONFIDENCES,
  validateInterpretationSchema,
};
