import type { CompanyRiskProfile } from "../types";

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  invalidFields: string[];
}

// Only the fields the LLM extracts. Meta fields (risk*, completenessScore,
// dataTimestamp, promptVersion, sourceStatuses, businessDescription,
// guardrails) are injected post-parse by the structurer. Typing against
// keyof CompanyRiskProfile makes a field rename a compile error.
const LLM_OWNED_FIELDS: Array<keyof CompanyRiskProfile> = [
  "resolvedName",
  "registrationNumber",
  "jurisdiction",
  "registeredAddress",
  "incorporationDate",
  "companyStatus",
  "sicCodes",
  "filingCount",
  "lastAccountsDate",
  "directors",
  "adverseMediaFindings",
];

export function validateProfile(data: unknown): ValidationResult {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      missingFields: ["<root>"],
      invalidFields: ["root must be an object"],
    };
  }

  const obj = data as Record<string, unknown>;

  for (const field of LLM_OWNED_FIELDS) {
    if (!(field in obj)) missingFields.push(field);
  }

  if (!Array.isArray(obj.directors)) {
    invalidFields.push("directors must be array");
  }
  if (!Array.isArray(obj.adverseMediaFindings)) {
    invalidFields.push("adverseMediaFindings must be array");
  }
  if (!Array.isArray(obj.sicCodes)) {
    invalidFields.push("sicCodes must be array");
  }

  return {
    valid: missingFields.length === 0 && invalidFields.length === 0,
    missingFields,
    invalidFields,
  };
}
