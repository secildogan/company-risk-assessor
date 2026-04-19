export type SourceName =
  | "companiesHouse"
  | "directors"
  | "adverseMedia"
  | "businessDescription"
  | "secEdgar";

export type SourceStatus = "success" | "error" | "timeout";

export type RiskLevel = "low" | "medium" | "high";

export type Severity = "low" | "medium" | "high";

export interface DirectorRecord {
  name: string;
  appointedDate: string | null;
  isActive: boolean;
  otherActiveAppointments: number;
}

export interface AdverseMediaFinding {
  summary: string;
  severity: Severity;
  source: string;
}

export type RuleId =
  | "DISSOLVED"
  | "VERY_NEW"
  | "HIGH_SEVERITY_MEDIA"
  | "NO_FILINGS"
  | "NEW_COMPANY"
  | "FEW_FILINGS"
  | "STALE_ACCOUNTS"
  | "DIRECTOR_OVERLOADED"
  | "MEDIUM_SEVERITY_MEDIA"
  | "DIRECTOR_BUSY"
  | "YOUNG_COMPANY"
  | "SOLE_DIRECTOR"
  | "HIGH_RISK_SIC";

export interface RiskFactor {
  points: number;
  rule: RuleId;
  reason: string;
}

export interface LlmAttemptTrace {
  attempt: number;
  content: string;
  error: string | null;
}

export interface LlmTrace {
  systemPrompt: string;
  userPrompt: string;
  attempts: LlmAttemptTrace[];
}

export interface Guardrails {
  tokenBudgetUsed: number;
  attemptCount: number;
  validationPassed: boolean;
  /** Present only when LLM_TRACE=1: full prompt + per-attempt response text. */
  trace?: LlmTrace;
}

export interface CompanyRiskProfile {
  resolvedName: string | null;
  registrationNumber: string | null;
  jurisdiction: string;
  registeredAddress: string | null;
  incorporationDate: string | null;
  companyStatus: string | null;
  sicCodes: string[];
  filingCount: number | null;
  lastAccountsDate: string | null;
  businessDescription: string | null;
  directors: DirectorRecord[];
  adverseMediaFindings: AdverseMediaFinding[];
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  completenessScore: number;
  dataTimestamp: string;
  promptVersion: string;
  sourceStatuses: Record<string, SourceStatus>;
  guardrails: Guardrails;
}

export interface CompaniesHouseData {
  companyName?: string | null;
  registrationNumber?: string | null;
  incorporationDate?: string | null;
  companyStatus?: string | null;
  registeredAddress?: string | null;
  sicCodes?: string[];
  filingCount?: number | null;
  lastAccountsDate?: string | null;
}

export interface DirectorsData {
  directors: Array<{
    name: string;
    appointedDate: string | null;
    resignedDate: string | null;
    otherActiveAppointments: number;
  }>;
}

export interface AdverseMediaData {
  findings: AdverseMediaFinding[];
}

export interface BusinessDescriptionData {
  description: string | null;
}

export interface SecEdgarData {
  companyName?: string | null;
  cik?: string | null;
  ticker?: string | null;
  sicCode?: string | null;
  sicDescription?: string | null;
  incorporationState?: string | null;
  registeredAddress?: string | null;
  recentFilings?: Array<{ form: string; filedAt: string; accession: string }>;
  filingCount?: number | null;
  lastFilingDate?: string | null;
}

export interface SourceQuery {
  companyName?: string;
  registrationNumber?: string;
  jurisdiction: string;
}

export interface CompanyMatch {
  title: string;
  companyNumber: string;
  address: string | null;
  companyStatus: string | null;
  companyType: string | null;
  incorporationDate: string | null;
  cessationDate: string | null;
  description: string | null;
}

export class SourceError extends Error {
  constructor(
    public readonly source: SourceName,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
