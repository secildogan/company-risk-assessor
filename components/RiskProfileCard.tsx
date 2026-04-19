"use client";

import { useState } from "react";
import type { CompanyRiskProfile, RiskLevel, Severity } from "@/lib/types";
import { sicLabelOrNull } from "@/lib/sicCodes";
import { MAX_ATTEMPTS, MAX_TOKENS } from "@/lib/llm/structurer";
import DirectorsTable from "./DirectorsTable";

interface Props {
  profile: CompanyRiskProfile;
}

const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-green-100 text-green-900 border-green-300",
  medium: "bg-amber-100 text-amber-900 border-amber-300",
  high: "bg-red-100 text-red-900 border-red-300",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export default function RiskProfileCard({ profile }: Props) {
  const [showAdverse, setShowAdverse] = useState(true);

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start gap-6">
        <div
          className={`flex-shrink-0 rounded-lg border px-6 py-4 text-center ${
            RISK_STYLES[profile.riskLevel] ?? RISK_STYLES.medium
          }`}
        >
          <div className="text-xs uppercase tracking-wider">Risk level</div>
          <div className="mt-1 text-3xl font-bold">{profile.riskLevel.toUpperCase()}</div>
          <div className="mt-2 text-sm">Score: {profile.riskScore} / 100</div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-slate-900">
            {profile.resolvedName ?? "Unknown company"}
          </h2>
          {profile.businessDescription && (
            <p className="mt-1 text-sm italic text-slate-600">
              {profile.businessDescription}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Reg number: </dt>
              <dd className="inline font-mono">{profile.registrationNumber ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Jurisdiction: </dt>
              <dd className="inline">{profile.jurisdiction}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Incorporated: </dt>
              <dd className="inline">{profile.incorporationDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Status: </dt>
              <dd className="inline">{profile.companyStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Filings: </dt>
              <dd className="inline">{profile.filingCount ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Last accounts: </dt>
              <dd className="inline">{profile.lastAccountsDate ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-medium">Address: </dt>
              <dd className="inline">{profile.registeredAddress ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="block font-medium">SIC codes:</dt>
              <dd className="mt-1">
                {profile.sicCodes.length === 0 ? (
                  <span className="text-slate-500">—</span>
                ) : (
                  <ul className="space-y-0.5">
                    {profile.sicCodes.map((code) => {
                      const label = sicLabelOrNull(code);
                      return (
                        <li key={code} className="text-slate-700">
                          <span className="font-mono text-xs text-slate-500">{code}</span>
                          {label && <span className="ml-2">— {label}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Scoring breakdown
        </h3>
        {profile.riskFactors.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No risk factors triggered. Baseline score 0.
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-16 px-3 py-2 text-right">Points</th>
                  <th className="w-36 px-3 py-2">Rule</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {profile.riskFactors.map((f, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                      +{f.points}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {f.rule}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{f.reason}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-sm">
                <tr>
                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                    = {profile.riskScore}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500" colSpan={2}>
                    Total
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Directors
        </h3>
        <div className="mt-2">
          <DirectorsTable directors={profile.directors} />
        </div>
      </section>

      <section>
        <button
          type="button"
          onClick={() => setShowAdverse((s) => !s)}
          className="flex w-full cursor-pointer items-center justify-between text-sm font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900"
        >
          <span>Adverse media ({profile.adverseMediaFindings.length})</span>
          <span>{showAdverse ? "▲" : "▼"}</span>
        </button>
        {showAdverse && (
          <div className="mt-2">
            {profile.adverseMediaFindings.length === 0 ? (
              <p className="text-sm text-slate-500">No adverse media findings.</p>
            ) : (
              <ul className="space-y-2">
                {profile.adverseMediaFindings.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md border border-slate-200 p-3"
                  >
                    <span
                      className={`inline-flex w-16 flex-shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                        SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.low
                      }`}
                    >
                      {f.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{f.summary}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{f.source}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <details className="group border-t border-slate-200 pt-4 text-xs text-slate-500">
        <summary className="cursor-pointer select-none font-medium hover:text-slate-700">
          LLM diagnostics
        </summary>
        <dl className="mt-2 grid grid-cols-3 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">
              Attempts
            </dt>
            <dd className="mt-0.5 font-mono text-sm text-slate-800">
              {profile.guardrails.attemptCount} / {MAX_ATTEMPTS}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">
              Output tokens
            </dt>
            <dd className="mt-0.5 font-mono text-sm text-slate-800">
              {profile.guardrails.tokenBudgetUsed} / {MAX_TOKENS}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">
              Validation
            </dt>
            <dd className="mt-0.5 text-sm">
              {profile.guardrails.validationPassed ? (
                <span className="font-medium text-green-700">passed</span>
              ) : (
                <span className="font-medium text-red-700">failed</span>
              )}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
