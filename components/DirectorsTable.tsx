"use client";

import { useState } from "react";
import type { DirectorRecord } from "@/lib/types";

interface Props {
  directors: DirectorRecord[];
}

function Row({ d, dimmed }: { d: DirectorRecord; dimmed?: boolean }) {
  const flagged = d.otherActiveAppointments > 5;
  return (
    <tr className={dimmed ? "opacity-60" : undefined}>
      <td className="px-3 py-2 font-medium text-slate-900">{d.name}</td>
      <td className="px-3 py-2 text-slate-700">{d.appointedDate ?? "—"}</td>
      <td className="px-3 py-2">
        {d.isActive ? (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
            Active
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            Resigned
          </span>
        )}
      </td>
      <td
        className={
          "px-3 py-2 font-mono " +
          (flagged ? "bg-amber-50 text-amber-900" : "text-slate-700")
        }
      >
        {d.otherActiveAppointments}
      </td>
    </tr>
  );
}

export default function DirectorsTable({ directors }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (directors.length === 0) {
    return <p className="text-sm text-slate-500">No directors reported.</p>;
  }

  const active: DirectorRecord[] = [];
  const resigned: DirectorRecord[] = [];
  const flagged: DirectorRecord[] = [];
  for (const d of directors) {
    if (d.isActive) {
      active.push(d);
      if (d.otherActiveAppointments > 5) flagged.push(d);
    } else {
      resigned.push(d);
    }
  }

  const summary = [
    `${active.length} active`,
    resigned.length > 0 ? `${resigned.length} resigned` : null,
    flagged.length > 0
      ? `${flagged.length} flagged (> 5 other appointments)`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{summary}</p>

      {flagged.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          {flagged.map((d, i) => (
            <li key={`${d.name}-${i}`} className="flex items-center gap-2">
              <span className="text-amber-700">⚠</span>
              <span className="font-medium text-amber-900">{d.name}</span>
              <span className="text-amber-800">
                — {d.otherActiveAppointments} other active appointments
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900"
      >
        {showAll
          ? "Hide full directors list ▴"
          : `Show all ${directors.length} directors ▾`}
      </button>

      {showAll && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Appointed</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Other active appointments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {active.map((d, i) => (
                <Row key={`active-${d.name}-${i}`} d={d} />
              ))}
              {resigned.map((d, i) => (
                <Row key={`resigned-${d.name}-${i}`} d={d} dimmed />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
