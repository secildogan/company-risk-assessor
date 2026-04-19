"use client";

import type { SourceName } from "@/lib/types";

export type LiveStatus = "loading" | "success" | "error";
export type UiStatus = "idle" | LiveStatus;

export interface SourceRow {
  name: SourceName;
  label: string;
}

interface Props {
  sources: SourceRow[];
  statuses: Partial<Record<SourceName, UiStatus>>;
  done: boolean;
}

function Icon({ status }: { status: UiStatus }) {
  if (status === "loading") {
    return (
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
        aria-label="loading"
      />
    );
  }
  if (status === "success") return <span className="text-green-600">✓</span>;
  if (status === "error") return <span className="text-red-600">✗</span>;
  return <span className="text-slate-300">•</span>;
}

export default function SourceStatusPanel({ sources, statuses, done }: Props) {
  const status = (s: SourceName): UiStatus => statuses[s] ?? "idle";
  const completed = sources.filter(
    (s) => status(s.name) === "success" || status(s.name) === "error",
  ).length;
  const total = sources.length;
  const allSettled = total > 0 && completed === total;

  const headerText = done
    ? "Analysis complete"
    : allSettled
      ? "Generating report…"
      : "Gathering intelligence…";

  const counterText = done
    ? `${total} of ${total} sources`
    : allSettled
      ? "Scoring & structuring"
      : `${completed} of ${total} sources`;

  return (
    <div
      className={
        "rounded-lg border bg-white p-6 shadow-sm " +
        (done ? "border-green-200" : "border-blue-200 ring-1 ring-blue-100")
      }
      aria-live="polite"
      aria-busy={!done}
    >
      <div className="flex items-center gap-3">
        {!done && (
          <span
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
            aria-hidden="true"
          />
        )}
        {done && (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
            aria-hidden="true"
          >
            ✓
          </span>
        )}
        <h2 className="text-lg font-semibold text-slate-900">{headerText}</h2>
        <span className="ml-auto text-xs font-medium text-slate-500">
          {counterText}
        </span>
      </div>

      {!done && total > 0 && (
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
        >
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {sources.map((s) => (
          <li key={s.name} className="flex items-center gap-3 text-sm">
            <span className="w-5 text-center">
              <Icon status={status(s.name)} />
            </span>
            <span className="text-slate-800">{s.label}</span>
            <span className="ml-auto text-xs text-slate-500">
              {status(s.name) === "loading" && "running…"}
              {status(s.name) === "success" && "done"}
              {status(s.name) === "error" && "failed"}
              {status(s.name) === "idle" && "pending"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
