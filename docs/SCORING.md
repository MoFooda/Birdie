# Scoring

## The formula

```
potential_score = round(W × ((0.65 × S + 0.35 × C) / 100))
```

| Symbol | Component | Meaning |
| --- | --- | --- |
| `W` | `website_transformation_need` | How much website work this company needs |
| `S` | `sector_website_importance` | How much a working website matters in this sector |
| `C` | `competitor_website_usage` | How hard competitors actually work their websites |

Implemented in `src/core/scoring.ts` (`potentialScore`), pinned by
`tests/scoring.test.ts`.

Because `(0.65 × S + 0.35 × C) / 100 ≤ 1`, the final score can never exceed `W`. That is
deliberate: a company whose website already does its job is not an opportunity no matter
how competitive its market is.

### Classification

| Score | Classification |
| --- | --- |
| 80–100 | Very High Website Opportunity |
| 60–79 | High Website Opportunity |
| 40–59 | Medium Opportunity — Manual Review |
| 20–39 | Low Opportunity |
| 0–19 | Skip |

In practice, "Very High" needs `W ≥ 85` *and* a strongly website-dependent market — which
in this model means a company with no working website in a sector where the website is the
sales channel. That is the right shape: the biggest opportunity is a business whose
customers cannot buy or book from it at all.

### Recommended action

The recommended action follows `W` alone; the final score sets outreach *priority*, not
*what to build*.

| `W` | Action |
| --- | --- |
| 85–100 | New website (no usable site) or complete rebuild |
| 60–84 | Major redesign |
| 35–59 | Targeted improvements |
| 15–34 | Minor optimization |
| 0–14 | No meaningful website work required |

When `W` could not be measured, the action is `needs_review` — never a guess.

---

## W — website transformation need

### Short-circuits

Some statuses settle the question before any page is read:

| Status | `W` | Rationale |
| --- | --- | --- |
| `no_website`, `invalid_domain`, `dns_failure`, `parked_domain`, `domain_for_sale` | 95 | There is no working website to improve |
| `under_construction` | 88 | A placeholder is not a website |
| `ssl_failure` | 72 | Browsers block the site before it loads; content unreadable, so availability only |
| `bot_protection`, `access_blocked`, `timeout`, `unknown_needs_review` | 50 *(placeholder)* | **Not a measurement.** Flagged for review, outreach withheld |

The last row matters. Being unable to read a site is a limit of our measurement, not a
fact about the business, so the score is explicitly marked `transformation_measured:
false`, `requires_human_review: true`, and no outreach is written.

### The measured model

For a readable site, `W` is a weighted ratio over the items we could actually measure:

```
W = round(100 × Σ(points earned) / Σ(max points of measured items))
```

| Item | Max | Source |
| --- | --- | --- |
| Homepage loads correctly | 8 | HTTP |
| Internal links resolve | 4 | HTTP |
| Served over HTTPS | 4 | HTTP |
| Mobile viewport configured | 8 | Page source |
| Responsive layout | 3 | Page source |
| Mobile performance | 8 | PageSpeed |
| **Sector conversion actions present** | **28** | Page source × playbook |
| Essential pages present | 10 | HTTP × playbook |
| Trust signals present | 10 | Page source × playbook |
| Basic SEO hygiene | 6 | Page source |
| Analytics and tracking installed | 4 | Page source |
| Gap versus competitors | 12 | Page source |
| Accessibility (Lighthouse) | 4 | PageSpeed |
| Best practices (Lighthouse) | 3 | PageSpeed |
| Site has changed recently | 8 | Wayback Machine |
| Modern front-end stack | 6 | Page source |
| Structure, journey, conversion path | 14 | AI interpretation |
| Visual design and layout | 12 | AI interpretation of a screenshot |
| How current the design looks | 8 | AI interpretation of a screenshot |

Freshness scores on a ladder: 8 points at five years without a content change, 6 at three
years, 4 at two, 2 at one, 0 below that. The dated-stack item adds 3 points per marker
found (jQuery 1.x, Bootstrap 2/3, Flash, table layouts, `<font>` tags and similar), capped
at 6.

Sector conversion actions carry the most weight because that is the product's actual
question: does this website do the job its sector's customer journey requires?

### The two visual items

Everything above them is read from markup, which cannot answer the question a prospect
asks first: *does this look like a business I would buy from?* A site can carry every tag
the audit checks for and still look untouched since 2012.

**Visual design and layout** averages seven dimensions the model scores from the rendered
screenshot — hierarchy, above-the-fold clarity, imagery, brand consistency, readability,
freedom from clutter, and mobile layout — and converts the average to need the same way
the structural item does: `((100 − average) / 100) × 12`.

**How current the design looks** maps the design era onto points:

| Era | Points |
| --- | --- |
| Looks current | 0 |
| Recent, a little behind | 2 |
| Dated — late 2010s | 5 |
| Dated — early 2010s | 7 |
| Pre-2010 | 8 |
| Cannot tell from the screenshot | *not measured* |

The era is always a **range with a confidence**, never a year. "This looks like it was
built around 2012–2015" is defensible; "your website is from 2013" is not. A `cannot_tell`
answer, or any era call the model returned at low confidence, is left unmeasured rather
than guessed at — the same rule as every other item.

Both items are excluded entirely when no screenshot was looked at, and the score's
limitations say so explicitly, so nobody reads a markup-only score as a verdict on how
the site appears.

### Unmeasured items are excluded, not failed

This is the single most important property of the model. If PageSpeed was not run, its
8 points leave *both* the numerator and the denominator. A check we never ran must never
look like a check the site failed.

The consequence is that dropping an item the site was passing can nudge the ratio up
slightly, and dropping one it was failing nudges it down. That is correct — the score
means "how much work is needed, across what we could establish" — and the breakdown labels
every such item "not measured" so a reviewer can see the basis.

---

## S — sector website importance

`S` comes primarily from an **approved sector playbook** (`src/core/playbooks.ts`, editable
at `/playbooks`), not from a per-company model judgement. Website importance is a
statement about a market; re-deriving it for every row would make scores incomparable and
untraceable.

```
S = clamp(playbook.website_importance_score + modifier, 0, 100)   where |modifier| ≤ 8
```

Seeded baselines:

| Sub-sector | Score | Expected website role |
| --- | --- | --- |
| E-commerce brand | 96 | Transaction |
| B2B SaaS | 92 | Demo request |
| Appointment-driven clinic | 88 | Booking |
| B2B professional service | 74 | Lead generation |
| Building materials manufacturer | 68 | Request for quotation |
| Restaurant and local dining | 62 | Local footfall support |

The modifier is evidence-based and capped at ±8 so the approved playbook stays dominant:

- **+4** when ≥80% of validated competitors serve a working website — direct evidence the
  website is central in this market.
- **−6** when ≤34% do (with at least three analysed) — direct evidence it is not.

**Company size is never an input.** Headcount is displayed as context only. This product
scores *website opportunity*, not general lead value.

If no approved playbook matches, `S` is set to an explicit placeholder of 50, the company
is flagged for review, and the limitation is stated.

---

## C — competitor website usage

The question is not whether competitors own websites — nearly all do. It is whether they
actively use them to communicate with, capture and convert customers.

| Dimension | Weight |
| --- | --- |
| Active website adoption | 30 |
| Conversion feature adoption | 35 |
| Customer communication features | 20 |
| Content and credibility depth | 15 |

`C` is re-based over the weight that could actually be measured, so an unmeasurable
dimension lowers confidence rather than silently dragging the score to zero.

### Sector-relevant signals

Competitors are measured against the signals that matter **in their sector**, taken from
the playbook. Judging a dental clinic's competitors on shopping-cart adoption would
understate how hard they work their websites — and therefore understate the target
company's gap. Without a playbook, a broader default list is used.

### When competitors are missing

- Competitors we could not read (bot protection, timeout) are excluded from the
  denominators and reported as a limitation — never counted as absent features.
- Fewer than three valid competitors: confidence drops and the shortfall is shown.
- **Zero** analysable competitors: `C` is `null` and the formula degrades explicitly to
  `round(W × (S / 100))`. The limitation is recorded on the score, the company is flagged
  for review, and a reviewer can add competitors by hand.

---

## Confidence and review

`confidence` is the lowest of: transformation-need confidence, competitor confidence,
sector-detection confidence, playbook availability, and the AI's self-reported confidence.

`requires_human_review` is set when any of these hold:

- the transformation need could not be measured;
- no playbook matched;
- the competitor component could not be measured;
- sector detection returned low confidence;
- a reviewer has an unresolved flag on the row;
- the final score lands in the 40–59 "Medium — Manual Review" band.

`should_generate_outreach` requires **all** of: score at or above the campaign threshold,
a measured transformation need, at least one piece of supporting evidence, no unresolved
manual review, and a recommended action that is neither `needs_review` nor `no_action`.

---

## Worked examples

**Al Noor Dental Clinic** — live site, no booking, no WhatsApp, no click-to-call, no
contact form, no mobile viewport, mobile PageSpeed 31, broken contact page, no tracking.

```
W = 67   (weighted ratio over 13 measured items)
S = 92   (clinic playbook 88, +4 for ~100% competitor website adoption)
C = 89   (three competitors, all with booking, forms and reviews)
potential = round(67 × ((0.65 × 92 + 0.35 × 89) / 100)) = 61 → High
action: major redesign
```

**Marina Aesthetics Clinic** — same sector, strong site: booking, WhatsApp, click-to-call,
forms, reviews, certifications, full tracking, mobile PageSpeed 84.

```
W = 4    (almost nothing missing)
S = 92
C = 89
potential = round(4 × 0.91) = 4 → Skip
action: no meaningful website work required
```

Same sector, same competitors, opposite conclusion — driven entirely by the site itself.

**Noor Family Medical Centre** — domain serves a "buy this domain" page.

```
W = 95   (no usable website)
S = 92
C = 89
potential = round(95 × 0.91) = 86 → Very High
action: build a new website
```

**Cedar Grill House** — Cloudflare challenge; the site could not be read.

```
W = 50   (indeterminate placeholder, transformation_measured: false)
requires_human_review: true
should_generate_outreach: false
action: needs review
```

Not scored as "no website", not scored as "bad website" — scored as "we could not tell".
