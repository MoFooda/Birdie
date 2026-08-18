/**
 * Self-hosted rendering via Playwright.
 *
 * Does everything Firecrawl does for this product — runs JavaScript, so client-rendered
 * sites are read as a visitor sees them, and captures real screenshots — at no cost on any
 * server that can run Chromium.
 *
 * It is opt-in for two reasons: it needs a browser binary, and it needs memory (roughly
 * 400MB per instance). Set `RENDERER=playwright` to enable it. If the package or the
 * browser is missing, every method reports that plainly and the caller falls back — it
 * never pretends to have rendered a page it could not open.
 *
 * Setup on a server:
 *   npm install playwright-core
 *   npx playwright install --with-deps chromium
 */

import type { Browser, BrowserContext, Page, Response as PwResponse } from 'playwright-core';
import type { ScrapedPage, ScrapedSite } from '@/core/audit-checks';
import type { ProbeErrorCode, StatusProbe } from '@/core/website-status';
import { normalizeDomain } from '@/core/domain';
import { timed, type ProviderResult, type ScraperProvider, type ScreenshotProvider } from './types';
import { classifyPageType, extractH1, extractMetaDescription, extractText, extractTitle, internalLinks } from './scraper';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; WebsiteOpportunityEngine/1.0)';

const NAV_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Browser lifecycle — one instance, reused, closed on exit
// ---------------------------------------------------------------------------

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright-core');
      const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
      const browser = await chromium.launch({
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      // A crashed browser must not poison every later call with a dead handle.
      browser.on('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  const current = browserPromise;
  browserPromise = null;
  if (current) {
    const browser = await current.catch(() => null);
    await browser?.close().catch(() => undefined);
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'beforeExit'] as const) {
  process.once(signal, () => void closeBrowser());
}

const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
} as const;

async function withPage<T>(
  viewport: 'mobile' | 'desktop',
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const config = VIEWPORTS[viewport];
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: config.deviceScaleFactor,
      isMobile: config.isMobile,
      hasTouch: config.isMobile,
      ignoreHTTPSErrors: false,
      locale: 'en-US',
    });
    context.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await context?.close().catch(() => undefined);
  }
}

/** Map a Playwright navigation failure onto the probe's error taxonomy. */
function classifyNavError(err: unknown): { code: ProbeErrorCode; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const blob = message.toUpperCase();
  if (blob.includes('ERR_NAME_NOT_RESOLVED') || blob.includes('ERR_NAME_RESOLUTION')) {
    return { code: 'dns', message };
  }
  if (
    blob.includes('ERR_CERT') ||
    blob.includes('ERR_SSL') ||
    blob.includes('SSL_ERROR') ||
    blob.includes('ERR_BAD_SSL')
  ) {
    return { code: 'ssl', message };
  }
  if (blob.includes('TIMEOUT') || blob.includes('ERR_TIMED_OUT')) return { code: 'timeout', message };
  return { code: 'connection', message };
}

/** Settle the page: DOM ready, then a short grace period for client-side rendering. */
async function settle(page: Page, url: string): Promise<PwResponse | null> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  return response;
}

export interface RenderedPage {
  final_url: string;
  status: number | null;
  html: string;
  title: string | null;
  headers: Record<string, string>;
  redirect_chain: string[];
  screenshots: CapturedScreenshots | null;
}

/**
 * Render one URL and read it back.
 *
 * Takes a URL rather than a domain on purpose: the provider methods below normalise
 * first — which is where private hosts and junk input get rejected — and this layer just
 * does the rendering. Keeping them apart means the validation lives in exactly one place
 * and this part stays directly testable.
 */
export async function renderPage(
  url: string,
  viewport: 'mobile' | 'desktop' = 'mobile',
  options: { screenshots?: boolean } = {},
): Promise<RenderedPage> {
  return withPage(viewport, async (page) => {
    const response = await settle(page, url);
    const html = await page.content();
    return {
      final_url: page.url(),
      status: response?.status() ?? null,
      html,
      title: await page.title().catch(() => extractTitle(html)),
      headers: response ? await response.allHeaders().catch(() => ({})) : {},
      redirect_chain: redirectChain(response),
      screenshots: options.screenshots ? await capturePage(page) : null,
    };
  });
}

function redirectChain(response: PwResponse | null): string[] {
  const chain: string[] = [];
  let request = response?.request() ?? null;
  while (request) {
    chain.unshift(request.url());
    request = request.redirectedFrom();
  }
  return chain.length > 1 ? chain : [];
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

/**
 * Compress to a data URI small enough to store inline and cheap enough to send to a
 * vision model. Full-page captures of long sites are clipped rather than downscaled into
 * illegibility — a screenshot nobody can read is not evidence.
 */
async function toDataUri(buffer: Buffer, width: number): Promise<string> {
  const sharp = (await import('sharp')).default;
  const output = await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${output.toString('base64')}`;
}

export interface CapturedScreenshots {
  above_fold: string | null;
  full_page: string | null;
}

async function capturePage(page: Page): Promise<CapturedScreenshots> {
  const aboveFold = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null);
  const fullPage = await page
    .screenshot({ type: 'png', fullPage: true, timeout: 20_000 })
    .catch(() => null);

  return {
    above_fold: aboveFold ? await toDataUri(aboveFold, 900) : null,
    full_page: fullPage ? await toDataUri(fullPage, 800) : null,
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export function createPlaywrightScraper(): ScraperProvider {
  return {
    name: 'playwright',
    live: true,

    async probe(domain) {
      const normalized = normalizeDomain(domain);
      const started = Date.now();

      const asProbe = (data: StatusProbe): ProviderResult<StatusProbe> => ({
        ok: true,
        data,
        error: null,
        provider: 'playwright',
        live: true,
        duration_ms: Date.now() - started,
      });

      if (!normalized.ok || !normalized.url) {
        return asProbe({
          submittedDomain: domain,
          finalUrl: null,
          httpStatus: null,
          redirectChain: [],
          errorCode: null,
          html: null,
          textContent: null,
          title: null,
        });
      }

      try {
        const rendered = await renderPage(normalized.url);
        return asProbe({
          submittedDomain: domain,
          finalUrl: rendered.final_url,
          httpStatus: rendered.status,
          redirectChain: rendered.redirect_chain,
          errorCode: null,
          html: rendered.html,
          textContent: extractText(rendered.html),
          title: rendered.title,
          headers: rendered.headers,
        });
      } catch (err) {
        const { code, message } = classifyNavError(err);
        // A transport failure is still a successful measurement: we learned the site does
        // not resolve, handshake or respond.
        return asProbe({
          submittedDomain: domain,
          finalUrl: null,
          httpStatus: null,
          redirectChain: [],
          errorCode: code,
          errorMessage: message,
          html: null,
          textContent: null,
          title: null,
        });
      }
    },

    async scrapeSite(domain, opts) {
      const maxPages = opts?.maxPages ?? 6;
      return timed('playwright', true, async () => {
        const normalized = normalizeDomain(domain);
        if (!normalized.ok || !normalized.url) throw new Error('domain could not be normalised');

        return withPage('mobile', async (page) => {
          const response = await settle(page, normalized.url!);
          const finalUrl = page.url();
          const homeHtml = await page.content();

          // Screenshots come from the same visit rather than a second page load.
          const shots = await capturePage(page);

          const pages: ScrapedPage[] = [
            {
              url: finalUrl,
              page_type: 'home',
              status_code: response?.status() ?? null,
              html: homeHtml,
              text: extractText(homeHtml),
              title: await page.title().catch(() => extractTitle(homeHtml)),
              meta_description: extractMetaDescription(homeHtml),
              h1: extractH1(homeHtml),
            },
          ];

          for (const link of internalLinks(homeHtml, finalUrl, maxPages - 1)) {
            try {
              const res = await settle(page, link);
              const html = await page.content();
              pages.push({
                url: page.url(),
                page_type: classifyPageType(link, false),
                status_code: res?.status() ?? null,
                html,
                text: extractText(html),
                title: await page.title().catch(() => extractTitle(html)),
                meta_description: extractMetaDescription(html),
                h1: extractH1(html),
              });
            } catch {
              pages.push({
                url: link,
                page_type: classifyPageType(link, false),
                status_code: null,
                html: '',
                text: '',
                title: null,
                meta_description: null,
                h1: null,
              });
            }
          }

          const site: ScrapedSite = {
            final_url: finalUrl,
            pages,
            robots_txt: null,
            sitemap_url: null,
            headers: response ? await response.allHeaders().catch(() => ({})) : {},
            screenshot_mobile_url: shots.above_fold,
            screenshot_desktop_url: shots.full_page,
          };
          return { data: site };
        });
      });
    },
  };
}

export function createPlaywrightScreenshot(): ScreenshotProvider {
  return {
    name: 'playwright-screenshot',
    live: true,
    async capture(url, viewport) {
      return timed('playwright-screenshot', true, async () => {
        return withPage(viewport, async (page) => {
          await settle(page, url);
          const shots = await capturePage(page);
          const chosen = viewport === 'desktop' ? (shots.full_page ?? shots.above_fold) : shots.above_fold;
          if (!chosen) throw new Error('screenshot could not be captured');
          return { data: { url: chosen } };
        });
      });
    },
  };
}

/** True when the package is installed and a browser can actually be launched. */
export async function playwrightAvailable(): Promise<{ ok: boolean; reason: string }> {
  try {
    await import('playwright-core');
  } catch {
    return { ok: false, reason: 'playwright-core is not installed (npm install playwright-core)' };
  }
  try {
    await getBrowser();
    return { ok: true, reason: 'Chromium launched successfully' };
  } catch (err) {
    return {
      ok: false,
      reason: `Chromium could not launch: ${err instanceof Error ? err.message : String(err)}. Run: npx playwright install --with-deps chromium`,
    };
  }
}
