# Deployment

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Demo mode is on by default, so this works immediately with no credentials.

## Verifying before you ship

```bash
npm run verify   # typecheck → lint → build → test
```

The e2e test boots the production build and drives the workflow over HTTP, which is why
`verify` builds before it tests.

---

## Supabase

1. Create the project and run the migration:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
2. Seed the sector playbooks — scoring depends on approved playbooks existing:
   ```bash
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. Auth → Providers: enable email/password (or your preferred provider).
4. Create your first user in the Supabase dashboard, then insert the matching profile row:
   ```sql
   insert into users (id, email, full_name, role)
   values ('<auth-user-uuid>', 'you@agency.com', 'Your Name', 'admin');
   ```
   The `users` row is required — RLS policies and campaign ownership key off it.
5. Storage: the migration creates a private `website-screenshots` bucket.

---

## Vercel

1. Import the repository. The app is at the repository root, so leave **Root Directory**
   at its default.
2. Add the environment variables you actually have values for. To run the hosted demo —
   real persistence, fixture analysis, no provider keys and no provider cost:
   ```
   DEMO_MODE=true
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   Set `DEMO_MODE=false` once the provider keys are in place. Storage follows the Supabase
   credentials alone and never `DEMO_MODE`, so the two can be flipped independently.
3. Deploy.

**Do not let the import wizard seed the environment from `.env.example`.** It declares
every optional key, and Vercel adds them all as empty strings — which is not the same as
absent. The code defends against this (`src/lib/env.ts` treats a blank value as unset),
but an empty variable list is still the cleaner starting point: add only the keys you have
real values for.

### Function timeouts

`api/campaigns/[id]/run` declares `maxDuration = 300`, the ceiling every plan accepts —
Hobby included. Setting it higher does not get capped, it **fails the build**:

```
Builder returned invalid maxDuration value for Serverless Function
"api/campaigns/[id]/run". Serverless Functions must have a maxDuration
between 1 and 300 for plan hobby.
```

A large batch run with `wait: true` can exceed 300 seconds and be killed mid-run. Nothing
is corrupted when that happens — every step is idempotent and recorded in `job_runs`, so
re-running the batch resumes rather than duplicates. For batches that size, use
Trigger.dev.

### Important: use Trigger.dev in serverless

On Vercel, a background promise is not guaranteed to survive the response. The in-process
runner is designed for a long-running Node server (local, a container, a VM). **In a
serverless deployment, configure Trigger.dev** — otherwise a batch started from the UI may
be cut short when the function returns.

The settings page shows which runner is active, and the campaign dashboard says so too.

---

## Trigger.dev

```bash
npx trigger.dev@latest login
npx trigger.dev@latest deploy
```

Set in the Trigger.dev project the same server-side variables the tasks need:
`SUPABASE_*`, `FIRECRAWL_API_KEY`, `PAGESPEED_API_KEY`, `OPENAI_API_KEY`,
`SERPER_API_KEY`, `DEMO_MODE=false`.

The tasks import the pipeline from `src/`, so they read exactly the same configuration the
web app does.

---

## Container / VM deployment

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

Any long-running Node host works, and there the in-process runner is a genuine option: it
handles retries, concurrency, idempotency and cancellation. The trade-off is durability —
a restart mid-batch loses in-flight steps. Completed steps are already recorded, so
re-running the batch resumes cleanly rather than duplicating work.

---

## Post-deploy checklist

- [ ] `/settings` shows every provider you configured as **live** (not fixture/fallback).
- [ ] `/settings` shows the data store as **Supabase Postgres**.
- [ ] `/playbooks` lists the seeded playbooks as **approved** — scoring needs them.
- [ ] A test campaign with two or three real companies completes end to end.
- [ ] The CSV export opens in Excel with Arabic rendering correctly (the BOM handles this).
- [ ] `DEMO_MODE=false` in production — otherwise every report is fixture data.
