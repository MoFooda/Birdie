# Future Apollo integration

The MVP is **import-only**: a CSV goes in, a CSV comes out. There is no Apollo API
connection and no write-back, deliberately — write-back to a shared prospecting database is
the kind of thing you want a human to have signed off on a few hundred times first.

The data model is nevertheless ready for it.

## What is already stored

| Column | Table | Purpose |
| --- | --- | --- |
| `apollo_company_id` | `companies` | Stable handle for the Apollo account |
| `apollo_contact_id` | `contacts` | Stable handle for the Apollo contact |

Both survive the whole pipeline and appear in the CSV export, so a manual re-upload into
Apollo can already be matched on ID rather than on fuzzy name matching.

## What a write-back would need

1. **An Apollo provider port.** Follow the existing pattern in `src/providers/`: define
   `ApolloProvider` in `types.ts` with a fixture and a live adapter, and register it in
   `registry.ts`. Nothing in the pipeline should import the Apollo SDK directly.

2. **A twelfth pipeline step**, `sync-to-apollo`, added to `PIPELINE_STEPS` and
   `STEP_HANDLERS`. It gets idempotency, retries, per-company job status, progress display
   and manual retry for free — that is the point of the step abstraction.

3. **A sync-state column** on `companies`, e.g.
   ```sql
   alter table companies
     add column apollo_sync_status text not null default 'not_synced',
     add column apollo_synced_at timestamptz,
     add column apollo_sync_error text;
   ```

4. **A field mapping.** The natural candidates:

   | Engine field | Apollo target |
   | --- | --- |
   | `score_results.potential_score` | Custom field, e.g. "Website Opportunity Score" |
   | `score_results.classification` | Custom field or tag |
   | `score_results.recommended_action` | Custom field |
   | `companies.sub_sector` | Custom field |
   | `website_status_checks.status` | Custom field |
   | Report URL | Custom field (link back to the report) |

5. **A gate on human review.** The obvious rule: only sync companies whose
   `review_status` is `approved`. Pushing an unreviewed AI score into a shared prospecting
   database is exactly the failure mode this product is built to avoid.

## Sequencing note

Apollo enforces per-plan API rate limits. A batch sync should reuse
`mapWithConcurrency` from `src/pipeline/runner.ts` with its own, lower concurrency rather
than inheriting `PIPELINE_CONCURRENCY`, and should record every call in `provider_usage`
like the other providers do.
