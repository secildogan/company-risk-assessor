import type { BusinessDescriptionData, SourceQuery } from "../types";
import { SourceError } from "../types";
import { callOpenRouter, stripJsonFences } from "../llm/openRouter";

const WEB_MODEL = "perplexity/sonar";
const WEB_TIMEOUT_MS = 8_000;

export async function fetchBusinessDescription(
  query: SourceQuery,
): Promise<BusinessDescriptionData> {
  // Precondition: same as adverseMedia — the registry-canonical name must
  // be set by the time this source fires, otherwise we'd describe digits.
  const companyName = query.companyName;
  if (!companyName) {
    throw new SourceError(
      "businessDescription",
      "company name required (primary registry did not supply one)",
    );
  }
  console.log(
    `[${new Date().toISOString()}] businessDescription: start`,
    companyName,
  );

  if (!process.env.OPENROUTER_API_KEY) {
    console.warn(
      `[${new Date().toISOString()}] businessDescription: OPENROUTER_API_KEY unset, returning null`,
    );
    return { description: null };
  }

  const prompt = `In ONE sentence of no more than 25 words, describe what "${companyName}" does as a business. Focus on their primary product, service, or industry. If you cannot find reliable information about this specific company, respond with {"description": null}. Return ONLY JSON of shape {"description": string|null}. No prose, no markdown, no code fences.`;

  try {
    const { content } = await callOpenRouter({
      model: WEB_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a research analyst. Respond with valid JSON only. No markdown, no explanation, no code fences.",
        },
        { role: "user", content: prompt },
      ],
      timeoutMs: WEB_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stripJsonFences(content)) as BusinessDescriptionData;
    const description =
      typeof parsed.description === "string" && parsed.description.trim().length > 0
        ? parsed.description.trim()
        : null;
    console.log(
      `[${new Date().toISOString()}] businessDescription: finish`,
      description ? `"${description.slice(0, 60)}…"` : "null",
    );
    return { description };
  } catch (e) {
    console.warn(
      `[${new Date().toISOString()}] businessDescription: error, returning null`,
      e,
    );
    return { description: null };
  }
}
