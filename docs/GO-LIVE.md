# Go live on Vercel

The fastest path from this repository to a working URL. Two stages: get it live with
fixture data first (~10 minutes, no paid APIs), then switch on the real providers when
you are ready.

---

## Why not Lovable

Worth stating once so nobody loses an afternoon to it. Lovable builds **Vite + React
single-page apps** that run in the browser, with Supabase behind them. This app cannot run
that way, for three reasons:

1. **It needs a server.** Nineteen API routes, server-rendered pages, and a background job
   runner. There is no Node process in a Lovable deployment.
2. **The provider keys must stay server-side.** OpenAI, Firecrawl and PageSpeed keys in a
   browser bundle are readable by anyone who opens developer tools.
3. **The core job is impossible in a browser.** This tool fetches and reads *other
   companies' websites*. Cross-origin fetches like that are blocked by the browser's
   same-origin policy. No amount of configuration changes that — it has to run server-side.

Vercel runs Next.js natively, so everything works as built.

---

## Stage 1 — live with demo data

### 1. Create the Supabase project

Storage is chosen by Supabase credentials, independent of `DEMO_MODE`. Skipping this step
will *appear* to work and then behave strangely: without Supabase the app uses an
in-memory store, and on a serverless host each request can land in a different instance,
so a campaign you just created will seem to vanish.

1. Create a project at [supabase.com](https://supabase.com) (the free tier is enough).
2. SQL Editor → paste and run `supabase/migrations/0001_init.sql`.
3. SQL Editor → paste and run `supabase/seed.sql`.
   **Do not skip this.** Scoring needs approved sector playbooks; without them every
   company falls back to an indeterminate placeholder and gets flagged for review.
4. Project Settings → API → copy the **Project URL**, the **anon** key and the
   **service_role** key.

### 2. Push this repository to GitHub

Vercel deploys from a Git repository.

```bash
git remote -v                      # confirm it points at your repo
git push -u origin claude/website-opportunity-engine-f6l6qh
```

### 3. Import into Vercel

1. [vercel.com/new](https://vercel.com/new) → import the repository.
2. Leave **Root Directory** as the default — the app is at the repository root.
3. Framework preset should auto-detect as **Next.js**. Leave the build settings alone.

### 4. Set the environment variables

In the import screen, or later under Settings → Environment Variables:

```
DEMO_MODE=true
NEXT_PUBLIC_APP_URL=https://<your-project>.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`DEMO_MODE=true` keeps every provider on local fixtures, so no paid API key is needed yet.
Storage is real, so everything persists.

### 5. Deploy, then check it

Open the deployment and confirm, in this order:

- **/settings** — Supabase should read **live**; the other providers should read
  **fixture**. If Supabase says *fixture*, a key is missing or misspelled.
- **/playbooks** — six playbooks, all **approved**. If this page is empty, `seed.sql`
  did not run.
- **Campaigns → Seed demo campaign → Start analysis** — thirteen companies should reach
  143/143 steps.

That is a working deployment on fixture data.

---

## Stage 2 — switch on the real providers

Add keys one at a time and set `DEMO_MODE=false` only once you have at least Firecrawl or
are content with the built-in HTTP scraper. Each provider degrades independently — see
[`PROVIDERS.md`](PROVIDERS.md) for exactly what each one changes.

```
DEMO_MODE=false
FIRECRAWL_API_KEY=fc-...      # JS rendering + screenshots
PAGESPEED_API_KEY=AIza...     # performance scoring
OPENAI_API_KEY=sk-...         # sector detection, interpretation, outreach
SERPER_API_KEY=...            # competitor discovery
```

Redeploy after changing variables — Next.js reads them at build time.

### Background jobs: required for real batches

This is the one thing that genuinely needs attention on Vercel.

With fixture providers a whole batch finishes in about a second, so demo runs are awaited
inside the request and always complete. With **live** providers a 50-company batch takes
several minutes — far past any serverless function limit — and a detached promise can be
frozen the moment the response returns.

So for real batches, configure Trigger.dev:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest deploy
```

Set `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_REF` in Vercel, and set the same
provider and Supabase variables inside the Trigger.dev project — the tasks import the
pipeline from `src/`, so they need the same configuration the web app has.

The campaign dashboard states which runner is active, so you can confirm it took effect.

Without Trigger.dev you can still process live batches, in small chunks: select a handful
of companies rather than running all fifty at once.

### Authentication

With `DEMO_MODE=false` the app uses real Supabase Auth.

1. Supabase → Authentication → Providers → enable **Email**.
2. Create your first user under Authentication → Users.
3. Insert the matching profile row — campaign ownership is a foreign key onto `users`:

```sql
insert into users (id, email, full_name, role)
values ('<the-auth-user-uuid>', 'you@birdiemena.com', 'Your Name', 'admin');
```

---

## Costs

- **Vercel Hobby** — free, and enough for internal use. Note the 60-second function limit
  on Hobby; `vercel.json` requests 300s, which applies on Pro. With Trigger.dev handling
  batches this does not matter.
- **Supabase free tier** — 500MB database, comfortably enough for tens of thousands of
  companies.
- **Providers** — pay per use. Rough per-company cost for a full live run: three model
  calls, two PageSpeed calls, and roughly ten page fetches. Every call is recorded in the
  `provider_usage` table with its duration and outcome, so actual spend can be audited
  rather than estimated.

---

## If something breaks

| Symptom | Cause |
| --- | --- |
| Campaign disappears after creating it | Supabase not connected — running on the in-memory store |
| Every company flagged "no playbook matched" | `supabase/seed.sql` was not run |
| Batch starts but never finishes | Live providers without Trigger.dev — see above |
| Reports show fixture companies | `DEMO_MODE` is still `true` |
| `/settings` shows a provider as *disabled* | That key is missing; the page says what it costs you |
