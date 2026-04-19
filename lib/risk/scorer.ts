import type {
  CompanyRiskProfile,
  RiskFactor,
  RiskLevel,
  RuleId,
  Severity,
} from "../types";

export type ScorableProfile = Omit<
  CompanyRiskProfile,
  "riskScore" | "riskLevel" | "riskFactors" | "guardrails"
>;

export interface RuleContext {
  now: Date;
}

export interface RiskRule {
  id: RuleId;
  description: string;
  severity: Severity;
  points: number;
  check: (profile: ScorableProfile, ctx: RuleContext) => boolean;
}

// 4-digit SIC 2007 class prefixes (money services, holding companies,
// IP leasing, gambling). CH returns 5-digit subclasses, so match by prefix.
const HIGH_RISK_SIC_PREFIXES = ["6420", "6619", "7740", "9200"];

export function monthsAgo(isoDate: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(isoDate).getTime();
  return diff / (1000 * 60 * 60 * 24 * 30);
}

function olderThan(date: string | null, months: number, now: Date): boolean {
  return date !== null && monthsAgo(date, now) > months;
}

function newerThan(date: string | null, months: number, now: Date): boolean {
  return date !== null && monthsAgo(date, now) < months;
}

export const RISK_RULES: RiskRule[] = [
  {
    id: "DISSOLVED",
    description: "Company is dissolved or struck off",
    severity: "high",
    points: 30,
    check: (p) =>
      ["dissolved", "struck-off"].includes((p.companyStatus ?? "").toLowerCase()),
  },
  {
    id: "VERY_NEW",
    description: "Company incorporated less than 6 months ago",
    severity: "high",
    points: 30,
    check: (p, { now }) => newerThan(p.incorporationDate, 6, now),
  },
  {
    id: "HIGH_SEVERITY_MEDIA",
    description: "Adverse media with high severity found",
    severity: "high",
    points: 30,
    check: (p) => p.adverseMediaFindings.some((f) => f.severity === "high"),
  },
  {
    id: "NO_FILINGS",
    description: "No filing history despite being over 1 year old",
    severity: "high",
    points: 30,
    check: (p, { now }) =>
      (p.filingCount === 0 || p.filingCount === null) &&
      olderThan(p.incorporationDate, 12, now),
  },
  {
    id: "NEW_COMPANY",
    description: "Company incorporated 6–24 months ago",
    severity: "medium",
    points: 15,
    // Mutually exclusive with VERY_NEW (< 6) and YOUNG_COMPANY (24–36).
    check: (p, { now }) =>
      newerThan(p.incorporationDate, 24, now) &&
      !newerThan(p.incorporationDate, 6, now),
  },
  {
    id: "FEW_FILINGS",
    description: "1 or 2 filings on record",
    severity: "medium",
    points: 15,
    // Mutually exclusive with NO_FILINGS (zero case for > 1y old).
    check: (p) =>
      p.filingCount !== null && p.filingCount > 0 && p.filingCount < 3,
  },
  {
    id: "STALE_ACCOUNTS",
    description: "Last accounts filed over 18 months ago",
    severity: "medium",
    points: 15,
    check: (p, { now }) => olderThan(p.lastAccountsDate, 18, now),
  },
  {
    id: "DIRECTOR_OVERLOADED",
    description: "A director has more than 10 other active appointments",
    severity: "medium",
    points: 15,
    check: (p) => p.directors.some((d) => d.otherActiveAppointments > 10),
  },
  {
    id: "MEDIUM_SEVERITY_MEDIA",
    description: "Adverse media with medium severity found",
    severity: "medium",
    points: 15,
    check: (p) => p.adverseMediaFindings.some((f) => f.severity === "medium"),
  },
  {
    id: "DIRECTOR_BUSY",
    description: "A director has 6–10 other active appointments",
    severity: "low",
    points: 5,
    // Mutually exclusive with DIRECTOR_OVERLOADED.
    check: (p) =>
      p.directors.some(
        (d) =>
          d.otherActiveAppointments > 5 && d.otherActiveAppointments <= 10,
      ),
  },
  {
    id: "YOUNG_COMPANY",
    description: "Company incorporated 24–36 months ago",
    severity: "low",
    points: 5,
    // Mutually exclusive with NEW_COMPANY and VERY_NEW.
    check: (p, { now }) =>
      newerThan(p.incorporationDate, 36, now) &&
      !newerThan(p.incorporationDate, 24, now),
  },
  {
    id: "SOLE_DIRECTOR",
    description: "Only one director with no other officers",
    severity: "low",
    points: 5,
    check: (p) => p.directors.filter((d) => d.isActive).length === 1,
  },
  {
    id: "HIGH_RISK_SIC",
    description:
      "SIC code in high-risk category (money services, gambling, holding companies)",
    severity: "low",
    points: 5,
    check: (p) =>
      p.sicCodes.some((sic) =>
        HIGH_RISK_SIC_PREFIXES.some((prefix) => sic.startsWith(prefix)),
      ),
  },
];

export interface ScoreResult {
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
}

export function scoreCompany(
  profile: ScorableProfile,
  now: Date = new Date(),
): ScoreResult {
  const ctx: RuleContext = { now };
  const triggered = RISK_RULES.filter((rule) => rule.check(profile, ctx));
  const raw = triggered.reduce((sum, r) => sum + r.points, 0);
  // Capped below 100 to reserve headroom for manual-review uncertainty.
  const riskScore = Math.min(raw, 95);

  const riskLevel: RiskLevel =
    riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";

  const riskFactors: RiskFactor[] = triggered.map((r) => ({
    points: r.points,
    rule: r.id,
    reason: r.description,
  }));

  return { riskScore, riskLevel, riskFactors };
}
