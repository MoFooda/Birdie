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
import { createPlaywrightScraper, createPlaywrightScreenshot } from './playwright';
import { createDisabledVision, createFixtureVision, createOpenAiVision, visionRequirements } from './vision';

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
  return { name: base.name, live: false, capture: base.run as ScreenshotProvider['capture'] };
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
      vision: createFixtureVision(),
    };
    return cached;
  }

  // Playwright first when explicitly chosen: it renders JavaScript and captures real
  // screenshots without a per-page charge, which is what a vision pass needs.
  const usePlaywright = env.renderer === 'playwright';
  const scraper: ScraperProvider = usePlaywright
    ? createPlaywrightScraper()
    : env.firecrawlApiKey && env.renderer !== 'http'
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
    screenshot: usePlaywright
      ? createPlaywrightScreenshot()
      : env.firecrawlApiKey
        ? createFirecrawlScreenshot(env.firecrawlApiKey)
        : disabledScreenshot(
            'No renderer for screenshots. Set RENDERER=playwright (free) or FIRECRAWL_API_KEY.',
          ),
    // No key, no account, no cost — so it is always on outside demo mode.
    archive: createWaybackArchive(),
    // Vision needs two things at once: a model that can see, and a renderer that produces
    // a picture for it to look at. Missing either is reported, not worked around.
    vision: (() => {
      const blocked = visionRequirements(!!env.openaiApiKey, env.renderer, !!env.firecrawlApiKey);
      return blocked ? createDisabledVision(blocked) : createOpenAiVision(env.openaiApiKey!, env.visionModel);
    })(),
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
