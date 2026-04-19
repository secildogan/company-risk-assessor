import type {
  CompanyRiskProfile,
  Guardrails,
  LlmAttemptTrace,
  LlmTrace,
  SourceName,
  SourceStatus,
} from "../types";
import { scoreCompany, type ScorableProfile } from "../risk/scorer";
import type { SourceResultMap } from "../sources";
import { callOpenRouter, stripJsonFences } from "./openRouter";
import { validateProfile, type ValidationResult } from "./validator";

export const PROMPT_VERSION = "v4";

const STRUCTURING_MODEL = "anthropic/claude-sonnet-4.6";

// Sized for large real profiles (~2.5k tokens for a ~20-director payload);
// smaller caps caused mid-string truncation and unrecoverable parse errors.
export const MAX_TOKENS = 4000;
export const TOKEN_WARN_THRESHOLD = 3600;
export const MAX_ATTEMPTS = 3;

// Truncate echoed assistant responses on retry so three failed attempts
// don't balloon the input by 12k+ tokens.
const RETRY_ECHO_CHARS = 500;

export class StructurerError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastResponse: string | null,
    public readonly lastError: string | null,
  ) {
    super(message);
    this.name = "StructurerError";
  }
}

const JSON_SCHEMA = `{
  "resolvedName": "string|null",
  "registrationNumber": "string|null",
  "jurisdiction": "string",
  "registeredAddress": "string|null",
  "incorporationDate": "ISO date string|null",
  "companyStatus": "string|null — e.g. active, dissolved, liquidation, struck-off",
  "sicCodes": "string[]",
  "filingCount": "number|null",
  "lastAccountsDate": "ISO date string|null",
  "directors": [{
    "name": "string",
    "appointedDate": "ISO date string|null",
    "isActive": "boolean",
    "otherActiveAppointments": "number"
  }],
  "adverseMediaFindings": [{
    "summary": "string",
    "severity": "low|medium|high",
    "source": "string"
  }]
}`;

const SYSTEM_PROMPT =
  "You are a structured data extractor. You must respond with valid JSON only. No markdown, no explanation, no code fences.";

// Sources whose raw data appears in the prompt. businessDescription is
// injected post-hoc into the profile, not parroted through the LLM.
const SOURCE_HEADINGS: Partial<Record<SourceName, string>> = {
  companiesHouse: "COMPANIES HOUSE DATA:",
  directors: "DIRECTORS DATA:",
  adverseMedia: "ADVERSE MEDIA DATA:",
  secEdgar: "SEC EDGAR DATA:",
};

interface StructureInput {
  jurisdiction: string;
  orderedSources: SourceName[];
  rawData: SourceResultMap;
  sourceStatuses: Record<string, SourceStatus>;
  /** Wall-clock instant threaded to the scorer for time-dependent rules. */
  now?: Date;
}

function traceEnabled(): boolean {
  return process.env.LLM_TRACE === "1";
}

function buildUserPrompt(payload: StructureInput): string {
  const lines: string[] = [
    "Extract a structured company profile from the raw source data below. Map each field into the schema faithfully; do NOT compute any risk score or risk level — those are computed deterministically downstream.",
    "",
    "SCHEMA (respond with exactly these fields, no others):",
    JSON_SCHEMA,
    "",
    "Rules for extraction:",
    "- Only include adverseMediaFindings that are materially about the target company. Drop findings that concern a different (clone / similar-named) company, or findings that explicitly state there is no issue.",
    "- For `directors`, include every director the registry returned; `isActive` is true iff they have no resigned date. `otherActiveAppointments` is the count from the source data as-is.",
    "- Preserve the registry's companyStatus spelling (e.g. 'active', 'dissolved', 'struck-off').",
    "- If a field is not present in the source data, emit null (or [] for arrays).",
    "",
    `JURISDICTION: ${payload.jurisdiction}`,
    "",
  ];

  for (const src of payload.orderedSources) {
    const heading = SOURCE_HEADINGS[src];
    if (!heading) continue;
    lines.push(heading);
    lines.push(JSON.stringify(payload.rawData[src] ?? null, null, 2));
    lines.push("");
  }

  lines.push("SOURCE STATUSES:");
  lines.push(JSON.stringify(payload.sourceStatuses, null, 2));
  lines.push("");
  lines.push("Respond with the JSON object only.");

  return lines.join("\n");
}

function computeCompletenessScore(profile: CompanyRiskProfile): number {
  const checks: boolean[] = [
    profile.resolvedName != null && profile.resolvedName !== "",
    profile.registrationNumber != null && profile.registrationNumber !== "",
    profile.registeredAddress != null && profile.registeredAddress !== "",
    profile.incorporationDate != null,
    profile.companyStatus != null && profile.companyStatus !== "",
    profile.sicCodes.length > 0,
    profile.filingCount != null,
    profile.lastAccountsDate != null,
    profile.directors.length > 0,
    profile.businessDescription != null && profile.businessDescription !== "",
    // Empty findings is a valid "clean" signal, not a data gap.
    true,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function __completenessForTest(profile: CompanyRiskProfile): number {
  return computeCompletenessScore(profile);
}

function buildValidationCorrective(v: ValidationResult): string {
  const parts: string[] = [];
  if (v.missingFields.length > 0) {
    parts.push(`Missing required fields: ${v.missingFields.join(", ")}.`);
  }
  if (v.invalidFields.length > 0) {
    parts.push(`Invalid fields: ${v.invalidFields.join("; ")}.`);
  }
  return `Your previous response passed JSON parsing but failed schema validation. ${parts.join(
    " ",
  )}
You must return a JSON object with ALL required fields. Respond with valid JSON only. No markdown, no code fences, no explanation.`;
}

function truncateForRetry(content: string): string {
  return content.length > RETRY_ECHO_CHARS
    ? `${content.slice(0, RETRY_ECHO_CHARS)}…[truncated for retry]`
    : content;
}

export async function structure(payload: StructureInput): Promise<CompanyRiskProfile> {
  const userPrompt = buildUserPrompt(payload);
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let lastResponse: string | null = null;
  let lastError: string | null = null;
  let cumulativeOutputTokens = 0;
  const attemptTraces: LlmAttemptTrace[] = [];
  const now = payload.now ?? new Date();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `[${new Date().toISOString()}] llm: attempt ${attempt}/${MAX_ATTEMPTS} (prompt=${PROMPT_VERSION}, max_tokens=${MAX_TOKENS})`,
    );

    let content: string;
    let completionTokens = 0;
    try {
      const result = await callOpenRouter({
        model: STRUCTURING_MODEL,
        messages,
        responseFormatJson: true,
        maxTokens: MAX_TOKENS,
      });
      content = result.content;
      completionTokens = result.completionTokens;
      cumulativeOutputTokens += completionTokens;
      lastResponse = content;
      console.log(
        `[${new Date().toISOString()}] llm: response received (${content.length} chars, completion_tokens=${completionTokens})`,
      );
      if (completionTokens > TOKEN_WARN_THRESHOLD) {
        console.warn(
          `[${new Date().toISOString()}] llm: completion_tokens=${completionTokens} close to cap ${MAX_TOKENS} — response may be truncated`,
        );
      }
    } catch (e) {
      lastError = `transport: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(
        `[${new Date().toISOString()}] llm: attempt ${attempt} failed (${lastError})`,
      );
      attemptTraces.push({ attempt, content: "", error: lastError });
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(content));
    } catch (e) {
      const parseErr = e instanceof Error ? e.message : String(e);
      lastError = `parse: ${parseErr}`;
      console.warn(
        `[${new Date().toISOString()}] llm: attempt ${attempt} failed (${lastError})`,
      );
      attemptTraces.push({ attempt, content, error: lastError });
      if (attempt === MAX_ATTEMPTS) break;
      messages.push({ role: "assistant", content: truncateForRetry(content) });
      messages.push({
        role: "user",
        content: `Your previous response failed JSON parsing with this error: "${parseErr}".
You must respond with valid JSON only. No markdown, no code fences, no explanation.
Start your response directly with { and end with }.`,
      });
      continue;
    }

    const validation = validateProfile(parsed);
    if (!validation.valid) {
      const summary = [
        validation.missingFields.length > 0 &&
          `missing=[${validation.missingFields.join(",")}]`,
        validation.invalidFields.length > 0 &&
          `invalid=[${validation.invalidFields.join(";")}]`,
      ]
        .filter(Boolean)
        .join(" ");
      lastError = `validation: ${summary}`;
      console.warn(
        `[${new Date().toISOString()}] llm: attempt ${attempt} failed (${lastError})`,
      );
      attemptTraces.push({ attempt, content, error: lastError });
      if (attempt === MAX_ATTEMPTS) break;
      messages.push({ role: "assistant", content: truncateForRetry(content) });
      messages.push({ role: "user", content: buildValidationCorrective(validation) });
      continue;
    }

    attemptTraces.push({ attempt, content, error: null });

    const shell: ScorableProfile = {
      ...(parsed as ScorableProfile),
      jurisdiction: (parsed as ScorableProfile).jurisdiction ?? payload.jurisdiction,
      businessDescription:
        payload.rawData.businessDescription?.description ?? null,
      completenessScore: 0,
      dataTimestamp: now.toISOString(),
      promptVersion: PROMPT_VERSION,
      sourceStatuses: payload.sourceStatuses,
    };

    const risk = scoreCompany(shell, now);
    const trace: LlmTrace | undefined = traceEnabled()
      ? { systemPrompt: SYSTEM_PROMPT, userPrompt, attempts: attemptTraces }
      : undefined;
    const guardrails: Guardrails = {
      tokenBudgetUsed: cumulativeOutputTokens,
      attemptCount: attempt,
      validationPassed: true,
      ...(trace ? { trace } : {}),
    };
    const scored: CompanyRiskProfile = { ...shell, ...risk, guardrails };
    return { ...scored, completenessScore: computeCompletenessScore(scored) };
  }

  throw new StructurerError(
    `LLM structuring failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    MAX_ATTEMPTS,
    lastResponse,
    lastError,
  );
}
