const BASE = "https://openrouter.ai/api/v1";
// Sized for the structurer's cold-path latency on large profiles (10–20s);
// the route's OVERALL_TIMEOUT_MS is the hard ceiling on aggregate latency.
const DEFAULT_TIMEOUT_MS = 25_000;

export function stripJsonFences(s: string): string {
  return s.trim().replace(/^```json\s*|\s*```$/g, "");
}

interface CallOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  responseFormatJson?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CallResult {
  content: string;
  completionTokens: number;
}

export async function callOpenRouter(opts: CallOptions): Promise<CallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0,
  };
  if (opts.responseFormatJson) body.response_format = { type: "json_object" };
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned no content");
    return { content, completionTokens: json.usage?.completion_tokens ?? 0 };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`OpenRouter timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
