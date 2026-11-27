'use strict';

const core = require('../../tuvi-core');
const { INTERPRETATION_SCHEMA_VERSION } = require('./schema');
const { validateInterpretation } = require('./validator');
const { buildAnonymizedContext, assertNoBirthPii, buildPrompts } = require('./context-builder');
const { loadCorpus } = require('./rag');
const { createMockAdapter } = require('./adapters/mock');

/**
 * Full Compound AI interpretation pipeline:
 * 1. Recompute canonical `facts` from `natalResult.natal` so client tampering cannot bypass validation.
 * 2. Strip direct birth PII & scan free-text `question` for dates/times/timezones.
 * 3. Retrieve top-K verbatim Thiên Kỷ quotes from the 1,848-quote corpus.
 * 4. Build compact profile-aware prompts (~6 KB) and audit all outbound strings via `assertNoBirthPii`.
 * 5. Run model adapter; catch BOTH JSON syntax parse errors AND validator failures inside the retry loop.
 * 6. Never expose an unvalidated/invalid `interpretation` (`interpretation: null` if retries exhaust).
 *
 * @param {any} natalResult
 * @param {{
 *   adapter?: any,
 *   corpus?: ReturnType<typeof loadCorpus>,
 *   question?: string,
 *   focusPalace?: string,
 *   topKQuotes?: number,
 *   maxPromptTokens?: number,
 *   maxRetries?: number,
 *   extraSensitiveValues?: string[],
 * }} [options]
 */
async function interpretNatal(natalResult, options = {}) {
  const adapter = options.adapter || createMockAdapter();
  const corpus = options.corpus || loadCorpus();
  const topKQuotes = options.topKQuotes ?? 4;
  const maxRetries = Math.max(0, Math.min(5, options.maxRetries ?? 2));
  const extraSensitive = options.extraSensitiveValues || [];

  // Always recompute authoritative facts from raw `natal` for ground-truth validation
  const canonicalFacts = core.buildFacts(natalResult.natal);
  const trustedNatal = {
    ...natalResult,
    facts: canonicalFacts,
  };

  // 1. Build initial structural context (scans user-entered `options.question` via free-text regex)
  const baseContext = buildAnonymizedContext(trustedNatal, {
    question: options.question,
    focusPalace: options.focusPalace,
    recomputeFromNatal: true,
  });

  // 2. Retrieve relevant Thiên Kỷ quotes using only the stripped context + question
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

  // 3. Build prompts within configurable token budget and run PII firewall before ANY adapter invocation.
  //    User-entered `question` was already checked with free-text regexes in step 1; here we check
  //    exact chart birth values (dates, clock time, tz, coordinates, extraSensitive) on outbound payloads,
  //    and exclude static lecture quote bodies from clock-time matching so quotes like "11 giờ đêm" never false-positive.
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
  const checkContext = assertNoBirthPii(JSON.stringify(baseContext), trustedNatal, extraSensitive, {
    scanFreeTextPatterns: false,
  });
  const checkSystem = assertNoBirthPii(systemPrompt, trustedNatal, extraSensitive, {
    scanFreeTextPatterns: false,
  });
  const promptWithoutQuotes = buildPrompts({ ...context, retrievedQuotes: [] }, {
    maxPromptTokens: options.maxPromptTokens,
  }).userPrompt;
  const checkUser = assertNoBirthPii(promptWithoutQuotes, trustedNatal, extraSensitive, {
    scanFreeTextPatterns: false,
  });
  // Still verify no extraSensitiveValues (like user's name) leaked anywhere in the final userPrompt
  if (extraSensitive.length > 0) {
    assertNoBirthPii(userPrompt, null, extraSensitive, { scanFreeTextPatterns: false });
  }
  const directBirthIdentifiersStripped = Boolean(checkContext.passed && checkSystem.passed && checkUser.passed);

  // 4 & 5. Generate + Validate with automatic self-correction retry loop (covers JSON parse errors too!)
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
      context: budgetedContext,
      systemPrompt,
      userPrompt,
      retryFeedback: attempt > 0 ? lastValidation?.errors : undefined,
      previousRawOutput: attempt > 0 ? lastRawOutput : undefined,
    });

    lastRawOutput = generated.rawOutput;

    if (generated.parseError) {
      lastResponse = null;
      lastValidation = {
        valid: false,
        errors: [
          {
            code: 'JSON_PARSE_ERROR',
            path: '$',
            message: `Phản hồi không phải JSON hợp lệ: ${generated.parseError}`,
          },
        ],
        warnings: [],
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
      continue;
    }

    lastResponse = generated.response;
    lastValidation = validateInterpretation(lastResponse, trustedNatal, includedQuotes);
    if (lastValidation.valid) break;
  }

  const isValid = Boolean(lastValidation?.valid);

  return {
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    adapter: { id: adapter.id, kind: adapter.kind },
    attempts,
    promptChars,
    promptTokensEstimate,
    // Never return unvalidated or hallucinated claims to downstream UI callers
    interpretation: isValid ? lastResponse : null,
    validation: lastValidation,
    retrievedQuotes: includedQuotes,
    privacy: {
      directBirthIdentifiersStripped,
      checkedPayloads: 3,
      structuralReidentificationRisk: context.privacy.structuralReidentificationRisk,
      strippedFields: context.privacy.strippedFields,
    },
  };
}

module.exports = {
  interpretNatal,
};
