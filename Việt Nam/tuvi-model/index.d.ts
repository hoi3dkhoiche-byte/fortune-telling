export type ClaimCategory =
  | 'menh-than'
  | 'ngu-hanh-cuc'
  | 'tu-hoa'
  | 'tam-phuong'
  | 'dai-han'
  | 'cach-cuc'
  | 'cai-van';

export type ClaimConfidence = 'high' | 'medium' | 'low';

export type AssertionPredicate =
  | 'LOCATED_AT_BRANCH'
  | 'LOCATED_IN'
  | 'HAS_FIVE_ELEMENTS_CLASS'
  | 'IS_STAR'
  | 'HAS_NO_MAJOR_STAR'
  | 'HAS_NATAL_TRANSFORMATION'
  | 'HAS_BRIGHTNESS_AT_PALACE'
  | 'BORROWS_OPPOSITE_MAJOR_STAR'
  | 'OPPOSITE_TO'
  | 'TRINE_WITH'
  | 'HAS_SANFANGSIZHENG_MEMBER'
  | 'HAS_DECADAL_AGE_RANGE';

export interface ClaimAssertion {
  subjectId: string;
  predicate: AssertionPredicate;
  objectId?: string;
  value?: string | number | boolean | number[];
}

export interface InterpretationClaim {
  id: string;
  category: ClaimCategory;
  statement: string;
  assertions: ClaimAssertion[];
  factIds: string[];
  quoteIds?: string[];
  confidence: ClaimConfidence;
}

export interface InterpretationResponse {
  schemaVersion: 'tuvi.interpretation.v0';
  summary: string;
  reasoningSteps: string[];
  claims: InterpretationClaim[];
  actionGuidance: string[];
  disclaimer: string;
}

export type ValidationIssueCode =
  | 'SCHEMA_INVALID'
  | 'JSON_PARSE_ERROR'
  | 'UNKNOWN_FACT_ID'
  | 'ASSERTION_NOT_IN_FACTS'
  | 'UNREFERENCED_FACT_ID'
  | 'CLAIM_STATEMENT_UNGROUNDED'
  | 'UNKNOWN_QUOTE_ID'
  | 'STAR_PALACE_CONTRADICTION'
  | 'EMPTY_MING_CONTRADICTION'
  | 'SIHUA_CONTRADICTION'
  | 'UNGROUNDED_FATALISTIC_CLAIM'
  | 'DOCTRINE_SUPERSTITION';

export interface ValidationIssue {
  code: ValidationIssueCode;
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  metrics: {
    claimCount: number;
    groundedClaimCount: number;
    citedFactCount: number;
    verifiedAssertionCount: number;
    citedQuoteCount: number;
    contradictionCount: number;
    doctrineViolationCount: number;
  };
}

export type ModelErrorCode =
  | 'PRIVACY_VIOLATION'
  | 'REMOTE_ENDPOINT_BLOCKED'
  | 'ENDPOINT_UNREACHABLE'
  | 'ENDPOINT_HTTP_ERROR'
  | 'INVALID_INPUT';

export declare class ModelLayerError extends Error {
  code: ModelErrorCode;
  details?: Record<string, unknown>;
  constructor(code: ModelErrorCode, message: string, details?: Record<string, unknown>);
}

export interface CorpusQuote {
  id: string;
  sourceFile: string;
  lectureTitle: string;
  section: string;
  timestamp: string;
  url: string;
  text: string;
  editorialNote: string;
  tags: string;
}

export interface RetrievedQuote extends CorpusQuote {
  score: number;
  matchedTerms: string[];
}

export interface AnonymizedContext {
  schemaVersion: 'tuvi.context.v0';
  privacy: {
    birthDataStripped: true;
    strippedFields: string[];
    structuralReidentificationRisk: 'non-zero';
  };
  profile: {
    id: string;
    status: string;
    brightnessSchool: string;
    leapMonth: string;
    lateZi: string;
  };
  warnings: string[];
  chartSummary: {
    yinYangGender: string;
    wuxingJu: number;
    wuxingJuLabelVi: string;
    mingPalaceId: string;
    mingBranchLabelVi: string;
    shenPalaceId: string;
    shenPalaceLabelVi: string;
    mingIsEmpty: boolean;
    mingMajorStars: string[];
    mingBorrowedStars: string[];
    mingZhuLabelVi: string;
    shenZhuLabelVi: string;
    siHua: Array<{
      transformationId: string;
      transformation: string;
      starId: string;
      starNameVi: string;
      palaceId: string;
      palaceNameVi: string;
      factId: string;
    }>;
  };
  palaces: Array<{
    id: string;
    nameVi: string;
    branch: number;
    branchLabelVi: string;
    isMing: boolean;
    isShen: boolean;
    isEmpty: boolean;
    daXianAge: [number, number] | null;
    majorStars: Array<{ id: string; nameVi: string; brightnessVi: string; siHuaVi: string }>;
    otherStars: Array<{ id: string; nameVi: string; type: string; brightnessVi: string; siHuaVi: string }>;
    borrowedStarsVi: string[];
  }>;
  facts: Array<{
    id: string;
    kind: string;
    subjectId: string;
    predicate: string;
    objectId?: string;
    value?: unknown;
  }>;
  promptFacts: Array<{
    id: string;
    kind: string;
    subjectId: string;
    predicate: string;
    objectId?: string;
    value?: unknown;
  }>;
  relations: unknown[];
  focusPalaceId: string | null;
  question: string | null;
  retrievedQuotes: RetrievedQuote[];
}

export interface ModelAdapter {
  readonly id: string;
  readonly kind: 'mock' | 'local' | 'remote';
  generate(input: {
    context: AnonymizedContext;
    systemPrompt: string;
    userPrompt: string;
    retryFeedback?: ValidationIssue[];
    previousRawOutput?: string;
  }): Promise<{ response: InterpretationResponse | null; rawOutput: string; parseError?: string }>;
}

export const INTERPRETATION_SCHEMA_VERSION: 'tuvi.interpretation.v0';
export const CLAIM_CATEGORIES: readonly ClaimCategory[];
export const ASSERTION_PREDICATES: readonly AssertionPredicate[];
export function canonicalizeVi(raw: string): string;
export function validateInterpretationSchema(value: unknown): ValidationIssue[];
export function validateInterpretation(
  response: unknown,
  natalResult: any,
  allowedQuotes?: Array<{ id: string }>,
): ValidationReport;
export function loadCorpus(docsDir?: string): {
  quotes: CorpusQuote[];
  lectureCount: number;
  retrieve(query: {
    context?: AnonymizedContext;
    question?: string;
    focusPalace?: string;
    topK?: number;
  }): RetrievedQuote[];
  getById(id: string): CorpusQuote | undefined;
};
export function scanQuestionForBirthPii(question: string | null | undefined): void;
export function buildAnonymizedContext(
  natalResult: any,
  options?: {
    question?: string;
    focusPalace?: string;
    retrievedQuotes?: RetrievedQuote[];
    recomputeFromNatal?: boolean;
  },
): AnonymizedContext;
export function assertNoBirthPii(
  serializedText: string,
  natalResult: any,
  extraSensitiveValues?: string[],
): { passed: true; checkedLength: number };
export function buildPrompts(context: AnonymizedContext): {
  systemPrompt: string;
  userPrompt: string;
};
export function createMockAdapter(): ModelAdapter;
export function createOpenAICompatibleAdapter(options?: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  allowRemote?: boolean;
  timeoutMs?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}): ModelAdapter;
export function interpretNatal(
  natalResult: any,
  options?: {
    adapter?: ModelAdapter;
    corpus?: ReturnType<typeof loadCorpus>;
    question?: string;
    focusPalace?: string;
    topKQuotes?: number;
    maxRetries?: number;
    extraSensitiveValues?: string[];
  },
): Promise<{
  schemaVersion: 'tuvi.interpretation.v0';
  adapter: { id: string; kind: string };
  attempts: number;
  promptChars: number;
  interpretation: InterpretationResponse | null;
  validation: ValidationReport;
  retrievedQuotes: RetrievedQuote[];
  privacy: {
    directBirthIdentifiersStripped: boolean;
    checkedPayloads: number;
    structuralReidentificationRisk: 'non-zero';
    strippedFields: string[];
  };
}>;
