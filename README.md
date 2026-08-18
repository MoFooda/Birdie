# Birdie — Website Opportunity Engine

An internal tool for the Birdie team. Import an Apollo CSV, audit each company's
website against what its sector actually needs and what its competitors actually do, score
the opportunity in an explainable way, and generate cold outreach built only on evidence
you can check.

The question it answers is not "is this website good?" but:

> Does this company represent a real opportunity for a new website, a rebuild, a redesign,
> or a conversion-focused improvement — given how much websites matter in its sector, the
> state of its current site, and how hard its competitors work theirs?

---

## Quick start (no API keys required)

```bash
npm install
cp .env.example .env.local     # optional: the defaults already enable demo mode
npm run dev
```

Open <http://localhost:3000>, click **Continue as demo user**, then **Seed demo campaign**.
That creates a campaign with thirteen fixture companies. Press **Start analysis** on the
campaign dashboard and watch the per-company, per-step grid fill in.

To try the CSV path instead of seeding: **New campaign** → fill in the settings →
upload `samples/apollo-sample.csv` → confirm the column mapping → review → import.

### What demo mode actually does

`DEMO_MODE=true` swaps every provider for a fixture adapter and the database for an
in-memory store. It does **not** swap the pipeline: the same twelve steps, the same
detectors, the same scoring engine and the same store interface run as in production.

- Fixture websites are generated as real HTML containing (or deliberately missing) the
  markup the audit looks for, so `runTechnicalAudit` does genuine work.
- The fixture AI adapter derives its answers from the measured evidence it is handed,
  and its output passes through the same Zod schema gate a live model's would. It does
  not return canned prose.
- Screenshots render a labelled placeholder card, not a fake browser capture.

Every fixture surface is labelled **Demo mode — fixture data** in the header.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm test` | Full suite (the e2e test needs a build — see below) |
| `npm run test:unit` | Everything except the e2e test; no build needed |
| `npm run verify` | typecheck → lint → build → test |
| `npm run sample:csv` | Regenerate `samples/apollo-sample.csv` from the fixtures |
| `npm run trigger:dev` | Run the Trigger.dev worker locally |

`npm test` includes an end-to-end test that boots the production server and drives the
whole workflow over HTTP, so it needs `.next` to exist. Use `npm run verify` (which builds
first) or `npm run test:unit` while iterating.

---

## Documentation

- [`docs/GO-LIVE.md`](docs/GO-LIVE.md) — **deploy to Vercel step by step** (and why Lovable cannot host this)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together and why
- [`docs/SCORING.md`](docs/SCORING.md) — the formula, every component, worked examples
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — getting each API key, and what breaks without it
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Supabase, Vercel and Trigger.dev setup
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) — the Birdie palette, the type stack, and how to re-theme
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — known limitations, honestly
- [`docs/APOLLO-INTEGRATION.md`](docs/APOLLO-INTEGRATION.md) — notes for future write-back

---

## The workflow

1. **Create a campaign** — geography, target sectors, the service you sell, your value
   proposition, sender identity, language (English or Arabic), tone, CTA, how many
   competitors to analyse, and the minimum score that earns outreach.
2. **Import an Apollo CSV** — upload, confirm the guessed column mapping, then review a
   row-by-row validation report before anything is written.
3. **Run the batch** — each company runs twelve steps independently.
4. **Review** — the company report separates measured facts from AI interpretation, shows
   the full score breakdown, the competitor comparison and the evidence behind every claim.
5. **Edit and approve** — outreach is editable; a human edit is never overwritten by a
   re-run.
6. **Export** — one CSV row per company, with the emails intact.

### The twelve pipeline steps

`validate-company` → `check-website-status` → `scrape-company-website` →
`run-pagespeed-audit` → `detect-sector-and-business-model` → `analyze-visual-design` →
`discover-competitors` → `validate-competitors` → `analyze-competitor-websites` →
`calculate-scores` → `generate-outreach` → `finalize-company-report`

Each step is idempotent (every write is replace-by-company, keyed on
`campaign:company:step`), independently retryable from the UI, and reports `skipped` with
a reason rather than throwing when it cannot run. One failed company never fails a batch.

---

## Required environment variables

None are required for demo mode. For production, see `.env.example` for the full list with
comments. In short:

| Variable | Needed for | Without it |
| --- | --- | --- |
| `DEMO_MODE` | Switching between fixtures and live | Defaults to `true` |
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | Database and auth | Falls back to the in-memory store |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side and job writes | Falls back to the in-memory store |
| `FIRECRAWL_API_KEY` | JS rendering and screenshots | Built-in direct HTTP scraper, no screenshots |
| `PAGESPEED_API_KEY` | Performance measurement | Performance reported as not measured, excluded from scoring |
| `OPENAI_API_KEY` | Sector detection, interpretation, outreach, visual analysis | Those steps report "not run"; companies flagged for review |
| `OPENAI_VISION_MODEL` | Which model reads the screenshots | Defaults to `gpt-4.1-mini`; needs a screenshot-capable renderer too |
| `SERPER_API_KEY` | Competitor discovery | Competitor component unmeasured; the score drops its term |
| `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` | Durable background jobs | In-process runner with the same semantics |

---

## What this engine will not do

These are enforced in code and covered by tests, not just aspirations:

- **It will not claim a technical problem it did not measure.** Every finding carries a
  `measurement_source`, and the report renders measured facts and AI interpretation in
  separate sections.
- **It will not report a site it could not read as offline.** A Cloudflare challenge, a
  403 or a timeout produce `bot_protection` / `access_blocked` / `timeout` — distinct from
  `no_website` — and flag the company for manual review.
- **It will not count a check it never ran as a check the site failed.** Unmeasured items
  are excluded from both sides of the score ratio and are labelled "not measured".
- **It will not invent a competitor to reach three.** With fewer than three, confidence
  drops and the limitation is shown; with none, the competitor term is dropped from the
  formula rather than assumed, and a human can add competitors by hand.
- **It will not quote traffic, revenue or loss figures**, and will not write generic filler
  like "your website needs improvement".
- **It will not recommend a service the campaign has not configured.**
- **It will not send WhatsApp messages.** Drafts are generated, labelled consent-required,
  and marked with whether consent is actually on file.
- **It will not bypass authentication** or fetch content behind a login.

---

## Repository layout

The app is the repository — it lives at the root.

```
.
├── src/
│   ├── core/          Pure domain logic — no I/O, fully unit tested
│   ├── providers/     Provider ports plus live and fixture adapters
│   ├── store/         DataStore port, memory and Supabase implementations
│   ├── pipeline/      The twelve steps, the runner, and dispatch
│   ├── fixtures/      Demo dataset and the fixture website builder
│   ├── app/           Next.js App Router pages and API routes
│   └── components/    UI primitives built on the design tokens
├── trigger/           Trigger.dev task definitions (thin wrappers over the steps)
├── supabase/          SQL migrations, RLS policies, seed
├── samples/           Sample Apollo export
├── scripts/           Maintenance scripts
├── tests/             Unit, integration and end-to-end tests
└── docs/              Architecture, scoring, providers, deployment, limitations
```
