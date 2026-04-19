// Settled-regardless-of-success: a source whose dep failed still runs, so
// one broken source never stalls the pipeline.

import type { SourceName, SourceStatus } from "../types";
import type { SourceDef, SourceInput, SourceResultMap } from "./index";

export type LiveStatus = "loading" | "success" | "error";

export interface RunInput {
  companyName?: string;
  registrationNumber?: string;
  jurisdiction: string;
}

export interface RunResult {
  rawData: SourceResultMap;
  statuses: Record<SourceName, SourceStatus>;
}

export async function runSources(
  defs: SourceDef[],
  input: RunInput,
  onUpdate: (source: SourceName, status: LiveStatus) => void,
): Promise<RunResult> {
  const rawData: SourceResultMap = {};
  const statuses: Partial<Record<SourceName, SourceStatus>> = {};
  const remaining = new Map<SourceName, SourceDef>(defs.map((d) => [d.name, d]));

  const depSatisfied = (def: SourceDef): boolean =>
    !def.dependsOn || def.dependsOn.every((d) => statuses[d] !== undefined);

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter(depSatisfied);
    if (ready.length === 0) {
      // Cycle or a dep on a source outside this pipeline — fail remaining.
      for (const def of remaining.values()) {
        statuses[def.name] = "error";
        onUpdate(def.name, "error");
      }
      break;
    }

    for (const def of ready) onUpdate(def.name, "loading");

    await Promise.all(
      ready.map(async (def) => {
        try {
          const fetchInput: SourceInput = { ...input, prior: rawData };
          const result = await def.fetch(fetchInput);
          (rawData as Record<SourceName, unknown>)[def.name] = result ?? null;
          statuses[def.name] = "success";
          onUpdate(def.name, "success");
        } catch (e) {
          console.warn(`source ${def.name} failed`, e);
          (rawData as Record<SourceName, unknown>)[def.name] = null;
          statuses[def.name] = "error";
          onUpdate(def.name, "error");
        } finally {
          remaining.delete(def.name);
        }
      }),
    );
  }

  const finalStatuses = Object.fromEntries(
    defs.map((d) => [d.name, statuses[d.name] ?? "error"]),
  ) as Record<SourceName, SourceStatus>;

  return { rawData, statuses: finalStatuses };
}
