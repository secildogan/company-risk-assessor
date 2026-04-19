# Company Risk Assessor

A Next.js 16 (App Router) + TypeScript app that risk-assesses companies as
payment beneficiaries for a fintech product. It gathers public-registry data,
director appointments, adverse-media signals, and a brief business description
in parallel, streams progress to the UI via Server-Sent Events, and produces a
canonical `CompanyRiskProfile` whose **risk score is computed by a
deterministic scorer** (not the LLM), so the same structured input always
produces the same score.

No database — everything lives in memory for the duration of a request.

## Running locally

```bash
cp .env.local.example .env.local
# fill in OPENROUTER_API_KEY and COMPANIES_HOUSE_API_KEY
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Companies House API key

1. Sign in or register at <https://developer.company-information.service.gov.uk/>.
2. Open **Manage applications** → <https://developer.company-information.service.gov.uk/manage-applications>.
3. Click **Create an application**.
4. Fill in name and description, and under **Environment** select **Live**
   (⚠️ *not* Test/Sandbox — the Sandbox has only synthetic data and returns
   no results for real companies like Monzo).
5. Create the application, then click **Create new key** → **REST** → give it
   a name → copy the key value.
6. Paste it into `.env.local` as `COMPANIES_HOUSE_API_KEY=...`.

### OpenRouter API key

Get one at <https://openrouter.ai/keys>. The app uses
`anthropic/claude-sonnet-4.6` for structuring and `perplexity/sonar` for the
adverse-media search and the one-sentence business description.

## Running the tests

```bash
npm test
```

Five Vitest suites:

- `completeness.test.ts` — completeness-score scorer
- `resolver.test.ts` — search-to-matches mapping + ranking
- `runner.test.ts` — the dependency-aware source runner (parallel layers,
  settled-regardless-of-success unblocking, cycle / unsatisfiable-dep
  handling)
- `scorer.test.ts` — deterministic risk scorer (every severity tier + cap +
  the exact-date boundary cases + a same-input-same-output determinism check)
- `validator.test.ts` — LLM output structural validator

## How it works

```
┌────────────┐
│  SearchForm│  user enters name and/or regnum + jurisdiction
└─────┬──────┘
      │
      ▼
POST /api/assess                            ─── resolver.ts ───┐
  ├─ multiple matches? → JSON { candidates }                   │
  └─ unambiguous      → SSE stream ──────────────────────────┐ │

  companiesHouse runs first; directors / adverseMedia / businessDescription
  all fan out from it in parallel once it settles.

                  ┌────────────────┐
                  │ companiesHouse │
                  │ (CH REST API)  │
                  └───────┬────────┘
         ┌────────────────┼────────────────────────┐
         ▼                ▼                        ▼
  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐
  │ directors.ts   │ │ adverseMedia   │ │ businessDescription  │
  │ (fan-out per   │ │ (Perplexity)   │ │ (Perplexity)         │
  │  officer → CH) │ │                │ │                      │
  └───────┬────────┘ └────────┬───────┘ └─────────┬────────────┘
          └─────────────┬─────┴───────────────────┘
                        ▼
              ┌────────────────────┐
              │  llm/structurer.ts │  Claude Sonnet 4.6, max_tokens=4000,
              │   + validator.ts   │  validated, retried up to 2× on failure
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │   risk/scorer.ts   │  deterministic pure fn over structured fields
              └─────────┬──────────┘
                        ▼
              SSE "complete" → RiskProfileCard
```

### SSE events emitted by `/api/assess`

| Event | Payload |
|-------|---------|
| `source_update` | `{ source: SourceName, status: "loading" \| "success" \| "error" }` |
| `complete` | `CompanyRiskProfile` |
| `error` | `{ message: string }` |

`SourceName` is the union of all sources registered in `lib/sources/index.ts`
(`companiesHouse`, `directors`, `adverseMedia`, `businessDescription`,
`secEdgar`). The UI filters which appear per jurisdiction.

If the whole pipeline takes more than 45 seconds, the route emits an `error`
event and closes the stream. Individual sources have their own timeouts
(Companies House: 5s; OpenRouter: 25s; Perplexity: 8s per call).

The 10s product target is the aspiration for **typical** companies (small
director count, fast registry response). Large beneficiaries like Monzo — 24
directors means ~3–6s of parallel Companies House fan-out, plus two separate
Perplexity calls for adverse media and business description, plus an LLM
structuring step on a ~2.5k-token response — can legitimately exceed 20s
on cold paths. The ceiling sits well above that so outliers don't hard-fail.

### Parallelism

The pipeline runs sources in dependency layers. `directors`, `adverseMedia`,
and `businessDescription` all wait for `companiesHouse` — the two web
searches need the registry-canonical name, not whatever the user typed.
Without this dependency, a regnum-only request handed the bare digits to
Perplexity and returned different results than a name-based request for the
same entity. The 1-2s latency cost is the price of consistency.

The two web calls are deliberately separate (one directive "search for
adverse media …" prompt, one "describe this company" prompt) rather than a
single merged call: merging materially hurt findings recall, because the
search-tuned model anchored on the description as the primary deliverable
and under-fetched negative signals. Two round trips is the price of recall.

On GB the critical path is
`companiesHouse + max(directors, adverseMedia, businessDescription) + LLM structurer`.

### Failure modes

If the primary registry for the jurisdiction (Companies House for GB, SEC
EDGAR for US) returns an error, the route refuses to produce a profile and
emits an `error` SSE event with a clear message. This prevents the UI from
rendering a mostly-null "low risk" card when the authoritative source is
down.

### Disambiguation

If only a company name is given and the Companies House search returns more
than one match, the route replies with plain JSON
`{ kind: "candidates", matches: [...] }` instead of opening a stream. The UI
shows `CompanySelector`, the user picks one, and the app re-submits with the
chosen `registrationNumber`.

A common-name search (e.g. "Revolut") often returns a mix of the real
operating company, dissolved shells, and unrelated companies that happen to
share part of the name. `lib/resolver.ts` ranks matches before returning
them so the most likely candidate is at the top:

1. **Active companies before dissolved / liquidation / closed.**
2. **Exact title match before partial match** (case-insensitive).
3. **Older incorporations before newer ones** — established companies tend to
   be the primary entity; freshly-incorporated entries with a matching name
   are usually unrelated.
4. **Ties break on the order Companies House returned them.**

The `CompanySelector` UI reinforces these signals — coloured status badges,
company-type labels, dimmed cards for dissolved entries, and a short help
banner. Entering a registration number directly skips disambiguation entirely.

## Risk scoring

**Scoring is fully deterministic.** `lib/risk/scorer.ts` is a pure function:
given a structured `CompanyRiskProfile` and a wall-clock instant, it returns
a `riskScore`, a `riskLevel`, and a list of `RiskFactor` objects that fully
explain the score. The LLM is **not** involved in scoring — it is used only
to extract raw registry data into typed fields. The same structured input
run at the same instant always yields the same score, and every score can
be defended to a compliance team as the exact list of triggered rule IDs.

Extraction (the LLM layer) is **not** guaranteed deterministic — Claude at
`temperature: 0` is a sampling floor, not a lock, and Perplexity's web
search is inherently time-varying. The design puts the non-deterministic
work in extraction (where it's useful for normalising messy registry
payloads) and the deterministic work in scoring (where reproducibility
matters for audit).

The scoring rules map directly to the fintech scenario: **payments are
riskier if the beneficiary was established recently, has a limited history of
filing documents, has directors who are also directors of many other
companies, or is mentioned in adverse media.**

### Rules

Each rule has a fixed point value. Every rule is evaluated independently;
the score is the sum of triggered rules, capped at **95** (never 100 — there
is always residual uncertainty that warrants manual review).

**High-severity (30 points each)**

| Rule ID | Description |
|---|---|
| `DISSOLVED` | Company is dissolved or struck off |
| `VERY_NEW` | Company incorporated less than 6 months ago |
| `HIGH_SEVERITY_MEDIA` | Adverse media with high severity found |
| `NO_FILINGS` | No filing history despite being over 1 year old |

**Medium-severity (15 points each)**

| Rule ID | Description |
|---|---|
| `NEW_COMPANY` | Company incorporated 6–24 months ago |
| `FEW_FILINGS` | 1 or 2 filings on record |
| `STALE_ACCOUNTS` | Last accounts filed over 18 months ago |
| `DIRECTOR_OVERLOADED` | A director has more than 10 other active appointments |
| `MEDIUM_SEVERITY_MEDIA` | Adverse media with medium severity found |

**Low-severity (5 points each)**

| Rule ID | Description |
|---|---|
| `DIRECTOR_BUSY` | A director has 6–10 other active appointments |
| `YOUNG_COMPANY` | Company incorporated 24–36 months ago |
| `SOLE_DIRECTOR` | Only one active director |
| `HIGH_RISK_SIC` | SIC code in high-risk category (money services, gambling, holding) |

**Tiered rules are mutually exclusive.** The three age bands
(`VERY_NEW` / `NEW_COMPANY` / `YOUNG_COMPANY`), the two filing-history bands
(`NO_FILINGS` / `FEW_FILINGS`), and the two director-count bands
(`DIRECTOR_OVERLOADED` / `DIRECTOR_BUSY`) never stack on the same entity —
only the most specific band fires. So a 1-year-old company scores `+15`
(NEW_COMPANY), not `+20` (NEW_COMPANY + YOUNG_COMPANY).

**Risk level mapping**

```
riskScore >= 60   → "high"
riskScore >= 30   → "medium"
riskScore <  30   → "low"      (a pristine company scores 0 and is "low")
```

### Auditability

Every scored profile carries `riskFactors: Array<{ points, rule, reason }>`
where `rule` is one of the `RuleId` string-union values above. The UI renders
these as a scoring table whose points column sums to `riskScore`. Because
the rules live in code rather than in an LLM prompt:

- Changing a rule is a code change with a diff — not a prompt edit.
- Unit tests exercise every severity tier and the boundary cases
  (`tests/scorer.test.ts`).
- The scorer takes a `now: Date` parameter — two runs on the same company
  at the same instant always score identically. Age-band transitions only
  happen when the wall clock crosses a boundary, which is by design.
- A compliance reviewer can point at the exact `RiskRule` definition in
  `RISK_RULES` that caused any given flag.

## LLM guardrails

The structuring layer (`lib/llm/structurer.ts`) implements three guardrails to
make the LLM layer defensible in production:

1. **Token budget.** `max_tokens: 4000` is enforced on every OpenRouter call.
   If the completion approaches the cap (`> 3600` tokens), the structurer
   logs a warning so truncated responses are detectable post-hoc. The cap is
   sized for the largest real companies (Monzo's 24-director structured JSON
   is around 2.5k tokens); a smaller cap caused mid-string truncation for
   those companies and unrecoverable parse errors across all retries.
2. **Retry with corrective prompting.** On a JSON parse failure the structurer
   appends an assistant/user turn with the exact parser error verbatim and
   retries; on a validation failure it appends the specific missing/invalid
   field names and retries. The conversation history is preserved across
   retries so the model has context on what went wrong, but the echoed
   assistant response is truncated to the first 500 characters so three
   failed attempts don't balloon the input by 12k+ tokens. Maximum 3 attempts
   (1 + 2 retries).
3. **Output validation.** `lib/llm/validator.ts` provides a pure
   `validateProfile(data)` that checks the 11 LLM-owned fields of
   `CompanyRiskProfile` (`resolvedName`, `registrationNumber`, `jurisdiction`,
   `registeredAddress`, `incorporationDate`, `companyStatus`, `sicCodes`,
   `filingCount`, `lastAccountsDate`, `directors`, `adverseMediaFindings`)
   are present and that the three array fields are actually arrays. The
   `LLM_OWNED_FIELDS` list is typed as `Array<keyof CompanyRiskProfile>` so
   field renames break the build. Meta fields (`completenessScore`,
   `dataTimestamp`, `promptVersion`, `sourceStatuses`, `businessDescription`,
   `guardrails`, `riskScore`/`riskLevel`/`riskFactors`) are not validated
   because they are always injected by the structurer/scorer after parsing,
   so validating them would be a no-op. Validation runs on the raw parsed
   JSON *before* meta injection; a failure triggers the corrective retry
   path above.

If all attempts fail, the structurer throws a typed `StructurerError` with
`{ attempts, lastResponse, lastError }` for debugging.

Every successful profile carries a `guardrails` field:

```ts
guardrails: {
  tokenBudgetUsed: number      // completion tokens summed across attempts
  attemptCount: number         // 1 = first try, 2-3 = needed retries
  validationPassed: boolean
  trace?: {                    // only when LLM_TRACE=1
    systemPrompt: string
    userPrompt: string
    attempts: Array<{ attempt: number; content: string; error: string | null }>
  }
}
```

The UI renders the first three fields under a collapsible "LLM diagnostics"
section at the bottom of the risk card. Set `LLM_TRACE=1` in the environment
to also capture the full prompt and per-attempt response text for offline
replay and prompt-version debugging — useful when diagnosing extraction
regressions without re-running against live APIs.

## Prompt versioning

`PROMPT_VERSION` is a module-level constant in `lib/llm/structurer.ts`
(currently `v4`) and is baked into every `CompanyRiskProfile`. Since scoring
moved out of the LLM, this now tracks the **extraction prompt** specifically —
useful for catching regressions in how the LLM structures messy registry data,
separate from scoring quality.

In production you'd:

1. Log `(companyNumber, promptVersion, riskScore, riskLevel, guardrails)` to a
   warehouse on every assessment.
2. Sample a slice for manual review and score extraction quality 1–5.
3. When changing the prompt, bump the version, let both run for a period, and
   compare accuracy-vs-cost between versions.
4. Promote the new prompt once it wins on the metric you care about.

## Design decisions and trade-offs

- **SSE, not WebSockets.** The backend only pushes to the client, no reverse
  channel is needed, and SSE is a plain HTTP stream that requires no extra
  infra.
- **Deterministic scoring, LLM structuring.** The LLM normalises messy
  registry data into typed fields; `risk/scorer.ts` then scores the typed
  result with fixed rules. This bounds LLM influence to extraction (where it
  adds value) and keeps scoring reproducible and auditable.
- **Source registry + dep-aware runner.** Adding a source or a jurisdiction is
  a registry edit, not an orchestration change (see "Extending the system").
- **businessDescription is injected post-hoc.** The LLM isn't asked to parrot
  it back — the structurer merges it from `rawData` directly. Saves tokens
  every request.
- **Adverse media & business description fall back to null/empty.** If
  `OPENROUTER_API_KEY` is missing or the search model errors, those sources
  return empty results so the rest of the pipeline still produces a profile.
  Set `ADVERSE_MEDIA_MOCK_FINDINGS=1` to surface a single mock finding for UI
  demos.
- **No database.** Stateless per-request. Good for a demo, bad for
  auditability — see "What I'd do differently".

## Scaling to 1,000 queries/minute

The current design is tuned for correctness and auditability, not throughput.
At ~17 qps the following would need to change:

- **Cache profiles.** Key `(registrationNumber, promptVersion)` in Redis with
  a short TTL (15–60 min). Real traffic concentrates on a small set of
  beneficiaries, so a warm cache removes the LLM call and the registry
  round-trip from the hot path. Stale-while-revalidate keeps p99 low while a
  background refresh happens.
- **Move orchestration off the Next.js request.** Accept the request, enqueue
  a job, run sources + structurer on a worker pool (BullMQ / Temporal / Cloud
  Tasks). The HTTP handler becomes a thin submit-and-subscribe surface; the
  SSE stream subscribes to job events. Workers scale independently of the web
  tier.
- **Batch / share LLM calls.** At Sonnet 4.6 prices, 17 structurer calls per
  second is a non-trivial bill. Use Anthropic prompt caching to reuse the
  fixed system prompt + schema across requests (the variable payload is
  small), and batch adverseMedia / businessDescription by
  `(companyName, jurisdiction)` since many queries hit the same names.
- **Rotate registry keys.** Companies House is ~600 req / 5 min per
  application key. Each assessment uses 1 + N calls (profile + N
  director-appointments). Under load we'd need a keyring and an in-process
  limiter in front of `chFetch`.
- **Backpressure and shed load.** A bounded queue with a `503 Retry-After`
  when workers are saturated is better than a hung 45-second request. Emit a
  dedicated SSE event so the UI degrades gracefully instead of timing out.
- **Structured telemetry.** Correlation IDs on every log line, per-source
  latency histograms, LLM retry rate, and cache hit ratio — you can't tune
  what you can't measure.

What *wouldn't* change: the source registry, the deterministic scorer, the
SSE event shape, and the `CompanyRiskProfile` contract. The architecture
splits cleanly at the runner boundary — everything above it is horizontally
scalable.

## What I'd do differently with more time

- **Persistence.** Write the final profile (plus guardrails and a snapshot of
  the raw source payloads) to Postgres keyed by `(registrationNumber,
  dataTimestamp, promptVersion)` — an audit trail + a cheap recent-result cache.
- **Start the LLM before web signals finish.** `businessDescription` is
  injected post-hoc and `adverseMediaFindings` could be spliced in after the
  structurer returns. Kicking off the structurer as soon as
  `companiesHouse` + `directors` settle would cut 3–5s off the critical
  path on typical requests.
- **Director network graph.** Cache the appointments graph so we can flag
  directors connected to previously-flagged companies, not just high-count
  ones.
- **Per-source AbortController.** On overall timeout or client disconnect,
  cancel in-flight fetches instead of letting them run to completion.
- **Structured evals.** A labelled set of known-safe / known-risky companies
  run on every prompt-version change, producing a scorecard.
- **Accessibility pass.** Keyboard navigation, full ARIA roles,
  colour-blind-safe risk badges.

## Extending the system

### Adding a new data source

Sources are declared in `lib/sources/index.ts` and discovered by the API route
from there — the route itself has no hard-coded source list.

1. Create `lib/sources/sanctionsList.ts` with a fetch function that returns
   your own typed payload (add the type to `lib/types.ts`).
2. In `lib/sources/index.ts`, add a `SourceDef` entry to the registry:

   ```ts
   const sanctionsSource: SourceDef = {
     name: "sanctionsList",
     label: "Sanctions list check",
     dependsOn: ["companiesHouse"],            // optional
     fetch: async (input) => fetchSanctions(input),
   };

   const REGISTRY: Record<SourceName, SourceDef> = {
     ...,
     sanctionsList: sanctionsSource,
   };
   ```

3. Add `"sanctionsList"` to the `SourceName` union in `lib/types.ts` and a
   matching entry in `SOURCE_LABELS` in `lib/sources/config.ts`.
4. Add it to the jurisdictions that should run it in
   `SOURCES_BY_JURISDICTION` in `lib/sources/config.ts` (this is the single
   source of truth — both the server registry and the client status panel
   read from it).
5. If the LLM should see the raw data (for extraction context), add an entry
   to `SOURCE_HEADINGS` in `lib/llm/structurer.ts` and the `SourceResultMap`
   type in `lib/sources/index.ts`. If the data is injected post-hoc (like
   `businessDescription`), skip this step to save prompt tokens.
6. If the source should influence risk, add a `RiskRule` to `RISK_RULES` in
   `lib/risk/scorer.ts` (and a unit test in `tests/scorer.test.ts`).

The API route's dependency runner automatically respects `dependsOn`, so no
orchestration changes are needed.

### Adding a new jurisdiction

Sources are jurisdiction-agnostic — jurisdictions just select which sources
apply.

1. Implement or stub the jurisdiction's primary source(s) under
   `lib/sources/` (e.g. `bundesanzeiger.ts` for DE) and register each via a
   `SourceDef` in `lib/sources/index.ts`.
2. Add the jurisdiction to `SOURCES_BY_JURISDICTION` in
   `lib/sources/config.ts` (the client-safe single source of truth that
   both the server registry and the client status panel consume):

   ```ts
   export const SOURCES_BY_JURISDICTION: Record<string, SourceName[]> = {
     GB: ["companiesHouse", "directors", "adverseMedia", "businessDescription"],
     US: ["secEdgar", "adverseMedia", "businessDescription"],
     DE: ["bundesanzeiger", "adverseMedia", "businessDescription"],   // new
     DEFAULT: ["adverseMedia", "businessDescription"],
   };
   ```

3. If the primary registry should block profile generation on failure for
   this jurisdiction (the silent-failure guard), extend `primarySourceFor`
   in `lib/sources/config.ts` to map the new code to its primary source.
4. Extend `canonicalFrom` in `lib/sources/index.ts` to read the canonical
   `companyName` / `registrationNumber` from the new registry's payload,
   and add the new primary's name to the `dependsOn` array on
   `adverseMediaSource` and `businessDescriptionSource`. Without this, the
   web searches for this jurisdiction will run against whatever the user
   typed instead of the registry-canonical name.
5. Add `{ value: "DE", label: "Germany (DE)" }` to `JURISDICTION_OPTIONS` in
   `components/SearchForm.tsx`.
6. If the jurisdiction supports name-based disambiguation, extend
   `lib/resolver.ts`; otherwise it just passes the user's input through.

Everything else — SSE events, progressive UI, LLM guardrails, scoring,
completeness — works unchanged.

Currently shipped:

| Jurisdiction | Sources | Notes |
|---|---|---|
| GB | Companies House, directors, adverse media, business description | Live data |
| US | SEC EDGAR (stubbed), adverse media, business description | Stubbed — see `lib/sources/secEdgar.ts` header for the real-implementation sketch |

## Example: Nimbus Bank Limited (fictional)

Request:

```bash
curl -N -H 'Content-Type: application/json' \
  -d '{"companyName":"Nimbus Bank Limited","registrationNumber":"12345678","jurisdiction":"GB"}' \
  http://localhost:3000/api/assess
```

Streamed events (abbreviated):

```
event: source_update
data: {"source":"companiesHouse","status":"loading"}

event: source_update
data: {"source":"companiesHouse","status":"success"}

event: source_update
data: {"source":"directors","status":"loading"}

event: source_update
data: {"source":"adverseMedia","status":"loading"}

event: source_update
data: {"source":"businessDescription","status":"loading"}

event: source_update
data: {"source":"directors","status":"success"}

event: source_update
data: {"source":"adverseMedia","status":"success"}

event: source_update
data: {"source":"businessDescription","status":"success"}

event: complete
data: {
  "resolvedName": "NIMBUS BANK LIMITED",
  "registrationNumber": "12345678",
  "jurisdiction": "GB",
  "registeredAddress": "100 Example Street, London, EX1 2MP",
  "incorporationDate": "2018-05-10",
  "companyStatus": "active",
  "sicCodes": ["64190"],
  "filingCount": 120,
  "lastAccountsDate": "2024-12-31",
  "businessDescription": "A UK digital bank providing retail and business banking services.",
  "directors": [
    {
      "name": "DOE, Jane Alex",
      "appointedDate": "2020-05-05",
      "isActive": true,
      "otherActiveAppointments": 2
    },
    {
      "name": "SMITH, Jordan Taylor",
      "appointedDate": "2021-06-21",
      "isActive": true,
      "otherActiveAppointments": 1
    }
    // …22 more directors
  ],
  "adverseMediaFindings": [],
  "riskScore": 0,
  "riskLevel": "low",
  "riskFactors": [],
  "completenessScore": 100,
  "dataTimestamp": "2026-04-18T15:00:00.000Z",
  "promptVersion": "v4",
  "sourceStatuses": {
    "companiesHouse": "success",
    "directors": "success",
    "adverseMedia": "success",
    "businessDescription": "success"
  },
  "guardrails": {
    "tokenBudgetUsed": 420,
    "attemptCount": 1,
    "validationPassed": true
  }
}
```

## File layout

```
company-risk-assessor/
├── app/
│   ├── api/assess/route.ts       SSE endpoint + dep-aware source runner
│   ├── page.tsx                  main UI state machine
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── SearchForm.tsx
│   ├── CompanySelector.tsx       disambiguation UI
│   ├── SourceStatusPanel.tsx     progressive loading
│   ├── RiskProfileCard.tsx       scoring breakdown + diagnostics
│   └── DirectorsTable.tsx        summary + flagged + disclosure
├── lib/
│   ├── sources/
│   │   ├── index.ts              registry + canonical-name helper
│   │   ├── companiesHouseClient.ts   shared HTTP client (Basic auth)
│   │   ├── companiesHouse.ts
│   │   ├── directors.ts
│   │   ├── adverseMedia.ts
│   │   ├── businessDescription.ts
│   │   └── secEdgar.ts           US stub
│   ├── llm/
│   │   ├── openRouter.ts         shared OpenRouter helper
│   │   ├── structurer.ts         LLM extraction + guardrails
│   │   └── validator.ts          output structural validator
│   ├── risk/scorer.ts            deterministic risk scorer
│   ├── resolver.ts
│   ├── sicCodes.ts               UK SIC 2007 decoder
│   └── types.ts
├── tests/
│   ├── completeness.test.ts
│   ├── resolver.test.ts
│   ├── runner.test.ts
│   ├── scorer.test.ts
│   └── validator.test.ts
├── .env.local.example
└── package.json
```
