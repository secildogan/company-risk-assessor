// Stub — returns realistic mock data so the US flow is end-to-end runnable.
// A real implementation would resolve to a CIK via
// https://www.sec.gov/files/company_tickers.json, call the submissions
// endpoint (https://data.sec.gov/submissions/CIK{10-digit-cik}.json) for
// issuer metadata, and send a descriptive User-Agent (required; unkeyed
// requests are rate-limited aggressively).

import type { SecEdgarData, SourceQuery } from "../types";

export async function fetchSecEdgar(query: SourceQuery): Promise<SecEdgarData> {
  console.log(`[${new Date().toISOString()}] secEdgar: start`, query);

  // Fake latency so the progressive UI renders a "loading" state.
  await new Promise((r) => setTimeout(r, 600));

  const name = query.companyName ?? query.registrationNumber ?? "UNKNOWN CORP";

  const result: SecEdgarData = {
    companyName: name.toUpperCase(),
    cik: query.registrationNumber ?? "0001000000",
    ticker: null,
    sicCode: "7372",
    sicDescription: "Services-Prepackaged Software",
    incorporationState: "DE",
    registeredAddress: "100 Main Street, Anytown, DE 19801, United States",
    recentFilings: [
      { form: "10-K", filedAt: "2025-11-04", accession: "0001000000-25-000123" },
      { form: "10-Q", filedAt: "2025-08-02", accession: "0001000000-25-000110" },
      { form: "8-K", filedAt: "2025-07-31", accession: "0001000000-25-000108" },
    ],
    filingCount: 186,
    lastFilingDate: "2025-11-04",
  };

  console.log(
    `[${new Date().toISOString()}] secEdgar: finish [stub]`,
    result.cik,
  );
  return result;
}
