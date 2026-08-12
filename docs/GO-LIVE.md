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

## What it costs

Figures below are approximate and were correct as of writing — check each provider's
current pricing before committing.

### Free, genuinely

- **Running locally.** `npm run dev` in demo mode costs nothing, forever, and exercises
  the entire product. If you only need it on one machine, stop here.
- **Google PageSpeed Insights.** Free API, roughly 25,000 requests/day. No card required.
- **The built-in HTTP scraper.** Used automatically when `FIRECRAWL_API_KEY` is absent.
  No JavaScript rendering and no screenshots, but no cost either.
- **Supabase free tier.** 500MB database — tens of thousands of companies. Note that free
  projects pause after about a week of inactivity; they wake on the next request, but the
  first one is slow.
- **Serper free tier.** Around 2,500 searches, one per company, so roughly 2,500 companies
  before you pay anything.

### The catch worth knowing about

**Vercel's Hobby plan is for non-commercial use only.** An internal tool for an agency is
commercial use, so hosting this on Vercel means **Pro, about $20/month per member**. That
is the single largest fixed cost, and it is easy to miss.

If that is unwelcome, the app is an ordinary Node server and runs anywhere:

| Option | Cost | Trade-off |
| --- | --- | --- |
| Any small VPS (Hetzner, DigitalOcean) | ~$5/month | You manage it — but the built-in job runner works properly on a long-running server, so **Trigger.dev is not needed at all** |
| Railway / Render | free tier to ~$5/month | Free tiers sleep when idle |
| Vercel Pro | ~$20/month/member | Zero maintenance; needs Trigger.dev for large batches |

A $5 VPS is genuinely simpler here than Vercel, because the serverless constraint is the
only reason Trigger.dev exists in this stack.

### Pay-per-use

- **OpenAI** — no free tier. Per company: up to 8 calls (sector, interpretation, up to
  five competitor validations, outreach). On a small model this lands in the region of a
  few US cents per company, so a 50-company batch is typically **under a dollar or two**.
- **Firecrawl** — the free allowance is a one-off, not monthly, and this app spends about
  20–25 credits per company (the site, its internal pages, and three competitors). A
  single 50-company batch is therefore ~1,000 credits: **the free tier will not cover even
  one batch.** Paid plans start around $16–20/month. Skipping it entirely is a legitimate
  choice — the built-in scraper takes over, and the settings page will say so.
- **Trigger.dev** — a free tier exists and is adequate for occasional batches. Only needed
  on serverless hosting.

### A realistic monthly figure

| Setup | Monthly |
| --- | --- |
| Local only, demo mode | **$0** |
| Local, real analysis, no Firecrawl | **$0 fixed** + a few dollars of OpenAI |
| $5 VPS, real analysis, no Firecrawl | **~$5** + OpenAI usage |
| Vercel Pro + Supabase free + Firecrawl | **~$40** + OpenAI usage |

Every provider call is recorded in the `provider_usage` table with its duration, outcome
and raw payload, so after the first real batch you can measure actual spend instead of
estimating it.

---

## If something breaks

| Symptom | Cause |
| --- | --- |
| Campaign disappears after creating it | Supabase not connected — running on the in-memory store |
| Every company flagged "no playbook matched" | `supabase/seed.sql` was not run |
| Batch starts but never finishes | Live providers without Trigger.dev — see above |
| Reports show fixture companies | `DEMO_MODE` is still `true` |
| `/settings` shows a provider as *disabled* | That key is missing; the page says what it costs you |
