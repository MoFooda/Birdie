/**
 * Environment configuration.
 *
 * Server-only. Nothing here is imported from a client component, so provider secrets
 * and the Supabase service-role key never reach the browser bundle.
 */

import 'server-only';

function flag(value: string | undefined, fallback = false): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const env = {
  demoMode: flag(process.env.DEMO_MODE, true),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',

  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'website-screenshots',

  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  /**
   * Which renderer handles crawling and screenshots.
   * 'playwright' runs Chromium locally — full JS rendering and real screenshots at no
   * cost, but it needs a browser binary and roughly 400MB of memory per instance.
   * 'auto' prefers Firecrawl when a key exists, otherwise the plain HTTP scraper.
   */
  renderer: (process.env.RENDERER ?? 'auto') as 'auto' | 'playwright' | 'firecrawl' | 'http',
  pagespeedApiKey: process.env.PAGESPEED_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  serperApiKey: process.env.SERPER_API_KEY ?? '',

  triggerSecretKey: process.env.TRIGGER_SECRET_KEY ?? '',
  triggerProjectRef: process.env.TRIGGER_PROJECT_REF ?? '',

  /** Per-provider concurrency for a batch run. */
  pipelineConcurrency: Number(process.env.PIPELINE_CONCURRENCY ?? 4),
  /** Companies allowed in one import. */
  maxCompaniesPerBatch: Number(process.env.MAX_COMPANIES_PER_BATCH ?? 50),
} as const;

export const hasSupabase = () => !!env.supabaseUrl && !!env.supabaseAnonKey;
export const hasSupabaseAdmin = () => hasSupabase() && !!env.supabaseServiceRoleKey;

/** What the settings page shows for each external dependency. */
export interface ConnectionStatus {
  key: string;
  label: string;
  configured: boolean;
  mode: 'live' | 'fixture' | 'fallback' | 'disabled';
  detail: string;
}

export function connectionStatuses(): ConnectionStatus[] {
  const demo = env.demoMode;
  return [
    {
      key: 'supabase',
      label: 'Supabase (database, auth, storage)',
      configured: hasSupabase(),
      mode: hasSupabaseAdmin() ? 'live' : 'fixture',
      detail: hasSupabaseAdmin()
        ? 'Connected. Data persists here regardless of demo mode — demo mode only changes the providers.'
        : hasSupabase()
          ? 'URL and anon key present, but the service-role key is missing, so writes fall back to the in-memory store.'
          : 'Not configured — running on the in-memory store. Fine locally; on a serverless host state will not survive between requests.',
    },
    {
      key: 'renderer',
      label: 'Renderer (crawling and screenshots)',
      configured: env.renderer === 'playwright' || !!env.firecrawlApiKey,
      mode: demo ? 'fixture' : env.renderer === 'playwright' || env.firecrawlApiKey ? 'live' : 'fallback',
      detail: demo
        ? 'Demo mode: fixture websites are served from local data.'
        : env.renderer === 'playwright'
          ? 'Self-hosted Playwright: full JavaScript rendering and real screenshots, at no per-page cost.'
          : env.firecrawlApiKey
            ? 'Firecrawl: JavaScript rendering and screenshots, billed per page.'
            : 'Built-in HTTP scraper — no JavaScript rendering and no screenshots. Client-rendered sites will look emptier than they are. Set RENDERER=playwright to fix this for free.',
    },
    {
      key: 'pagespeed',
      label: 'Google PageSpeed Insights',
      configured: !!env.pagespeedApiKey,
      mode: demo ? 'fixture' : env.pagespeedApiKey ? 'live' : 'disabled',
      detail: demo
        ? 'Demo mode: fixture performance scores.'
        : env.pagespeedApiKey
          ? 'Live PageSpeed audits enabled.'
          : 'No key — performance is reported as not measured and excluded from scoring.',
    },
    {
      key: 'openai',
      label: 'OpenAI (analysis and outreach)',
      configured: !!env.openaiApiKey,
      mode: demo ? 'fixture' : env.openaiApiKey ? 'live' : 'disabled',
      detail: demo
        ? 'Demo mode: interpretations are derived deterministically from measured evidence.'
        : env.openaiApiKey
          ? `Live model: ${env.openaiModel}.`
          : 'No key — AI interpretation and outreach are reported as not run.',
    },
    {
      key: 'search',
      label: 'Search (competitor discovery)',
      configured: !!env.serperApiKey,
      mode: demo ? 'fixture' : env.serperApiKey ? 'live' : 'disabled',
      detail: demo
        ? 'Demo mode: competitor candidates come from the fixture pool.'
        : env.serperApiKey
          ? 'Serper search enabled.'
          : 'No key — competitor discovery is skipped and the limitation is reported on every company.',
    },
    {
      key: 'trigger',
      label: 'Trigger.dev (background jobs)',
      configured: !!env.triggerSecretKey,
      mode: env.triggerSecretKey ? 'live' : 'fallback',
      detail: env.triggerSecretKey
        ? 'Batches are dispatched to Trigger.dev tasks.'
        : 'No key — batches run on the built-in in-process runner with the same retry, concurrency and idempotency behaviour.',
    },
  ];
}
