# Architecture

## Context

This repository is the engine. It was created empty, so the app lives at the repository
root with no wrapper directory and no other tooling to accommodate.

## Layering

```
             ┌──────────────────────────────────────────┐
  UI         │ Next.js App Router (server components +   │
             │ small client islands) + API routes        │
             └───────────────┬──────────────────────────┘
                             │
             ┌───────────────▼──────────────────────────┐
  Pipeline   │ 12 steps · runner · dispatch              │
             └───────┬───────────────────────┬──────────┘
                     │                       │
        ┌────────────▼─────────┐   ┌─────────▼───────────┐
  Ports │ DataStore            │   │ Providers            │
        │ memory │ supabase    │   │ scraper/search/      │
        └──────────────────────┘   │ pagespeed/ai/shot/   │
                                   │ archive/vision       │
                                   │ fixture │ live       │
                                   └──────────────────────┘
                     ▲
        ┌────────────┴─────────────────────────────────────┐
  Core  │ domain · website-status · audit-checks · findings │
        │ playbooks · competitor-scoring · scoring · csv    │
        │ schemas · export-csv        (pure, no I/O)        │
        └───────────────────────────────────────────────────┘
```

`src/core/` is pure: no network, no database, no framework imports. Every scoring and
classification decision lives there, which is why it can be unit tested exhaustively and
why demo mode is a genuine rehearsal rather than a parallel implementation.

## Two ports, four implementations

**`DataStore`** (`src/store/types.ts`) — `MemoryStore` (demo and tests) and
`SupabaseStore`. The pipeline and UI only ever see the interface.

**`Providers`** (`src/providers/types.ts`) — five ports (scraper, search, pagespeed, ai,
screenshot), each with a live adapter and a fixture adapter, selected per-provider by
`src/providers/registry.ts`.

Two design rules make failure survivable:

1. **Providers never throw.** They return `{ ok, data, error }`. A caller that gets
   `ok: false` records `not_run` / `unavailable` / `needs_review` — it never substitutes a
   value.
2. **Failure is per-provider.** A missing `OPENAI_API_KEY` does not stop the technical
   audit; a dead search API does not stop the site audit. Each degrades its own slice and
   the limitation is recorded on the score.

### Why the fixture adapters reason rather than replay

A demo that returned hard-coded prose would prove nothing about the pipeline and, worse,
would produce claims untethered from anything observed. So:

- fixture *websites* are generated as real HTML containing or omitting the markup the
  audit looks for — `runTechnicalAudit` does real work against them;
- the fixture *AI* derives its answers from the measured evidence in the request context
  and passes through the same Zod schema gate a live model would;
- fixture *screenshots* are labelled placeholder cards, never fabricated captures.

## The pipeline

Twelve steps, each a function of `(store, providers, company) → StepResult`:

| # | Step | Writes |
| --- | --- | --- |
| 1 | `validate-company` | normalised domain, import issues |
| 2 | `check-website-status` | status check, status findings, screenshots |
| 3 | `scrape-company-website` | website pages |
| 4 | `run-pagespeed-audit` | PageSpeed + the technical audit on `audit_runs` |
| 5 | `detect-sector-and-business-model` | sector, sub-sector, model, playbook match |
| 6 | `analyze-visual-design` | visual assessment — or why it could not run |
| 7 | `discover-competitors` | competitor candidates |
| 8 | `validate-competitors` | candidate verdicts |
| 9 | `analyze-competitor-websites` | competitors with measured signals, visual comparison |
| 10 | `calculate-scores` | AI interpretation, all findings, score result |
| 11 | `generate-outreach` | outreach flow and four messages |
| 12 | `finalize-company-report` | pipeline status, review flags |

**Why the AI interpretation runs in step 10 rather than step 4:** it needs the playbook
matched in step 5 to judge whether the site fulfils the role its sector expects. Findings
are written in one place for the same reason — generating them in step 4, before the
playbook is known, made the finding set depend on whether the pipeline had run before.
That was a real bug the idempotency test caught. The visual findings follow the same rule:
step 6 stores the assessment, step 10 turns it into findings alongside every other one.

**Why the visual pass sits at step 6:** "does this look right?" is only answerable against
what visitors in this sector come to the site to do, which step 5 establishes. It runs
before the competitor steps so the comparison in step 9 has the company's own capture to
put next to theirs.

### Idempotency

Every per-company write is **replace-by-company**, not append. Re-running a step deletes
that company's slice and rewrites it. Job runs are keyed on
`campaign_id:company_id:step`, unique in Postgres, so a retry updates the row rather than
inserting a second one. `tests/pipeline.integration.test.ts` asserts that a full re-run
changes no row count and no score.

Manually added competitors are the deliberate exception: they carry `source: 'manual'` and
survive a re-run of discovery.

### Execution

`src/pipeline/dispatch.ts` picks an executor:

- **Trigger.dev** when `TRIGGER_SECRET_KEY` is set. `trigger/tasks.ts` are thin wrappers
  that call the same step functions, with platform-level retries, queue concurrency caps
  (8 steps, 4 companies) and `maxDuration` bounds.
- **In-process runner** otherwise (`src/pipeline/runner.ts`): bounded worker pool, per-step
  retry with exponential backoff and jitter, the same job-run bookkeeping, cooperative
  cancellation checked between steps.

Behaviour does not diverge between them because neither owns any logic.

A batch never runs inside the request that starts it: the run endpoint returns `202` and
the work continues in the background. (`{ wait: true }` is available for tests and CLI use.)

## Data model

Eighteen tables (`supabase/migrations/`, applied in filename order). Points worth noting:

- Raw provider payloads live in `provider_usage.raw_response`, apart from normalised
  business data, so an upstream format change cannot corrupt analysis.
- `score_results.competitor_website_usage` is **nullable** — the schema itself encodes
  that an unmeasured component is not zero.
- `companies (campaign_id, normalized_domain)` is uniquely indexed: the database is the
  last line of duplicate defence behind import validation.
- RLS is enabled on every table, scoped through campaign ownership via an
  `owns_company()` security-definer helper. The service-role client used by jobs bypasses
  RLS by design; every entry point above it checks ownership first.

## Measured versus interpreted

The product's central promise is that a reviewer can always tell what was observed from
what was inferred. This is carried structurally, not by convention:

- every finding has a `measurement_source` enum value;
- every score breakdown item carries its source;
- the report renders "Measured findings" and "AI interpretation" as separate sections, and
  a `SourceChip` labels each item;
- the AI prompt forbids referencing anything outside the supplied evidence pack, and its
  response is schema-gated before it can become a stored claim.

## Security

- `src/lib/env.ts` and the Supabase service-role client are `import 'server-only'`; secrets
  cannot reach the browser bundle.
- Route handlers go through `withSession`, which authenticates and maps errors to status
  codes; `ownedCampaign` / `ownedCompany` check ownership on every read and write.
- The scraper sends an identifying user-agent, honours timeouts, follows at most six
  redirects, and never attempts authentication or protected content.
