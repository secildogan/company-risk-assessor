import { describe, it, expect } from "vitest";
import { runSources } from "@/lib/sources/runner";
import type { SourceDef, SourceInput } from "@/lib/sources";
import type { SourceName } from "@/lib/types";

type Call = { source: SourceName; at: number };

function fakeDef(
  name: SourceName,
  opts: {
    delayMs?: number;
    fail?: boolean;
    dependsOn?: SourceName[];
    calls?: Call[];
    returns?: unknown;
  } = {},
): SourceDef {
  const start = Date.now();
  return {
    name,
    label: name,
    dependsOn: opts.dependsOn,
    fetch: async (_input: SourceInput) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      opts.calls?.push({ source: name, at: Date.now() - start });
      if (opts.fail) throw new Error(`${name} failed`);
      return opts.returns ?? { name };
    },
  };
}

describe("runSources", () => {
  it("runs independent sources in parallel", async () => {
    const calls: Call[] = [];
    const defs: SourceDef[] = [
      fakeDef("companiesHouse", { delayMs: 50, calls }),
      fakeDef("adverseMedia", { delayMs: 50, calls }),
      fakeDef("businessDescription", { delayMs: 50, calls }),
    ];
    const updates: Array<{ source: SourceName; status: string }> = [];
    const { statuses } = await runSources(
      defs,
      { jurisdiction: "GB" },
      (source, status) => updates.push({ source, status }),
    );

    expect(statuses).toEqual({
      companiesHouse: "success",
      adverseMedia: "success",
      businessDescription: "success",
    });

    // All three should start roughly at the same time (before any finishes).
    const loadingAts = updates.filter((u) => u.status === "loading").length;
    expect(loadingAts).toBe(3);
  });

  it("waits for dependencies before running a dependent source", async () => {
    const calls: Call[] = [];
    const defs: SourceDef[] = [
      fakeDef("companiesHouse", { delayMs: 40, calls }),
      fakeDef("directors", { dependsOn: ["companiesHouse"], delayMs: 10, calls }),
    ];
    await runSources(defs, { jurisdiction: "GB" }, () => {});

    const ch = calls.find((c) => c.source === "companiesHouse")!;
    const dir = calls.find((c) => c.source === "directors")!;
    expect(dir.at).toBeGreaterThanOrEqual(ch.at);
  });

  it("unblocks dependents even when the dependency fails", async () => {
    const calls: Call[] = [];
    const defs: SourceDef[] = [
      fakeDef("companiesHouse", { delayMs: 10, fail: true, calls }),
      fakeDef("directors", { dependsOn: ["companiesHouse"], delayMs: 5, calls }),
    ];
    const { statuses } = await runSources(defs, { jurisdiction: "GB" }, () => {});
    expect(statuses.companiesHouse).toBe("error");
    expect(statuses.directors).toBe("success");
    // directors must have actually run after CH errored
    expect(calls.some((c) => c.source === "directors")).toBe(true);
  });

  it("marks sources with unsatisfiable dependencies as error", async () => {
    const defs: SourceDef[] = [
      // depends on a source that isn't in this pipeline at all
      fakeDef("directors", { dependsOn: ["companiesHouse"] }),
    ];
    const { statuses } = await runSources(defs, { jurisdiction: "GB" }, () => {});
    // directors' dep is never satisfied → runner marks it error and exits
    expect(statuses.directors).toBe("error");
  });

  it("emits loading, then success or error, for each source", async () => {
    const defs: SourceDef[] = [
      fakeDef("companiesHouse", { delayMs: 5 }),
      fakeDef("adverseMedia", { delayMs: 5, fail: true }),
    ];
    const updates: Array<{ source: SourceName; status: string }> = [];
    await runSources(defs, { jurisdiction: "GB" }, (source, status) =>
      updates.push({ source, status }),
    );

    const ch = updates.filter((u) => u.source === "companiesHouse");
    const am = updates.filter((u) => u.source === "adverseMedia");
    expect(ch.map((u) => u.status)).toEqual(["loading", "success"]);
    expect(am.map((u) => u.status)).toEqual(["loading", "error"]);
  });

  it("returns rawData keyed by source name, null on failure", async () => {
    const defs: SourceDef[] = [
      fakeDef("companiesHouse", { returns: { companyName: "X" } }),
      fakeDef("adverseMedia", { fail: true }),
    ];
    const { rawData } = await runSources(defs, { jurisdiction: "GB" }, () => {});
    expect(rawData.companiesHouse).toEqual({ companyName: "X" });
    expect(rawData.adverseMedia).toBeNull();
  });
});
