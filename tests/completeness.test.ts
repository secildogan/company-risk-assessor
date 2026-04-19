import { describe, it, expect } from "vitest";
import { __completenessForTest } from "@/lib/llm/structurer";
import type { CompanyRiskProfile } from "@/lib/types";

function base(): CompanyRiskProfile {
  return {
    resolvedName: null,
    registrationNumber: null,
    jurisdiction: "GB",
    registeredAddress: null,
    incorporationDate: null,
    companyStatus: null,
    sicCodes: [],
    filingCount: null,
    lastAccountsDate: null,
    businessDescription: null,
    directors: [],
    adverseMediaFindings: [],
    riskScore: 0,
    riskLevel: "low",
    riskFactors: [],
    completenessScore: 0,
    dataTimestamp: new Date().toISOString(),
    promptVersion: "v1",
    sourceStatuses: {},
    guardrails: {
      tokenBudgetUsed: 0,
      attemptCount: 1,
      validationPassed: true,
    },
  };
}

// Checks cover 11 fields (10 populatable + adverseMedia which always counts).
describe("completeness score", () => {
  it("returns 9 for an empty profile (only adverseMedia counts)", () => {
    expect(__completenessForTest(base())).toBe(9);
  });

  it("counts populated primitive fields", () => {
    const p = base();
    p.resolvedName = "Acme Ltd";
    p.registrationNumber = "12345678";
    p.registeredAddress = "1 High St";
    // 3 primitives + 1 (adverse always) = 4 / 11 ≈ 36
    expect(__completenessForTest(p)).toBe(36);
  });

  it("counts non-empty arrays but not empty ones", () => {
    const p = base();
    p.sicCodes = ["62020"];
    expect(__completenessForTest(p)).toBe(18);

    p.directors = [
      { name: "X", appointedDate: null, isActive: true, otherActiveAppointments: 0 },
    ];
    expect(__completenessForTest(p)).toBe(27);
  });

  it("returns 100 for a fully-populated profile", () => {
    const p = base();
    p.resolvedName = "Monzo Bank Limited";
    p.registrationNumber = "09446231";
    p.registeredAddress = "Broadwalk House, 5 Appold Street, London, EC2A 2AG";
    p.incorporationDate = "2015-02-06";
    p.companyStatus = "active";
    p.sicCodes = ["64190"];
    p.filingCount = 120;
    p.lastAccountsDate = "2024-02-29";
    p.businessDescription = "A UK-based digital bank serving retail and business customers.";
    p.directors = [
      { name: "A Person", appointedDate: "2020-01-01", isActive: true, otherActiveAppointments: 2 },
    ];
    expect(__completenessForTest(p)).toBe(100);
  });

  it("treats empty strings as unpopulated", () => {
    const p = base();
    p.resolvedName = "";
    p.registrationNumber = "";
    p.companyStatus = "";
    p.businessDescription = "";
    expect(__completenessForTest(p)).toBe(9);
  });
});
