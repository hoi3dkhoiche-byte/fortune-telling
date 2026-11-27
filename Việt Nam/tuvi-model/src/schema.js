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
const ASSERTION_PREDICATES = Object.freeze([
  'LOCATED_AT_BRANCH',
  'LOCATED_IN',
  'HAS_FIVE_ELEMENTS_CLASS',
  'IS_STAR',
  'HAS_NO_MAJOR_STAR',
  'HAS_NATAL_TRANSFORMATION',
  'HAS_BRIGHTNESS_AT_PALACE',
  'BORROWS_OPPOSITE_MAJOR_STAR',
  'OPPOSITE_TO',
  'TRINE_WITH',
  'HAS_SANFANGSIZHENG_MEMBER',
  'HAS_DECADAL_AGE_RANGE',
]);

class ModelLayerError extends Error {
  /**
   * @param {'PRIVACY_VIOLATION' | 'REMOTE_ENDPOINT_BLOCKED' | 'ENDPOINT_UNREACHABLE' | 'ENDPOINT_HTTP_ERROR' | 'INVALID_INPUT'} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ModelLayerError';
    this.code = code;
    this.details = details;
  }
}

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
  return typeof value === 'string' && value.normalize('NFC').trim().length > 0;
}

/**
 * @param {unknown} val
 * @returns {boolean}
 */
function isValidAssertionValue(val) {
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return true;
  if (Array.isArray(val) && val.length > 0 && val.every(item => typeof item === 'number')) return true;
  return false;
}

/**
 * Validates structural compliance with `tuvi.interpretation.v0` including
 * machine-checkable `assertions[{ subjectId, predicate, objectId?, value? }]`.
 *
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
    fail('$.claims', 'claims phải có ít nhất 1 nhận định có cấu trúc.');
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
    if (!Array.isArray(claim.assertions) || claim.assertions.length === 0) {
      fail(`${base}.assertions`, 'Mỗi claim bắt buộc phải có mảng assertions (subjectId, predicate, objectId/value) không rỗng để đối chiếu trực tiếp với facts.');
    } else {
      claim.assertions.forEach((assertion, aIdx) => {
        const aPath = `${base}.assertions[${aIdx}]`;
        if (!isRecord(assertion)) {
          fail(aPath, 'Mỗi assertion phải là một object.');
          return;
        }
        if (!isNonEmptyString(assertion.subjectId)) {
          fail(`${aPath}.subjectId`, 'assertion.subjectId phải là chuỗi mã thực thể không rỗng.');
        }
        if (!ASSERTION_PREDICATES.includes(assertion.predicate)) {
          fail(`${aPath}.predicate`, `assertion.predicate phải thuộc [${ASSERTION_PREDICATES.join(', ')}].`);
        }
        const hasObj = assertion.objectId !== undefined;
        const hasVal = assertion.value !== undefined;
        if (!hasObj && !hasVal) {
          fail(aPath, 'assertion phải có ít nhất objectId hoặc value.');
        }
        if (hasObj && !isNonEmptyString(assertion.objectId)) {
          fail(`${aPath}.objectId`, 'assertion.objectId phải là chuỗi không rỗng.');
        }
        if (hasVal && !isValidAssertionValue(assertion.value)) {
          fail(`${aPath}.value`, 'assertion.value phải là string, number, boolean hoặc mảng số.');
        }
      });
    }
    if (claim.quoteIds !== undefined && (!Array.isArray(claim.quoteIds) || !claim.quoteIds.every(isNonEmptyString))) {
      fail(`${base}.quoteIds`, 'quoteIds (nếu có) phải là mảng các mã trích dẫn không rỗng.');
    }
  });

  return errors;
}

/**
 * Builds a dynamic per-chart JSON Schema (`response_format.json_schema`) compatible with
 * OpenAI Structured Outputs, vLLM, Ollama, and llama.cpp constrained decoding.
 * Locks `factIds` to the chart's actual `promptFacts` IDs and `quoteIds` to `retrievedQuotes` IDs
 * so a local/fine-tuned model cannot emit hallucinated IDs during token generation.
 *
 * @param {any} context AnonymizedContext from `buildAnonymizedContext`
 * @param {Array<{ id: string }>} [retrievedQuotes]
 */
function buildResponseJsonSchema(context, retrievedQuotes = undefined) {
  const sourceFacts = Array.isArray(context?.promptFacts) && context.promptFacts.length > 0
    ? context.promptFacts
    : (Array.isArray(context?.facts) ? context.facts : []);
  const factEnum = [...new Set(sourceFacts.map(f => f?.id).filter(Boolean))];
  const quotes = Array.isArray(retrievedQuotes)
    ? retrievedQuotes
    : (Array.isArray(context?.retrievedQuotes) ? context.retrievedQuotes : []);
  const quoteEnum = [...new Set(quotes.map(q => q?.id).filter(Boolean))];

  const factItemSchema = factEnum.length > 0
    ? { type: 'string', enum: factEnum }
    : { type: 'string' };

  const quoteArraySchema = quoteEnum.length > 0
    ? { type: 'array', items: { type: 'string', enum: quoteEnum } }
    : { type: 'array', maxItems: 0, items: { type: 'string' } };

  return {
    name: 'tuvi_interpretation_v0',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'summary', 'reasoningSteps', 'claims', 'actionGuidance', 'disclaimer'],
      properties: {
        schemaVersion: { type: 'string', enum: [INTERPRETATION_SCHEMA_VERSION] },
        summary: { type: 'string' },
        reasoningSteps: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
        },
        claims: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'category', 'statement', 'assertions', 'factIds', 'quoteIds', 'confidence'],
            properties: {
              id: { type: 'string' },
              category: { type: 'string', enum: [...CLAIM_CATEGORIES] },
              statement: { type: 'string' },
              assertions: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['subjectId', 'predicate'],
                  properties: {
                    subjectId: { type: 'string' },
                    predicate: { type: 'string', enum: [...ASSERTION_PREDICATES] },
                    objectId: { type: 'string' },
                    value: {
                      anyOf: [
                        { type: 'string' },
                        { type: 'number' },
                        { type: 'boolean' },
                        { type: 'array', items: { type: 'number' } },
                      ],
                    },
                  },
                },
              },
              factIds: {
                type: 'array',
                minItems: 1,
                items: factItemSchema,
              },
              quoteIds: quoteArraySchema,
              confidence: { type: 'string', enum: [...CLAIM_CONFIDENCES] },
            },
          },
        },
        actionGuidance: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
        },
        disclaimer: { type: 'string' },
      },
    },
  };
}

module.exports = {
  INTERPRETATION_SCHEMA_VERSION,
  CLAIM_CATEGORIES,
  CLAIM_CONFIDENCES,
  ASSERTION_PREDICATES,
  ModelLayerError,
  validateInterpretationSchema,
  buildResponseJsonSchema,
};
