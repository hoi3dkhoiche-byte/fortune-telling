export type ClaimCategory =
  | 'menh-than'
  | 'ngu-hanh-cuc'
  | 'tu-hoa'
  | 'tam-phuong'
  | 'dai-han'
  | 'cach-cuc'
  | 'cai-van';

export type ClaimConfidence = 'high' | 'medium' | 'low';

export interface InterpretationClaim {
  id: string;
  category: ClaimCategory;
  statement: string;
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

export interface ValidationIssue {
  code:
    | 'SCHEMA_INVALID'
    | 'UNKNOWN_FACT_ID'
    | 'UNKNOWN_QUOTE_ID'
    | 'STAR_PALACE_CONTRADICTION'
    | 'EMPTY_MING_CONTRADICTION'
    | 'SIHUA_CONTRADICTION'
    | 'DOCTRINE_SUPERSTITION';
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
    citedQuoteCount: number;
    contradictionCount: number;
    doctrineViolationCount: number;
  };
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
  };
  profile: {
    id: string;
    status: string;
    brightnessSchool: string;
    leapMonth: string;
    lateZi: string;
  };
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
      transformation: string;
      starNameVi: string;
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
    majorStars: Array<{ nameVi: string; brightnessVi: string; siHuaVi: string }>;
    otherStars: Array<{ nameVi: string; type: string; brightnessVi: string; siHuaVi: string }>;
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
  }): Promise<{ response: InterpretationResponse; rawOutput: string }>;
}

export const INTERPRETATION_SCHEMA_VERSION: 'tuvi.interpretation.v0';
export const CLAIM_CATEGORIES: readonly ClaimCategory[];
export function validateInterpretationSchema(value: unknown): ValidationIssue[];
export function validateInterpretation(
  response: unknown,
  natalResult: any,
  allowedQuotes?: CorpusQuote[],
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
export function buildAnonymizedContext(
  natalResult: any,
  options?: {
    question?: string;
    focusPalace?: string;
    retrievedQuotes?: RetrievedQuote[];
  },
): AnonymizedContext;
export function assertNoBirthPii(
  serializedText: string,
  natalResult: any,
  extraSensitiveValues?: string[],
): void;
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
  interpretation: InterpretationResponse;
  validation: ValidationReport;
  retrievedQuotes: RetrievedQuote[];
  privacy: {
    birthDataSentToModel: false;
    strippedFields: string[];
  };
}>;
