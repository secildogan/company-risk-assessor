// Source registry — see README § "Extending the system".

import type {
  AdverseMediaData,
  BusinessDescriptionData,
  CompaniesHouseData,
  DirectorsData,
  SecEdgarData,
  SourceName,
} from "../types";
import { fetchCompaniesHouse } from "./companiesHouse";
import { fetchDirectors } from "./directors";
import { fetchAdverseMedia } from "./adverseMedia";
import { fetchBusinessDescription } from "./businessDescription";
import { fetchSecEdgar } from "./secEdgar";
import { sourceNamesForJurisdiction } from "./config";

export interface SourceInput {
  companyName?: string;
  registrationNumber?: string;
  jurisdiction: string;
  /** Results from earlier-run sources in the same pipeline. */
  prior: SourceResultMap;
}

export type SourceFn = (input: SourceInput) => Promise<unknown>;

export interface SourceDef {
  name: SourceName;
  label: string;
  fetch: SourceFn;
  /** Sources listed here must complete (success OR error) before this one starts. */
  dependsOn?: SourceName[];
}

const companiesHouseSource: SourceDef = {
  name: "companiesHouse",
  label: "Companies House",
  fetch: async (input) => fetchCompaniesHouse(input),
};

// Prefer registry-canonical name/regnum when available so (a) a mismatched
// user (name, regnum) pair doesn't drift downstream sources off the regnum
// entity, and (b) a regnum-only request still gives the web-search sources
// a real company name to search for instead of the bare digits.
function canonicalFrom(input: SourceInput): {
  companyName?: string;
  registrationNumber?: string;
} {
  const ch = input.prior.companiesHouse;
  const sec = input.prior.secEdgar;
  return {
    companyName: ch?.companyName ?? sec?.companyName ?? input.companyName,
    registrationNumber:
      ch?.registrationNumber ?? sec?.cik ?? input.registrationNumber,
  };
}

const directorsSource: SourceDef = {
  name: "directors",
  label: "Directors & appointments",
  dependsOn: ["companiesHouse"],
  fetch: async (input) => {
    const { registrationNumber } = canonicalFrom(input);
    if (!registrationNumber) {
      throw new Error("directors: no registration number available");
    }
    return fetchDirectors({ ...input, registrationNumber });
  },
};

// Depends on the primary registry so the canonical registry-returned name
// is used for the web search. Without this, a regnum-only request would
// hand the bare registration digits to Perplexity and return garbage.
// `getSourcesForJurisdiction` strips whichever primary isn't in-pipeline.
const adverseMediaSource: SourceDef = {
  name: "adverseMedia",
  label: "Adverse media search",
  dependsOn: ["companiesHouse", "secEdgar"],
  fetch: async (input) => fetchAdverseMedia({ ...input, ...canonicalFrom(input) }),
};

const secEdgarSource: SourceDef = {
  name: "secEdgar",
  label: "SEC EDGAR filings",
  fetch: async (input) => fetchSecEdgar(input),
};

const businessDescriptionSource: SourceDef = {
  name: "businessDescription",
  label: "Business description",
  dependsOn: ["companiesHouse", "secEdgar"],
  fetch: async (input) =>
    fetchBusinessDescription({ ...input, ...canonicalFrom(input) }),
};

const REGISTRY: Record<SourceName, SourceDef> = {
  companiesHouse: companiesHouseSource,
  directors: directorsSource,
  adverseMedia: adverseMediaSource,
  businessDescription: businessDescriptionSource,
  secEdgar: secEdgarSource,
};

export function getSourcesForJurisdiction(jurisdiction: string): SourceDef[] {
  const names = sourceNamesForJurisdiction(jurisdiction);
  // Strip deps not present in this jurisdiction's pipeline.
  const nameSet = new Set(names);
  return names.map((name) => ({
    ...REGISTRY[name],
    dependsOn: REGISTRY[name].dependsOn?.filter((d) => nameSet.has(d)),
  }));
}

export type SourceResultMap = {
  companiesHouse?: CompaniesHouseData | null;
  directors?: DirectorsData | null;
  adverseMedia?: AdverseMediaData | null;
  businessDescription?: BusinessDescriptionData | null;
  secEdgar?: SecEdgarData | null;
};
