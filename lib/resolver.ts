import { searchByName, type CompaniesHouseSearchItem } from "./sources/companiesHouse";
import type { CompanyMatch } from "./types";

export type ResolveResult =
  | { kind: "resolved"; registrationNumber: string }
  | { kind: "candidates"; matches: CompanyMatch[] }
  | { kind: "not_found" };

function toMatch(it: CompaniesHouseSearchItem): CompanyMatch {
  return {
    title: it.title,
    companyNumber: it.company_number,
    address: it.address_snippet ?? null,
    companyStatus: it.company_status ?? null,
    companyType: it.company_type ?? null,
    incorporationDate: it.date_of_creation ?? null,
    cessationDate: it.date_of_cessation ?? null,
    description: it.description ?? null,
  };
}

function rankMatches(items: CompaniesHouseSearchItem[], query: string): CompaniesHouseSearchItem[] {
  const q = query.trim().toLowerCase();
  const scored = items.map((it, idx) => {
    const active = (it.company_status ?? "").toLowerCase() === "active" ? 0 : 1;
    const exactMatch = it.title.trim().toLowerCase() === q ? 0 : 1;
    const date = it.date_of_creation ?? "9999-12-31";
    return { it, active, exactMatch, date, idx };
  });
  scored.sort((a, b) => {
    if (a.active !== b.active) return a.active - b.active;
    if (a.exactMatch !== b.exactMatch) return a.exactMatch - b.exactMatch;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.idx - b.idx;
  });
  return scored.map((s) => s.it);
}

export async function resolveCompany(input: {
  companyName?: string;
  registrationNumber?: string;
  jurisdiction: string;
}): Promise<ResolveResult> {
  if (input.jurisdiction !== "GB") {
    throw new Error(`Jurisdiction ${input.jurisdiction} not supported`);
  }

  if (input.registrationNumber && input.registrationNumber.trim().length > 0) {
    return { kind: "resolved", registrationNumber: input.registrationNumber.trim() };
  }

  if (!input.companyName || input.companyName.trim().length === 0) {
    throw new Error("Either companyName or registrationNumber is required");
  }

  const raw = await searchByName(input.companyName, 5);
  if (raw.length === 0) return { kind: "not_found" };

  const ranked = rankMatches(raw, input.companyName);

  if (ranked.length === 1) {
    return { kind: "resolved", registrationNumber: ranked[0].company_number };
  }

  return { kind: "candidates", matches: ranked.slice(0, 5).map(toMatch) };
}

export function __matchesFromSearchForTest(
  items: CompaniesHouseSearchItem[],
): CompanyMatch[] {
  return items.slice(0, 5).map(toMatch);
}

export function __rankMatchesForTest(
  items: CompaniesHouseSearchItem[],
  query: string,
): CompaniesHouseSearchItem[] {
  return rankMatches(items, query);
}
