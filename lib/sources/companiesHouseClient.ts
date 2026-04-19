import { SourceError, type SourceName } from "../types";

const BASE = "https://api.company-information.service.gov.uk";
const DEFAULT_TIMEOUT_MS = 5_000;

function authHeader(source: SourceName): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new SourceError(source, "COMPANIES_HOUSE_API_KEY not set");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export async function chFetch<T = unknown>(
  source: SourceName,
  path: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: authHeader(source), Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new SourceError(source, `Companies House ${path} returned ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof SourceError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new SourceError(source, `Companies House ${path} timed out after ${timeoutMs}ms`);
    }
    throw new SourceError(
      source,
      `Companies House ${path} failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(t);
  }
}
