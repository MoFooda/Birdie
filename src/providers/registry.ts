/**
 * Provider selection.
 *
 * Demo mode forces every provider to its fixture adapter, which is what makes the app
 * runnable with no secrets at all. Outside demo mode each provider independently picks
 * live, fallback or disabled based on which keys are present — a missing OpenAI key
 * does not stop the technical audit from running.
 */

import 'server-only';
import { env } from '@/lib/env';
import type { AiProvider, PageSpeedProvider, Providers, ScraperProvider, ScreenshotProvider, SearchProvider } from './types';
import { createFirecrawlScraper, createFixtureScraper, createHttpScraper } from './scraper';
import { createFixtureSearch, createSerperSearch } from './search';
import { createFixturePageSpeed, createGooglePageSpeed } from './pagespeed';
import { createFixtureAi, createOpenAiProvider } from './ai';
import { createFirecrawlScreenshot, createFixtureScreenshot } from './screenshot';
import { createFixtureArchive, createWaybackArchive } from './archive';

/** A provider that is intentionally not configured. Reports `not_run`, never fabricates. */
function unavailable(name: string, reason: string) {
  return {
    name,
    live: false,
    async run() {
      return { ok: false, data: null, error: reason, provider: name, live: false, duration_ms: 0 };
    },
  };
}

function disabledSearch(reason: string): SearchProvider {
  const base = unavailable('search-disabled', reason);
  return { name: base.name, live: false, search: base.run };
}

function disabledPageSpeed(reason: string): PageSpeedProvider {
  const base = unavailable('pagespeed-disabled', reason);
  return { name: base.name, live: false, audit: base.run };
}

function disabledAi(reason: string): AiProvider {
  const base = unavailable('ai-disabled', reason);
  return { name: base.name, live: false, generate: base.run as AiProvider['generate'] };
}

function disabledScreenshot(reason: string): ScreenshotProvider {
  const base = unavailable('screenshot-disabled', reason);
  return { name: base.name, live: false, capture: base.run };
}

let cached: Providers | null = null;

export function getProviders(): Providers {
  if (cached) return cached;

  if (env.demoMode) {
    cached = {
      scraper: createFixtureScraper(),
      search: createFixtureSearch(),
      pagespeed: createFixturePageSpeed(),
      ai: createFixtureAi(),
      screenshot: createFixtureScreenshot(),
      archive: createFixtureArchive(),
    };
    return cached;
  }

  const scraper: ScraperProvider = env.firecrawlApiKey
    ? createFirecrawlScraper(env.firecrawlApiKey)
    : createHttpScraper();

  cached = {
    scraper,
    search: env.serperApiKey
      ? createSerperSearch(env.serperApiKey)
      : disabledSearch('SERPER_API_KEY is not set, so competitor discovery did not run.'),
    pagespeed: env.pagespeedApiKey
      ? createGooglePageSpeed(env.pagespeedApiKey)
      : disabledPageSpeed('PAGESPEED_API_KEY is not set, so performance was not measured.'),
    ai: env.openaiApiKey
      ? createOpenAiProvider(env.openaiApiKey, env.openaiModel)
      : disabledAi('OPENAI_API_KEY is not set, so AI interpretation did not run.'),
    screenshot: env.firecrawlApiKey
      ? createFirecrawlScreenshot(env.firecrawlApiKey)
      : disabledScreenshot('FIRECRAWL_API_KEY is not set, so no screenshot was captured.'),
    // No key, no account, no cost — so it is always on outside demo mode.
    archive: createWaybackArchive(),
  };
  return cached;
}

/** Test seam: install explicit providers (mocks, partial failures) for one run. */
export function setProviders(providers: Providers): void {
  cached = providers;
}

export function resetProviders(): void {
  cached = null;
}
