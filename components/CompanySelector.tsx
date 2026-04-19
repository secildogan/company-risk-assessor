"use client";

import type { CompanyMatch } from "@/lib/types";

interface Props {
  matches: CompanyMatch[];
  onPick: (m: CompanyMatch) => void;
  onCancel: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  ltd: "Private limited company",
  plc: "Public limited company",
  llp: "Limited liability partnership",
  "private-unlimited": "Private unlimited",
  "private-unlimited-nsc": "Private unlimited (no share capital)",
  "private-limited-guarant-nsc": "Private company limited by guarantee",
  "private-limited-guarant-nsc-limited-exemption": "Private company limited by guarantee",
  "limited-partnership": "Limited partnership",
  "royal-charter": "Royal charter",
  "charitable-incorporated-organisation": "Charitable incorporated organisation",
  "community-interest-company": "Community interest company",
  "oversea-company": "Overseas company",
  "uk-establishment": "UK establishment of overseas company",
  "eeig": "European Economic Interest Grouping",
};

function prettyType(type: string | null): string | null {
  if (!type) return null;
  return TYPE_LABELS[type] ?? type.replace(/-/g, " ");
}

function statusBadge(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "active") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Active
      </span>
    );
  }
  if (s === "dissolved") {
    return (
      <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
        Dissolved
      </span>
    );
  }
  if (s) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        {s}
      </span>
    );
  }
  return null;
}

export default function CompanySelector({ matches, onPick, onCancel }: Props) {
  const activeCount = matches.filter(
    (m) => (m.companyStatus ?? "").toLowerCase() === "active",
  ).length;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Multiple matches found</h2>
          <p className="text-sm text-slate-600">
            We found {matches.length} companies matching your search
            {activeCount > 0 && ` (${activeCount} active)`}. Pick the correct one to continue.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <strong>How to pick:</strong> Operating companies are{" "}
        <span className="font-medium">Active</span>; dissolved entries are old shells.
        The company type (e.g. <span className="font-mono">plc</span> for a listed firm)
        and the registered address are strong signals. If you know the registration
        number, go back and enter it directly.
      </div>

      <ul className="space-y-2">
        {matches.map((m) => {
          const dissolved = (m.companyStatus ?? "").toLowerCase() === "dissolved";
          const typeLabel = prettyType(m.companyType);
          return (
            <li key={m.companyNumber}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className={
                  "w-full cursor-pointer rounded-md border p-4 text-left transition " +
                  (dissolved
                    ? "border-slate-200 bg-slate-50 opacity-70 hover:opacity-100 hover:border-slate-400"
                    : "border-slate-200 hover:border-slate-400 hover:bg-slate-50")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{m.title}</span>
                  {statusBadge(m.companyStatus)}
                  {typeLabel && (
                    <span className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700">
                      {typeLabel}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-slate-500">
                    {m.companyNumber}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600">{m.address ?? "—"}</div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  {m.incorporationDate && (
                    <span>Incorporated: {m.incorporationDate}</span>
                  )}
                  {m.cessationDate && <span>Dissolved: {m.cessationDate}</span>}
                  {m.description && !m.cessationDate && (
                    <span className="text-slate-400">{m.description}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
