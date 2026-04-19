import type { CompaniesHouseData, SourceQuery } from "../types";
import { SourceError } from "../types";
import { chFetch } from "./companiesHouseClient";

export interface CompaniesHouseSearchItem {
  title: string;
  company_number: string;
  address_snippet?: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  date_of_cessation?: string;
  description?: string;
}

export async function searchByName(
  name: string,
  limit = 5,
): Promise<CompaniesHouseSearchItem[]> {
  const q = encodeURIComponent(name);
  const data = await chFetch<{ items?: CompaniesHouseSearchItem[] }>(
    "companiesHouse",
    `/search/companies?q=${q}&items_per_page=${limit}`,
  );
  return (data.items ?? []).slice(0, limit);
}

interface CompanyProfile {
  company_name?: string;
  company_number?: string;
  date_of_creation?: string;
  company_status?: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
  sic_codes?: string[];
  accounts?: { last_accounts?: { made_up_to?: string } };
}

function formatAddress(addr: CompanyProfile["registered_office_address"]): string | null {
  if (!addr) return null;
  return (
    [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code, addr.country]
      .filter(Boolean)
      .join(", ") || null
  );
}

export async function fetchCompaniesHouse(
  query: SourceQuery,
): Promise<CompaniesHouseData> {
  console.log(`[${new Date().toISOString()}] companiesHouse: start`, query);

  if (query.jurisdiction !== "GB") {
    throw new SourceError(
      "companiesHouse",
      `Jurisdiction ${query.jurisdiction} not supported by Companies House source`,
    );
  }

  // Precondition: the route runs `resolveCompany` first, so regnum is
  // always set by the time this source fires.
  const { registrationNumber } = query;
  if (!registrationNumber) {
    throw new SourceError(
      "companiesHouse",
      "registrationNumber required (resolver should have supplied it)",
    );
  }

  const regPath = encodeURIComponent(registrationNumber);
  const [profile, filings] = await Promise.all([
    chFetch<CompanyProfile>("companiesHouse", `/company/${regPath}`),
    chFetch<{ total_count?: number }>(
      "companiesHouse",
      `/company/${regPath}/filing-history?items_per_page=1`,
    ).catch((e: unknown) => {
      console.warn(
        `[${new Date().toISOString()}] companiesHouse: filing-history unavailable`,
        e,
      );
      return { total_count: null as number | null };
    }),
  ]);

  const result: CompaniesHouseData = {
    companyName: profile.company_name ?? null,
    registrationNumber: profile.company_number ?? registrationNumber,
    incorporationDate: profile.date_of_creation ?? null,
    companyStatus: profile.company_status ?? null,
    registeredAddress: formatAddress(profile.registered_office_address),
    sicCodes: profile.sic_codes ?? [],
    filingCount: filings.total_count ?? null,
    lastAccountsDate: profile.accounts?.last_accounts?.made_up_to ?? null,
  };

  console.log(
    `[${new Date().toISOString()}] companiesHouse: finish`,
    result.registrationNumber,
  );
  return result;
}
