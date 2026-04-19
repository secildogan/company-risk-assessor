import { describe, it, expect } from "vitest";
import { scoreCompany, type ScorableProfile } from "@/lib/risk/scorer";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function base(overrides: Partial<ScorableProfile> = {}): ScorableProfile {
  return {
    resolvedName: "TEST CO LTD",
    registrationNumber: "12345678",
    jurisdiction: "GB",
    registeredAddress: "1 Test St",
    incorporationDate: daysAgo(365 * 5),
    companyStatus: "active",
    sicCodes: ["62090"],
    filingCount: 20,
    lastAccountsDate: daysAgo(180),
    businessDescription: null,
    directors: [
      {
        name: "A Person",
        appointedDate: daysAgo(365 * 4),
        isActive: true,
        otherActiveAppointments: 1,
      },
      {
        name: "B Person",
        appointedDate: daysAgo(365 * 3),
        isActive: true,
        otherActiveAppointments: 0,
      },
    ],
    adverseMediaFindings: [],
    completenessScore: 100,
    dataTimestamp: new Date().toISOString(),
    promptVersion: "test",
    sourceStatuses: {},
    ...overrides,
  };
}

describe("scoreCompany — deterministic risk scoring", () => {
  it("a 3-month-old sole-director company scores medium on VERY_NEW", () => {
    const result = scoreCompany(
      base({
        incorporationDate: daysAgo(90),
        filingCount: 0,
        lastAccountsDate: null,
        directors: [
          {
            name: "Only Director",
            appointedDate: daysAgo(90),
            isActive: true,
            otherActiveAppointments: 0,
          },
        ],
      }),
    );
    // VERY_NEW (+30) + SOLE_DIRECTOR (+5) = 35 → medium.
    // NEW_COMPANY and YOUNG_COMPANY are mutually exclusive with VERY_NEW,
    // so only the most specific age band fires.
    const ruleIds = result.riskFactors.map((f) => f.rule);
    expect(result.riskScore).toBe(35);
    expect(result.riskLevel).toBe("medium");
    expect(ruleIds).toContain("VERY_NEW");
    expect(ruleIds).toContain("SOLE_DIRECTOR");
    expect(ruleIds).not.toContain("NEW_COMPANY");
    expect(ruleIds).not.toContain("YOUNG_COMPANY");
  });

  it("age rules are mutually exclusive: a 1-year-old fires only NEW_COMPANY", () => {
    const result = scoreCompany(
      base({ incorporationDate: daysAgo(365) }),
    );
    const ruleIds = result.riskFactors.map((f) => f.rule);
    expect(ruleIds).toContain("NEW_COMPANY");
    expect(ruleIds).not.toContain("VERY_NEW");
    expect(ruleIds).not.toContain("YOUNG_COMPANY");
  });

  it("age rules are mutually exclusive: a 30-month-old fires only YOUNG_COMPANY", () => {
    const result = scoreCompany(
      base({ incorporationDate: daysAgo(30 * 30) }),
    );
    const ruleIds = result.riskFactors.map((f) => f.rule);
    expect(ruleIds).toContain("YOUNG_COMPANY");
    expect(ruleIds).not.toContain("NEW_COMPANY");
    expect(ruleIds).not.toContain("VERY_NEW");
  });

  it("a 5-year-old company with clean filings and no adverse media scores low", () => {
    const result = scoreCompany(base());
    expect(result.riskLevel).toBe("low");
    expect(result.riskScore).toBeLessThan(30);
    expect(result.riskFactors).toEqual([]);
  });

  it("a dissolved company always triggers the dissolved rule", () => {
    const result = scoreCompany(base({ companyStatus: "dissolved" }));
    expect(result.riskFactors.map((f) => f.rule)).toContain("DISSOLVED");
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it("high-severity adverse media alone pushes into medium territory", () => {
    const result = scoreCompany(
      base({
        adverseMediaFindings: [
          { summary: "Regulator investigation", severity: "high", source: "x" },
        ],
      }),
    );
    expect(result.riskFactors.map((f) => f.rule)).toContain(
      "HIGH_SEVERITY_MEDIA",
    );
    // 30 points → exactly at the medium boundary.
    expect(result.riskLevel).toBe("medium");
  });

  it("score is capped at 95 even when every rule fires", () => {
    const result = scoreCompany(
      base({
        companyStatus: "dissolved",
        incorporationDate: daysAgo(60),
        filingCount: 0,
        lastAccountsDate: daysAgo(365 * 3),
        sicCodes: ["6420"],
        directors: [
          {
            name: "Over-busy",
            appointedDate: daysAgo(30),
            isActive: true,
            otherActiveAppointments: 20,
          },
        ],
        adverseMediaFindings: [
          { summary: "bad", severity: "high", source: "x" },
          { summary: "bad too", severity: "medium", source: "y" },
        ],
      }),
    );
    expect(result.riskScore).toBe(95);
    expect(result.riskLevel).toBe("high");
  });

  it("does not trigger no_filings for a young company with zero filings", () => {
    // Under 12 months old — young companies are expected to have few filings.
    const result = scoreCompany(
      base({ incorporationDate: daysAgo(90), filingCount: 0 }),
    );
    expect(result.riskFactors.map((f) => f.rule)).not.toContain("NO_FILINGS");
  });

  it("triggers no_filings only when older than 1 year AND filings is 0/null", () => {
    const result = scoreCompany(
      base({ incorporationDate: daysAgo(400), filingCount: 0 }),
    );
    expect(result.riskFactors.map((f) => f.rule)).toContain("NO_FILINGS");
  });

  it("high_risk_sic matches 5-digit Companies House subclasses by 4-digit prefix", () => {
    // Companies House returns 5-digit SIC 2007 codes; the rule's 4-digit list
    // is a class-level prefix match.
    const cases = [
      "64201", // Holding companies - agricultural
      "64205", // Holding companies - financial services
      "66190", // Other activities auxiliary to financial services
      "77400", // Leasing of intellectual property
      "92000", // Gambling and betting
    ];
    for (const code of cases) {
      const result = scoreCompany(base({ sicCodes: [code] }));
      expect(
        result.riskFactors.map((f) => f.rule),
        `expected HIGH_RISK_SIC for code ${code}`,
      ).toContain("HIGH_RISK_SIC");
    }
  });

  it("high_risk_sic does not fire on unrelated SIC codes", () => {
    const result = scoreCompany(base({ sicCodes: ["62090", "70210"] }));
    expect(result.riskFactors.map((f) => f.rule)).not.toContain("HIGH_RISK_SIC");
  });

  it("director rules are mutually exclusive by band", () => {
    // 8 appointments → DIRECTOR_BUSY only
    const busy = scoreCompany(
      base({
        directors: [
          {
            name: "Busy",
            appointedDate: daysAgo(100),
            isActive: true,
            otherActiveAppointments: 8,
          },
        ],
      }),
    );
    const busyIds = busy.riskFactors.map((f) => f.rule);
    expect(busyIds).toContain("DIRECTOR_BUSY");
    expect(busyIds).not.toContain("DIRECTOR_OVERLOADED");

    // 12 appointments → DIRECTOR_OVERLOADED only
    const overloaded = scoreCompany(
      base({
        directors: [
          {
            name: "Overloaded",
            appointedDate: daysAgo(100),
            isActive: true,
            otherActiveAppointments: 12,
          },
        ],
      }),
    );
    const overloadedIds = overloaded.riskFactors.map((f) => f.rule);
    expect(overloadedIds).toContain("DIRECTOR_OVERLOADED");
    expect(overloadedIds).not.toContain("DIRECTOR_BUSY");
  });

  it("filing rules are mutually exclusive: zero filings older than 1y → NO_FILINGS only", () => {
    const result = scoreCompany(
      base({ incorporationDate: daysAgo(400), filingCount: 0 }),
    );
    const ruleIds = result.riskFactors.map((f) => f.rule);
    expect(ruleIds).toContain("NO_FILINGS");
    expect(ruleIds).not.toContain("FEW_FILINGS");
  });

  it("filing rules are mutually exclusive: 2 filings → FEW_FILINGS only", () => {
    const result = scoreCompany(
      base({ incorporationDate: daysAgo(400), filingCount: 2 }),
    );
    const ruleIds = result.riskFactors.map((f) => f.rule);
    expect(ruleIds).toContain("FEW_FILINGS");
    expect(ruleIds).not.toContain("NO_FILINGS");
  });

  it("is fully deterministic — same input produces identical output", () => {
    const input = base({
      incorporationDate: daysAgo(100),
      adverseMediaFindings: [
        { summary: "complaint", severity: "medium", source: "x" },
      ],
    });
    const a = scoreCompany(input);
    const b = scoreCompany(input);
    expect(a).toEqual(b);
  });
});
