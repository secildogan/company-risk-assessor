import { NextRequest } from "next/server";
import { structure } from "@/lib/llm/structurer";
import { resolveCompany } from "@/lib/resolver";
import { getSourcesForJurisdiction } from "@/lib/sources";
import { primarySourceFor } from "@/lib/sources/config";
import { runSources, type LiveStatus } from "@/lib/sources/runner";
import type { SourceName, SourceStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous hard ceiling — the 10s target is for typical companies; large
// profiles (20+ directors + two Perplexity calls + LLM) can exceed 20s cold.
const OVERALL_TIMEOUT_MS = 45_000;

interface RequestBody {
  companyName?: string;
  registrationNumber?: string;
  jurisdiction?: string;
}

function sseEncode(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const jurisdiction = body.jurisdiction ?? "GB";
  const { companyName, registrationNumber } = body;

  if (!companyName && !registrationNumber) {
    return jsonResponse(
      { error: "Either companyName or registrationNumber is required" },
      400,
    );
  }

  // Name→regnum disambiguation is GB-specific; other jurisdictions pass through.
  let resolvedRegNumber: string | undefined = registrationNumber;
  if (jurisdiction === "GB") {
    try {
      const resolved = await resolveCompany({
        companyName,
        registrationNumber,
        jurisdiction,
      });
      if (resolved.kind === "candidates") {
        return jsonResponse({ kind: "candidates", matches: resolved.matches });
      }
      if (resolved.kind === "not_found") {
        return jsonResponse({ error: "Company not found" }, 404);
      }
      resolvedRegNumber = resolved.registrationNumber;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resolver failed";
      return jsonResponse({ error: msg }, 500);
    }
  }

  const sourceDefs = getSourcesForJurisdiction(jurisdiction);
  const orderedSources = sourceDefs.map((d) => d.name);
  const primary = primarySourceFor(jurisdiction);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sseEncode(event, data));
        } catch {
          // controller already closed
        }
      };

      const onUpdate = (source: SourceName, status: LiveStatus) => {
        emit("source_update", { source, status });
      };

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () =>
            reject(
              new Error(
                `Overall assessment timed out after ${OVERALL_TIMEOUT_MS / 1000}s`,
              ),
            ),
          OVERALL_TIMEOUT_MS,
        );
      });

      const pipeline = (async () => {
        const { rawData, statuses } = await runSources(
          sourceDefs,
          {
            companyName,
            registrationNumber: resolvedRegNumber,
            jurisdiction,
          },
          onUpdate,
        );

        // Fail loudly when the primary registry errors — otherwise the UI
        // would render a mostly-null "low risk" card, which is worse than
        // no card at all.
        if (primary && statuses[primary] !== "success") {
          throw new Error(
            `Primary registry (${primary}) unavailable — try again in a moment`,
          );
        }

        console.log(
          `[${new Date().toISOString()}] all sources done, calling LLM`,
        );
        const profile = await structure({
          jurisdiction,
          orderedSources,
          rawData,
          sourceStatuses: statuses as Record<string, SourceStatus>,
        });

        emit("complete", profile);
      })();

      try {
        await Promise.race([pipeline, timeout]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`[${new Date().toISOString()}] pipeline error:`, msg);
        emit("error", { message: msg });
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
