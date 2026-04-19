"use client";

import { useState } from "react";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import CompanySelector from "@/components/CompanySelector";
import SourceStatusPanel, {
  type LiveStatus,
  type SourceRow,
  type UiStatus,
} from "@/components/SourceStatusPanel";
import RiskProfileCard from "@/components/RiskProfileCard";
import {
  SOURCE_LABELS,
  sourceNamesForJurisdiction,
} from "@/lib/sources/config";
import type { CompanyMatch, CompanyRiskProfile, SourceName } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "resolving"; jurisdiction: string }
  | { kind: "choosing"; matches: CompanyMatch[]; pending: SearchFormValues }
  | {
      kind: "running";
      jurisdiction: string;
      statuses: Partial<Record<SourceName, UiStatus>>;
    }
  | {
      kind: "done";
      jurisdiction: string;
      profile: CompanyRiskProfile;
      statuses: Partial<Record<SourceName, UiStatus>>;
    }
  | { kind: "error"; message: string };

function sourcesFor(jurisdiction: string): SourceRow[] {
  return sourceNamesForJurisdiction(jurisdiction).map((name) => ({
    name,
    label: SOURCE_LABELS[name],
  }));
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const currentJurisdiction =
    phase.kind === "resolving" || phase.kind === "running" || phase.kind === "done"
      ? phase.jurisdiction
      : "GB";

  async function run(values: SearchFormValues) {
    setPhase({ kind: "resolving", jurisdiction: values.jurisdiction });
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const ct = res.headers.get("content-type") ?? "";

      if (ct.includes("application/json")) {
        const data = (await res.json()) as
          | { kind: "candidates"; matches: CompanyMatch[] }
          | { error: string };
        if ("error" in data) {
          setPhase({ kind: "error", message: data.error });
          return;
        }
        setPhase({ kind: "choosing", matches: data.matches, pending: values });
        return;
      }

      if (!ct.includes("text/event-stream")) {
        setPhase({ kind: "error", message: `Unexpected response type: ${ct}` });
        return;
      }

      await consumeStream(res, values.jurisdiction);
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  async function consumeStream(res: Response, jurisdiction: string) {
    const reader = res.body?.getReader();
    if (!reader) {
      setPhase({ kind: "error", message: "No response body" });
      return;
    }
    const statuses: Partial<Record<SourceName, UiStatus>> = {};
    setPhase({ kind: "running", jurisdiction, statuses: { ...statuses } });

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let blankIdx = buffer.indexOf("\n\n");
        while (blankIdx !== -1) {
          const raw = buffer.slice(0, blankIdx);
          buffer = buffer.slice(blankIdx + 2);
          blankIdx = buffer.indexOf("\n\n");

          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }

          if (eventName === "source_update") {
            const { source, status } = parsed as {
              source: SourceName;
              status: LiveStatus;
            };
            if (statuses[source] === status) continue;
            statuses[source] = status;
            setPhase({ kind: "running", jurisdiction, statuses: { ...statuses } });
          } else if (eventName === "complete") {
            const profile = parsed as CompanyRiskProfile;
            setPhase({
              kind: "done",
              jurisdiction,
              profile,
              statuses: { ...statuses },
            });
          } else if (eventName === "error") {
            const { message } = parsed as { message: string };
            setPhase({ kind: "error", message });
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }
  }

  const running = phase.kind === "running" || phase.kind === "resolving";
  const sources = sourcesFor(currentJurisdiction);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Company Risk Assessor</h1>
        <p className="text-sm text-slate-600">
          Assess a company as a payment beneficiary. Pulls registry filings,
          directors / officer history, and adverse-media signals in parallel,
          then scores the result with an LLM.
        </p>
      </header>

      {phase.kind !== "choosing" && (
        <SearchForm onSubmit={run} disabled={running} />
      )}

      {phase.kind === "choosing" && (
        <CompanySelector
          matches={phase.matches}
          onCancel={() => setPhase({ kind: "idle" })}
          onPick={(m) =>
            run({
              companyName: phase.pending.companyName,
              registrationNumber: m.companyNumber,
              jurisdiction: phase.pending.jurisdiction,
            })
          }
        />
      )}

      {phase.kind === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Something went wrong:</strong> {phase.message}
        </div>
      )}

      {phase.kind === "resolving" && (
        <SourceStatusPanel sources={sources} statuses={{}} done={false} />
      )}

      {(phase.kind === "running" || phase.kind === "done") && (
        <SourceStatusPanel
          sources={sources}
          statuses={phase.statuses}
          done={phase.kind === "done"}
        />
      )}

      {phase.kind === "done" && <RiskProfileCard profile={phase.profile} />}
    </main>
  );
}
