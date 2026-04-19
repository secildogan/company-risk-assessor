// Client-safe config: this module must not import Node-only code, because
// both the server registry and the client status panel consume it.

import type { SourceName } from "../types";

export const SOURCE_LABELS: Record<SourceName, string> = {
  companiesHouse: "Companies House",
  directors: "Directors & appointments",
  adverseMedia: "Adverse media search",
  businessDescription: "Business description",
  secEdgar: "SEC EDGAR filings",
};

export const SOURCES_BY_JURISDICTION: Record<string, SourceName[]> = {
  GB: ["companiesHouse", "directors", "adverseMedia", "businessDescription"],
  US: ["secEdgar", "adverseMedia", "businessDescription"],
  DEFAULT: ["adverseMedia", "businessDescription"],
};

export function sourceNamesForJurisdiction(jurisdiction: string): SourceName[] {
  return SOURCES_BY_JURISDICTION[jurisdiction] ?? SOURCES_BY_JURISDICTION.DEFAULT;
}

export function supportedJurisdictions(): string[] {
  return Object.keys(SOURCES_BY_JURISDICTION).filter((j) => j !== "DEFAULT");
}

export function primarySourceFor(jurisdiction: string): SourceName | null {
  const names = sourceNamesForJurisdiction(jurisdiction);
  if (jurisdiction === "GB") return names.includes("companiesHouse") ? "companiesHouse" : null;
  if (jurisdiction === "US") return names.includes("secEdgar") ? "secEdgar" : null;
  return null;
}
