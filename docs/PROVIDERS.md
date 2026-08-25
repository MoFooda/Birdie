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
   Or paste the files in `supabase/migrations/` into the SQL editor, in filename order.
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

## Choosing a renderer

Crawling and screenshots come from one of three, picked by `RENDERER`:

| `RENDERER` | JS rendering | Screenshots | Cost |
| --- | --- | --- | --- |
| `playwright` | yes | yes, above-fold and full-page | free, self-hosted |
| `auto` + `FIRECRAWL_API_KEY` | yes | yes | per page |
| `auto` with no key | no | no | free |

This matters more than it looks. A React or Vue site serves an almost-empty HTML shell and
fills it in with script. Read without a browser it appears to have no booking link, no
phone number and barely any content — and a healthy site scores as broken. The plain
scraper is fine for server-rendered sites and misleading for the rest.

### Playwright (self-hosted)

```bash
npm install playwright-core
npx playwright install --with-deps chromium
```

Then set `RENDERER=playwright`. Nothing else is needed: no key, no account, no per-page
charge. Budget roughly 400MB of memory per concurrent browser, so keep
`PIPELINE_CONCURRENCY` modest on a small VPS.

Screenshots are captured from the same page visit as the crawl, compressed to JPEG data
URIs (about 60–100KB), and stored inline — small enough to keep in the database and cheap
enough to send to a vision model.

Does not run well on serverless hosts: the browser binary exceeds typical bundle limits
and cold starts are slow. On Vercel, use Firecrawl instead.

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

One call returns four categories — performance, accessibility, SEO and best practices —
for the same quota cost, and all four are used.

**Without it:** all four are reported as `fetched: false` with the reason, excluded from
the transformation-need score (both numerator and denominator), and listed as a
limitation. Never treated as failed checks.

---

## OpenAI — analysis and outreach

1. Create a key at <https://platform.openai.com/api-keys>.
2. `OPENAI_API_KEY=sk-...` and optionally `OPENAI_MODEL=gpt-4.1-mini`.

Used for three text operations, all with structured outputs validated by Zod
(`src/core/schemas.ts`): sector/business-model detection, website interpretation, and
outreach generation — plus the two visual operations below.

A response that fails schema validation is **discarded**, not repaired — the step reports
an error and the company is flagged for review.

Both adapters request `json_object` output, which the API refuses unless the word "JSON"
appears somewhere in the input. The adapters add that instruction themselves rather than
relying on each prompt to remember it — the failure mode is a 400 on every call, reported
as "AI unavailable", which looks exactly like a missing key.

**Without it:** those steps report "not run". The technical audit, status classification
and competitor analysis still work, so the report remains useful; affected companies are
flagged for manual review and no outreach is generated.

---

## OpenAI vision — what the site actually looks like

Needs **two** things at once: `OPENAI_API_KEY`, and a renderer that produces screenshots
(`RENDERER=playwright`, which is free, or `FIRECRAWL_API_KEY`). Set the model with
`OPENAI_VISION_MODEL` (default `gpt-4.1-mini`).

Everything else in the audit is read from markup, which cannot answer the question a
prospect asks first: *does this look like a business I would buy from?* A site can carry
every tag we check for and still look untouched since 2012. Two operations close that gap:

- **`assess`** — reads the mobile above-the-fold capture and the full-page capture, and
  returns seven 0–100 dimensions, a design-era range with a confidence and the visual cues
  behind it, whether the first screen states the offer, and whether a primary action is
  visible without scrolling.
- **`compare`** — puts the company's first screen next to up to three competitors' and
  says whether it reads as clearly better, comparable or clearly worse, with concrete
  differences a person could check by opening two tabs.

Three rules constrain it:

1. **No image, no verdict.** With no screenshot the step records *why* it did not run.
   Falling back to describing the HTML would be exactly the invented evidence this product
   exists to avoid, and the demo adapter refuses on the same grounds rather than writing
   plausible visual prose.
2. **Every claim carries what was observed.** The schema requires it, so a reviewer can
   check each one against the screenshot sitting beside it in the report.
3. **Design era is a range with a confidence, never a year.** A `cannot_tell` answer, or
   any low-confidence era call, is left unmeasured rather than guessed at.

Both visual findings and the comparison are tagged `ai_interpretation`, so the report
keeps them out of the measured column.

**Without it:** the two visual scoring items are excluded from both sides of the ratio,
and the score's limitations say plainly that the site was never looked at — so a
markup-only score is never mistaken for a verdict on how the site appears.

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

## Wayback Machine — how long the site has looked like this

No key, no account, no cost. Always on outside demo mode.

The CDX endpoint returns one row per capture including a content digest, so the last
genuine content change is derivable rather than guessed. A site whose homepage has not
changed since 2017 is a rebuild conversation regardless of how it scores technically, and
it is the most checkable line you can put in a cold email — the prospect can verify it
themselves.

**Limits, recorded rather than papered over:** archive coverage is uneven, a digest changes
on trivial edits as well as redesigns, and a domain absent from the archive returns
`fetched: false` rather than "never changed".

**Without it:** freshness is excluded from the score and reported as not measured.

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
- 2 PageSpeed calls (mobile, desktop), each returning four Lighthouse categories
- 1 Wayback Machine lookup (free)
- 1 search + up to 5 validations + up to 3 competitor probes and crawls
- up to 8 text model calls (1 sector detection, 1 site interpretation, up to 5 competitor
  validations — one per candidate — and 1 outreach generation)
- up to 2 vision calls when it is enabled: 1 assessment (2 images) and 1 comparison
  (up to 4 images). Images dominate the token cost of these two, which is why the
  comparison uses above-the-fold captures only rather than full pages

A 50-company batch is therefore on the order of 400 model calls, 100 PageSpeed calls and
several hundred page fetches. `PIPELINE_CONCURRENCY` (default 4) caps how many companies
run at once — raise it carefully, since it multiplies your request rate against every
provider simultaneously.

Every call is recorded in `provider_usage` with its duration, outcome and raw payload, so
cost and failure rates can be audited after the fact.
