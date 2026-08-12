# Providers and API setup

Every provider is optional. The app starts, runs and produces reports with none of them
configured — it simply reports less, and says so. Nothing is ever filled in with a guess.

Check the live state of all of them at **Settings** (`/settings`).

---

## Supabase — database, auth, storage

1. Create a project at <https://supabase.com>.
2. Run the migration:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
   Or paste `supabase/migrations/0001_init.sql` into the SQL editor.
3. Copy **Project URL**, **anon key** and **service_role key** from Project Settings → API.
4. Seed the sector playbooks:
   ```bash
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

The service-role key bypasses RLS and must stay server-side. Never prefix it with
`NEXT_PUBLIC_`.

**Without it:** the app runs on the in-memory store. Fine for a demo, wrong for real
work — state is per-process and disappears when the process does.

---

## Firecrawl — website scraping

1. Sign up at <https://firecrawl.dev>, copy the API key.
2. `FIRECRAWL_API_KEY=fc-...`

Used for rendering JavaScript-heavy sites and capturing screenshots.

**Without it:** the built-in direct HTTP scraper takes over — same interface, same status
classification, but no JavaScript execution (so client-rendered sites look emptier than
they are) and no screenshots. Reasonable for a first pass; not for SPA-heavy markets.

---

## Google PageSpeed Insights — performance

1. Enable the PageSpeed Insights API in a Google Cloud project.
2. Create an API key: <https://developers.google.com/speed/docs/insights/v5/get-started>
3. `PAGESPEED_API_KEY=AIza...`

Free tier is roughly 25,000 requests/day but rate-limited per minute; the adapter retries
429s with exponential backoff. Each call runs a full Lighthouse pass, so the request
timeout is 90s.

**Without it:** performance is reported as `fetched: false` with the reason, excluded from
the transformation-need score (both numerator and denominator), and listed as a
limitation. It is never treated as a failed check.

---

## OpenAI — analysis and outreach

1. Create a key at <https://platform.openai.com/api-keys>.
2. `OPENAI_API_KEY=sk-...` and optionally `OPENAI_MODEL=gpt-4.1-mini`.

Used for three operations, all with structured outputs validated by Zod
(`src/core/schemas.ts`): sector/business-model detection, website interpretation, and
outreach generation.

A response that fails schema validation is **discarded**, not repaired — the step reports
an error and the company is flagged for review.

**Without it:** those three steps report "not run". The technical audit, status
classification and competitor analysis still work, so the report remains useful; affected
companies are flagged for manual review and no outreach is generated.

---

## Serper — competitor discovery

1. Sign up at <https://serper.dev>, copy the API key.
2. `SERPER_API_KEY=...`

To use a different SERP API, implement `SearchProvider` in `src/providers/search.ts` and
wire it in `registry.ts`. Nothing else needs to change.

A search hit is only a **candidate**. Every candidate is then validated against
sub-sector, customer type and geography before it counts as a competitor — appearing in a
search result is not evidence of competition.

**Without it:** discovery is skipped, `C` is unmeasured, and the final score degrades to
`round(W × (S / 100))` with the limitation recorded. Competitors can still be added by
hand from the company report.

---

## Trigger.dev — background jobs

1. Create a project at <https://trigger.dev>.
2. `TRIGGER_PROJECT_REF=proj_...` and `TRIGGER_SECRET_KEY=tr_...`
3. Local worker: `npm run trigger:dev`
4. Deploy: `npx trigger.dev@latest deploy`

Tasks are in `trigger/tasks.ts`; configuration in `trigger.config.ts` (3 attempts,
exponential backoff with jitter, 8-concurrent steps, 4-concurrent companies).

**Without it:** the in-process runner handles batches with the same retry, concurrency,
idempotency and cancellation behaviour. The difference is durability — a server restart
mid-batch loses in-flight work, and steps already recorded stay recorded, so a re-run
picks up cleanly.

---

## Rate limits and cost

Per company, a full run makes roughly:

- 1 status probe + 1 site crawl (up to 6 pages) + up to 2 screenshots
- 2 PageSpeed calls (mobile, desktop)
- 1 search + up to 5 validations + up to 3 competitor probes and crawls
- 3 model calls

A 50-company batch is therefore on the order of 150 model calls, 100 PageSpeed calls and
several hundred page fetches. `PIPELINE_CONCURRENCY` (default 4) caps how many companies
run at once — raise it carefully, since it multiplies your request rate against every
provider simultaneously.

Every call is recorded in `provider_usage` with its duration, outcome and raw payload, so
cost and failure rates can be audited after the fact.
