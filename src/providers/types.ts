/**
 * Provider ports.
 *
 * Business logic depends only on these interfaces, never on Firecrawl, Google or OpenAI
 * directly, so a provider can be swapped or run from fixtures without touching the
 * pipeline. Every method resolves — providers report failure in the return value rather
 * than throwing, because a failed provider must degrade one company, not the campaign.
 */

import type { ScrapedSite, PageSpeedResult } from '@/core/audit-checks';
import type { StatusProbe } from '@/core/website-status';
import type { ArchiveProvider } from './archive';
import type { VisionProvider } from './vision';
import type { z } from 'zod';

export interface ProviderMeta {
  name: string;
  /** False when the adapter is serving fixtures rather than live data. */
  live: boolean;
}

export interface ProviderResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  provider: string;
  live: boolean;
  duration_ms: number;
  /** Raw upstream payload, persisted separately from normalised business data. */
  raw?: unknown;
}

export interface ScraperProvider extends ProviderMeta {
  /** Fetch the homepage and report everything needed to classify website status. */
  probe(domain: string): Promise<ProviderResult<StatusProbe>>;
  /** Crawl a small, bounded set of pages for the audit. */
  scrapeSite(domain: string, options?: { maxPages?: number }): Promise<ProviderResult<ScrapedSite>>;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider extends ProviderMeta {
  search(query: string, options?: { limit?: number; country?: string }): Promise<ProviderResult<SearchResult[]>>;
}

export interface PageSpeedProvider extends ProviderMeta {
  audit(url: string, strategy: 'mobile' | 'desktop'): Promise<ProviderResult<PageSpeedResult>>;
}

export interface AiRequest<T> {
  /** Used by fixture providers to pick a canned response and by logs to identify the call. */
  operation: 'sector_detection' | 'website_assessment' | 'competitor_candidates' | 'competitor_validation' | 'outreach';
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  /** Opaque context the fixture provider uses to shape a realistic canned answer. */
  context?: Record<string, unknown>;
}

export interface AiProvider extends ProviderMeta {
  generate<T>(request: AiRequest<T>): Promise<ProviderResult<T>>;
}

export interface CapturedShot {
  /** What fits on the first screen — the only part most visitors ever see. */
  url: string;
  /**
   * The whole page in one image, captured in the *same* visit rather than a second one,
   * so asking for it costs one page load and one Firecrawl credit rather than two.
   * Null unless `fullPage` was requested, or when the capture of it failed.
   */
  full_page: string | null;
}

export interface ScreenshotProvider extends ProviderMeta {
  capture(
    url: string,
    viewport: 'mobile' | 'desktop',
    options?: { fullPage?: boolean },
  ): Promise<ProviderResult<CapturedShot>>;
}

export interface Providers {
  scraper: ScraperProvider;
  search: SearchProvider;
  pagespeed: PageSpeedProvider;
  ai: AiProvider;
  screenshot: ScreenshotProvider;
  /** Wayback Machine history — free, no key, and reports its own absence. */
  archive: ArchiveProvider;
  /** Looks at the rendered page as a picture. Reports `not_run` when it has no image. */
  vision: VisionProvider;
}

export type { VisionProvider } from './vision';

/** Helper so adapters report timing and failure consistently. */
export async function timed<T>(
  provider: string,
  live: boolean,
  fn: () => Promise<{ data: T; raw?: unknown }>,
): Promise<ProviderResult<T>> {
  const started = Date.now();
  try {
    const { data, raw } = await fn();
    return { ok: true, data, error: null, provider, live, duration_ms: Date.now() - started, raw };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      provider,
      live,
      duration_ms: Date.now() - started,
    };
  }
}

/** Fetch with a hard timeout so one unresponsive host cannot stall a batch. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Exponential backoff with jitter, used for transient upstream failures and 429s. */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: { attempts?: number; baseMs?: number; shouldRetry?: (err: unknown) => boolean } = {},
): Promise<T> {
  const { attempts = 3, baseMs = 400, shouldRetry = () => true } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !shouldRetry(err)) break;
      const delay = baseMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
