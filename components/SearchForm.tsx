"use client";

import { useState } from "react";

export interface SearchFormValues {
  companyName: string;
  registrationNumber: string;
  jurisdiction: string;
}

interface Props {
  onSubmit: (v: SearchFormValues) => void;
  disabled?: boolean;
}

const JURISDICTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "US", label: "United States (US)" },
];

export default function SearchForm({ onSubmit, disabled }: Props) {
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [jurisdiction, setJurisdiction] = useState("GB");

  const hasInput =
    companyName.trim().length > 0 || registrationNumber.trim().length > 0;
  const canSubmit = !disabled && hasInput;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ companyName, registrationNumber, jurisdiction });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Assess a company</h2>
        <p className="text-xs text-slate-500">
          Provide a company name, a registration number, or both. Entering a
          registration number skips disambiguation.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Company name <span className="text-slate-400">(optional)</span>
          </span>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Trading Ltd"
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Registration number <span className="text-slate-400">(optional)</span>
          </span>
          <input
            type="text"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="e.g. 09446231"
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Jurisdiction
          </span>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            {JURISDICTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {jurisdiction === "US" && (
            <p className="mt-1 text-xs text-amber-700">
              US uses a stubbed SEC EDGAR source (mock data) — see README.
            </p>
          )}
        </label>
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled && (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
        )}
        {disabled ? "Assessing…" : "Run assessment"}
      </button>
    </form>
  );
}
