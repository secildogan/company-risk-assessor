// The prompt is deliberately directive ("Search the public web for adverse
// media …") — merging it with the description call under-fetched findings
// because Sonar anchored on the description as the primary deliverable.

import type { AdverseMediaData, SourceQuery } from "../types";
import { SourceError } from "../types";
import { callOpenRouter, stripJsonFences } from "../llm/openRouter";

const WEB_MODEL = "perplexity/sonar";
const WEB_TIMEOUT_MS = 8_000;

function mockFindings(companyName: string): AdverseMediaData {
  if (process.env.ADVERSE_MEDIA_MOCK_FINDINGS === "1") {
    return {
      findings: [
        {
          summary: `[mock] Public complaint thread mentioning ${companyName} customer support delays`,
          severity: "low",
          source: "https://example.com/mock-complaint",
        },
      ],
    };
  }
  return { findings: [] };
}

export async function fetchAdverseMedia(
  query: SourceQuery,
): Promise<AdverseMediaData> {
  // Precondition: canonicalFrom() in the registry hands us the registry-
  // returned name once the primary source has settled. A missing name here
  // means the pipeline was misconfigured (dep not declared, or primary
  // errored and the dep was stripped) — fail loudly instead of searching
  // Perplexity for the bare registration number.
  const companyName = query.companyName;
  if (!companyName) {
    throw new SourceError(
      "adverseMedia",
      "company name required (primary registry did not supply one)",
    );
  }
  console.log(`[${new Date().toISOString()}] adverseMedia: start`, companyName);

  if (!process.env.OPENROUTER_API_KEY) {
    console.warn(
      `[${new Date().toISOString()}] adverseMedia: OPENROUTER_API_KEY unset, returning mock`,
    );
    return mockFindings(companyName);
  }

  const prompt = `Search the public web for adverse media about "${companyName}". Query terms: scam OR fraud OR investigation OR complaint OR sanction OR "regulatory action". Return ONLY a JSON object of shape {"findings":[{"summary":string,"severity":"low"|"medium"|"high","source":string}]}. Only include findings materially about this specific company — drop results that concern a similarly-named different company, or findings that explicitly state there is no issue. If nothing credible is found, return {"findings":[]}. No prose, no markdown, no code fences.`;

  try {
    const { content } = await callOpenRouter({
      model: WEB_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a risk analyst. Respond with valid JSON only. No markdown, no explanation, no code fences.",
        },
        { role: "user", content: prompt },
      ],
      timeoutMs: WEB_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stripJsonFences(content)) as AdverseMediaData;
    if (!Array.isArray(parsed.findings)) {
      throw new SourceError("adverseMedia", "LLM response missing findings array");
    }
    console.log(
      `[${new Date().toISOString()}] adverseMedia: finish`,
      `${parsed.findings.length} findings`,
    );
    return parsed;
  } catch (e) {
    console.warn(
      `[${new Date().toISOString()}] adverseMedia: error, returning mock`,
      e,
    );
    return mockFindings(companyName);
  }
}
