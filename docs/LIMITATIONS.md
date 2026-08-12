# Known limitations

Written plainly, because a tool whose selling point is "no fabricated data" cannot be
vague about its own boundaries.

---

## Design system

The palette and typeface were matched **by eye from screenshots** of birdiemena.com — the
site is blocked by this environment's network policy, so nothing was sampled from its CSS
and the typeface was identified from letterforms rather than confirmed. Expect the values
to be close but not exact. Swapping in the brand's real hex values and font names is a
single-file edit; see [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

---

## Scraping and measurement

- **No JavaScript rendering without Firecrawl.** The built-in HTTP scraper reads served
  HTML only. A client-rendered SPA will look emptier than it is. Its conversion features
  may be reported as absent when they exist. Firecrawl fixes this; the fallback does not.
- **The crawl is shallow** — the homepage plus up to five same-host internal links. A
  booking flow buried six levels deep will be missed.
- **Page-type classification is URL-heuristic.** `/services` becomes `services`, and an
  unusual information architecture may not map cleanly onto playbook page requirements.
- **Feature detection is markup-pattern based.** A booking widget in an iframe from an
  unrecognised vendor, or a contact form rendered entirely in canvas, will not be
  detected. Detection is deliberately conservative: it reports what it can see and says
  nothing about what it cannot.
- **Content-freshness detection is weak.** "Updated content" looks for a current-or-recent
  year alongside a blog or product section. That is a proxy, not a real freshness check.
- **Screenshots are homepage-only, mobile viewport.** No desktop capture in the default
  flow.
- **`robots.txt` and `sitemap.xml` are only fetched by the direct HTTP scraper**, not the
  Firecrawl path — so those two checks report "not measured" when Firecrawl is in use.

## What we deliberately do not do

- No attempt to bypass bot protection, CAPTCHAs or authentication. A blocked site is
  reported as blocked and flagged for human review — it is never guessed at.
- No fetching of content behind a login.

---

## Sector detection and playbooks

- Only **six seeded playbooks** ship. Companies outside them get no playbook match, `S`
  falls back to an explicit placeholder of 50, and the row is flagged for review. Real use
  needs a broader playbook library — that is authoring work, and it is meant to be human
  work.
- Sub-sector detection is only as good as the Apollo industry column and the homepage
  copy. Low-confidence detections are flagged rather than silently accepted, but a
  *confidently wrong* classification is possible and will pick the wrong playbook.
- AI-proposed playbooks are supported as a data state (`ai_suggested_unapproved`) but
  there is no UI flow yet that generates one.

---

## Competitors

- Candidates come from a single search query per company. Local businesses with weak
  search presence may return nothing usable, and directory-heavy results are filtered by a
  hardcoded deny-list that will not catch every aggregator.
- Validation is a per-candidate model judgement over sub-sector, customer type and
  geography. It is stricter than "appeared in a search result", but it is not a market
  analyst.
- Competitor sites get a shallower crawl (4 pages) and **no PageSpeed** — competitor
  comparison covers features and content, not performance.
- With zero analysable competitors the formula degrades to `round(W × (S / 100))`. That is
  documented and flagged, but it does mean two companies can have scores computed by
  different formulas within one campaign. The export marks these `not measured`.

---

## Scoring

- The weights and thresholds are **considered defaults, not empirically calibrated**. They
  have not been validated against real conversion outcomes. Treat the score as a
  prioritisation aid whose reasoning you can inspect, not as a measurement.
- "Very High" (80+) is structurally hard to reach for a company that *has* a website,
  since the final score can never exceed `W`. This is intentional (see
  [`SCORING.md`](SCORING.md)) but is worth knowing before tuning campaign thresholds.
- The ±8 sector-importance modifier uses competitor adoption as its only evidence source.

---

## Outreach

- Emails are generated per company, not A/B tested, and there is no deliverability,
  sending or sequencing infrastructure. This tool writes drafts; sending happens elsewhere.
- Arabic output is templated in the fixture provider and model-generated in production.
  **Have a native speaker review Arabic outreach before it goes out.**
- WhatsApp is drafts-only by design. Nothing sends, and consent state is displayed but not
  verified against any external source of truth — it comes from the CSV.

---

## Infrastructure

- **The in-memory demo store is per-process.** Running demo mode across multiple instances
  gives each its own state. It is for local development and demonstration, not shared use.
- **The in-process job runner is not durable.** A restart mid-batch loses in-flight steps.
  Completed steps are already persisted, so a re-run resumes cleanly rather than
  duplicating — but on serverless hosting, configure Trigger.dev.
- Progress is polled at 1.5s intervals rather than streamed. Fine for 50 companies;
  it would want websockets or SSE at a larger scale.
- No pagination anywhere. The results table renders every company in the campaign, which
  is fine at the documented 50-company batch limit and would not be at 5,000.
- The Trigger.dev path is implemented and configured but **has not been executed against a
  live Trigger.dev project** in this environment — no credentials were available. The
  in-process path is the one exercised by the test suite.

---

## Testing

- The e2e test drives the real production server over HTTP, but asserts on API responses
  and rendered HTML rather than through a browser. There is no Playwright interaction
  test, so client-side JavaScript behaviour (the import wizard's stages, the outreach
  editor's save flow) is covered by unit-level reasoning and manual use, not automation.
- All tests run against fixture providers. No test exercises a live third-party API.
