'use strict';

const { INTERPRETATION_SCHEMA_VERSION } = require('./schema');
const { validateInterpretation } = require('./validator');
const { buildAnonymizedContext, assertNoBirthPii, buildPrompts } = require('./context-builder');
const { loadCorpus } = require('./rag');
const { createMockAdapter } = require('./adapters/mock');

/**
 * Full Compound AI interpretation pipeline:
 * 1. Build strictly anonymized chart context (zero birth date/time/location/name PII).
 * 2. Retrieve top-K verbatim Thiên Kỷ quotes from the 1,848-quote Vietnamese corpus.
 * 3. Build prompts and run the runtime PII firewall (`assertNoBirthPii`) BEFORE calling any adapter.
 * 4. Run model adapter (mock or local/remote OpenAI-compatible).
 * 5. Validate output strictly against `@tuvi/core` facts + corpus quotes + doctrine rules.
 * 6. If validation fails, retry with structured validator feedback up to `maxRetries`.
 *
 * @param {any} natalResult
 * @param {{
 *   adapter?: any,
 *   corpus?: ReturnType<typeof loadCorpus>,
 *   question?: string,
 *   focusPalace?: string,
 *   topKQuotes?: number,
 *   maxRetries?: number,
 *   extraSensitiveValues?: string[],
 * }} [options]
 */
async function interpretNatal(natalResult, options = {}) {
  const adapter = options.adapter || createMockAdapter();
  const corpus = options.corpus || loadCorpus();
  const topKQuotes = options.topKQuotes ?? 8;
  const maxRetries = Math.max(0, Math.min(5, options.maxRetries ?? 2));
  const extraSensitive = options.extraSensitiveValues || [];

  // 1. Build initial anonymized context (without quotes yet)
  const baseContext = buildAnonymizedContext(natalResult, {
    question: options.question,
    focusPalace: options.focusPalace,
  });

  // 2. Retrieve relevant Thiên Kỷ quotes using only the anonymized chart context + question
  const retrievedQuotes = corpus.retrieve({
    context: baseContext,
    question: options.question,
    focusPalace: options.focusPalace,
    topK: topKQuotes,
  });

  const context = {
    ...baseContext,
    retrievedQuotes,
  };

  // 3. Build prompts and run strict PII firewall before ANY adapter invocation
  const { systemPrompt, userPrompt } = buildPrompts(context);
  const baseSerialized = JSON.stringify(baseContext);
  assertNoBirthPii(baseSerialized, natalResult, extraSensitive);
  assertNoBirthPii(systemPrompt, natalResult, extraSensitive);
  assertNoBirthPii(userPrompt, natalResult, extraSensitive);

  // 4 & 5. Generate + Validate with automatic self-correction retry loop
  let attempts = 0;
  /** @type {any} */
  let lastResponse = null;
  /** @type {string | undefined} */
  let lastRawOutput;
  /** @type {any} */
  let lastValidation = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    const generated = await adapter.generate({
      context,
      systemPrompt,
      userPrompt,
      retryFeedback: attempt > 0 ? lastValidation?.errors : undefined,
      previousRawOutput: attempt > 0 ? lastRawOutput : undefined,
    });
    lastResponse = generated.response;
    lastRawOutput = generated.rawOutput;
    lastValidation = validateInterpretation(lastResponse, natalResult, retrievedQuotes);
    if (lastValidation.valid) break;
  }

  return {
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    adapter: { id: adapter.id, kind: adapter.kind },
    attempts,
    interpretation: lastResponse,
    validation: lastValidation,
    retrievedQuotes,
    privacy: {
      birthDataSentToModel: /** @type {const} */ (false),
      strippedFields: context.privacy.strippedFields,
    },
  };
}

module.exports = {
  interpretNatal,
};
