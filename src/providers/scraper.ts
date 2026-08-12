/**
 * Website scraper adapters.
 *
 * Three implementations behind one port:
 *   - `fixture`   — demo mode, serves generated sites from `src/fixtures`
 *   - `firecrawl` — production crawling and rendering
 *   - `http`      — dependency-free fallback that fetches and parses directly
 *
 * All three respect the same contract: never throw, never bypass access controls, and
 * report *why* a fetch failed so the status classifier can tell "blocked" from "gone".
 */

import type { ScrapedPage, ScrapedSite } from '@/core/audit-checks';
import type { ProbeErrorCode, StatusProbe } from '@/core/website-status';
import { normalizeDomain } from '@/core/domain';
import { fetchWithTimeout, retry, timed, type ProviderResult, type ScraperProvider } from './types';
import { buildFixtureSite } from '@/fixtures/site-builder';
import { findSiteSpec } from '@/fixtures/data';

const USER_AGENT =
  'Mozilla/5.0 (compatible; WebsiteOpportunityEngine/1.0; +https://example.com/bot) AppleWebKit/537.36';

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
}

export function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  return m?.[1]?.trim() ?? null;
}

export function extractH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? extractText(m[1] ?? '') || null : null;
}

/** Guess a page's role from its URL so playbook page requirements can be matched. */
export function classifyPageType(url: string, isFirst: boolean): string {
  if (isFirst) return 'home';
  const path = url.replace(/^https?:\/\/[^/]+/i, '').toLowerCase();
  if (path === '' || path === '/') return 'home';
  if (/(about|who-we-are|our-story|من-نحن)/.test(path)) return 'about';
  if (/(contact|reach-us|اتصل)/.test(path)) return 'contact';
  if (/(service|solutions|treatments|خدمات)/.test(path)) return 'services';
  if (/(product|shop|store|catalog|collection|منتجات)/.test(path)) return 'products';
  if (/(pricing|plans|packages|أسعار)/.test(path)) return 'pricing';
  if (/(blog|news|insights|articles|مدونة)/.test(path)) return 'blog';
  return 'other';
}

/** Same-host internal links from a page, capped and de-duplicated. */
export function internalLinks(html: string, baseUrl: string, limit: number): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();
  const re = /<a\s[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && found.size < limit * 4) {
    const href = m[1]!;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const resolved = new URL(href, base);
      if (resolved.hostname !== base.hostname) continue;
      resolved.hash = '';
      resolved.search = '';
      if (resolved.pathname === '/' || resolved.pathname === base.pathname) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|docx?|xlsx?)$/i.test(resolved.pathname)) continue;
      found.add(resolved.toString());
    } catch {
      // Ignore malformed hrefs — a bad link is not worth failing the crawl.
    }
  }
  return [...found].slice(0, limit);
}

function classifyFetchError(err: unknown): { code: ProbeErrorCode; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: { code?: string } })?.cause?.code ?? '';
  const blob = `${message} ${cause}`.toUpperCase();

  if (blob.includes('ENOTFOUND') || blob.includes('EAI_AGAIN') || blob.includes('DNS')) {
    return { code: 'dns', message };
  }
  if (
    blob.includes('CERT') ||
    blob.includes('SSL') ||
    blob.includes('TLS') ||
    blob.includes('EPROTO') ||
    blob.includes('SELF_SIGNED')
  ) {
    return { code: 'ssl', message };
  }
  if (blob.includes('ABORT') || blob.includes('TIMEOUT') || blob.includes('ETIMEDOUT')) {
    return { code: 'timeout', message };
  }
  return { code: 'connection', message };
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Fixture scraper
// ---------------------------------------------------------------------------

export function createFixtureScraper(): ScraperProvider {
  return {
    name: 'fixture-scraper',
    live: false,
    async probe(domain) {
      return timed('fixture-scraper', false, async () => {
        // Callers pass whatever was in the CSV, so normalise before the fixture lookup.
        const key = normalizeDomain(domain).domain ?? domain;
        const spec = findSiteSpec(key);
        if (!spec) {
          // An unknown domain in demo mode behaves like an unresolvable one, which is
          // honest: we have no data for it and must not invent a healthy site.
          const probe: StatusProbe = {
            submittedDomain: domain,
            finalUrl: null,
            httpStatus: null,
            redirectChain: [],
            errorCode: 'dns',
            errorMessage: `no demo fixture exists for ${domain}`,
            html: null,
            textContent: null,
            title: null,
          };
          return { data: probe };
        }
        return { data: buildFixtureSite(spec).probe };
      });
    },
    async scrapeSite(domain) {
      return timed('fixture-scraper', false, async () => {
        // Callers pass whatever was in the CSV, so normalise before the fixture lookup.
        const key = normalizeDomain(domain).domain ?? domain;
        const spec = findSiteSpec(key);
        if (!spec) throw new Error(`no demo fixture exists for ${domain}`);
        const built = buildFixtureSite(spec);
        if (!built.site) throw new Error(`the demo site for ${domain} serves no readable content`);
        return { data: built.site };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Direct HTTP scraper (no third-party dependency)
// ---------------------------------------------------------------------------

export function createHttpScraper(options: { timeoutMs?: number } = {}): ScraperProvider {
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function fetchPage(url: string): Promise<{
    finalUrl: string;
    status: number;
    html: string;
    headers: Record<string, string>;
    redirectChain: string[];
  }> {
    const redirectChain: string[] = [];
    let current = url;

    for (let hop = 0; hop < 6; hop += 1) {
      const res = await fetchWithTimeout(current, {
        timeoutMs,
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        redirectChain.push(current);
        current = new URL(location, current).toString();
        continue;
      }
      const html = res.headers.get('content-type')?.includes('text/') ? await res.text() : '';
      return {
        finalUrl: current,
        status: res.status,
        html,
        headers: headersToObject(res.headers),
        redirectChain: redirectChain.length ? [...redirectChain, current] : [],
      };
    }
    throw new Error('too many redirects');
  }

  return {
    name: 'http-scraper',
    live: true,
    async probe(domain) {
      const normalized = normalizeDomain(domain);
      const started = Date.now();
      if (!normalized.ok || !normalized.url) {
        return {
          ok: true,
          data: {
            submittedDomain: domain,
            finalUrl: null,
            httpStatus: null,
            redirectChain: [],
            errorCode: null,
            html: null,
            textContent: null,
            title: null,
          },
          error: null,
          provider: 'http-scraper',
          live: true,
          duration_ms: Date.now() - started,
        };
      }
      try {
        const page = await retry(() => fetchPage(normalized.url!), {
          attempts: 2,
          shouldRetry: (err) => classifyFetchError(err).code === 'timeout',
        });
        return {
          ok: true,
          data: {
            submittedDomain: domain,
            finalUrl: page.finalUrl,
            httpStatus: page.status,
            redirectChain: page.redirectChain,
            errorCode: null,
            html: page.html,
            textContent: extractText(page.html),
            title: extractTitle(page.html),
            headers: page.headers,
          },
          error: null,
          provider: 'http-scraper',
          live: true,
          duration_ms: Date.now() - started,
          raw: { status: page.status, headers: page.headers },
        };
      } catch (err) {
        const { code, message } = classifyFetchError(err);
        // A transport failure is still a successful *measurement* — we learned the site
        // does not resolve/handshake/respond, which the classifier needs.
        return {
          ok: true,
          data: {
            submittedDomain: domain,
            finalUrl: null,
            httpStatus: null,
            redirectChain: [],
            errorCode: code,
            errorMessage: message,
            html: null,
            textContent: null,
            title: null,
          },
          error: null,
          provider: 'http-scraper',
          live: true,
          duration_ms: Date.now() - started,
        };
      }
    },

    async scrapeSite(domain, opts) {
      const maxPages = opts?.maxPages ?? 6;
      return timed('http-scraper', true, async () => {
        const normalized = normalizeDomain(domain);
        if (!normalized.ok || !normalized.url) throw new Error('domain could not be normalised');

        const home = await fetchPage(normalized.url);
        const pages: ScrapedPage[] = [
          {
            url: home.finalUrl,
            page_type: 'home',
            status_code: home.status,
            html: home.html,
            text: extractText(home.html),
            title: extractTitle(home.html),
            meta_description: extractMetaDescription(home.html),
            h1: extractH1(home.html),
          },
        ];

        for (const link of internalLinks(home.html, home.finalUrl, maxPages - 1)) {
          try {
            const page = await fetchPage(link);
            pages.push({
              url: page.finalUrl,
              page_type: classifyPageType(page.finalUrl, false),
              status_code: page.status,
              html: page.html,
              text: extractText(page.html),
              title: extractTitle(page.html),
              meta_description: extractMetaDescription(page.html),
              h1: extractH1(page.html),
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

        let robots: string | null = null;
        let sitemap: string | null = null;
        try {
          const res = await fetchWithTimeout(new URL('/robots.txt', home.finalUrl).toString(), {
            timeoutMs: 8_000,
            headers: { 'user-agent': USER_AGENT },
          });
          if (res.ok) {
            robots = await res.text();
            sitemap = robots.match(/^sitemap:\s*(\S+)/im)?.[1] ?? null;
          }
        } catch {
          // robots.txt is optional; its absence is reported as "not measured".
        }
        if (!sitemap) {
          try {
            const res = await fetchWithTimeout(new URL('/sitemap.xml', home.finalUrl).toString(), {
              timeoutMs: 8_000,
              method: 'HEAD',
              headers: { 'user-agent': USER_AGENT },
            });
            if (res.ok) sitemap = new URL('/sitemap.xml', home.finalUrl).toString();
          } catch {
            /* no sitemap */
          }
        }

        const site: ScrapedSite = {
          final_url: home.finalUrl,
          pages,
          robots_txt: robots,
          sitemap_url: sitemap,
          headers: home.headers,
          screenshot_mobile_url: null,
          screenshot_desktop_url: null,
        };
        return { data: site };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Firecrawl
// ---------------------------------------------------------------------------

interface FirecrawlScrapeResponse {
  success?: boolean;
  error?: string;
  data?: {
    html?: string;
    rawHtml?: string;
    markdown?: string;
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      url?: string;
      statusCode?: number;
    };
  };
}

export function createFirecrawlScraper(apiKey: string, baseUrl = 'https://api.firecrawl.dev'): ScraperProvider {
  async function scrapeOne(url: string, screenshot: boolean): Promise<FirecrawlScrapeResponse> {
    const res = await retry(
      async () => {
        const r = await fetchWithTimeout(`${baseUrl}/v1/scrape`, {
          method: 'POST',
          timeoutMs: 45_000,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            url,
            formats: screenshot ? ['rawHtml', 'markdown', 'screenshot'] : ['rawHtml', 'markdown'],
            onlyMainContent: false,
            timeout: 30_000,
          }),
        });
        if (r.status === 429 || r.status >= 500) throw new Error(`firecrawl ${r.status}`);
        return r;
      },
      { attempts: 3, baseMs: 800 },
    );
    const json = (await res.json()) as FirecrawlScrapeResponse;
    if (!res.ok || json.success === false) {
      throw new Error(json.error ?? `firecrawl returned ${res.status}`);
    }
    return json;
  }

  const http = createHttpScraper();

  return {
    name: 'firecrawl',
    live: true,
    async probe(domain) {
      const normalized = normalizeDomain(domain);
      const started = Date.now();
      if (!normalized.ok || !normalized.url) {
        return {
          ok: true,
          data: {
            submittedDomain: domain,
            finalUrl: null,
            httpStatus: null,
            redirectChain: [],
            errorCode: null,
            html: null,
            textContent: null,
            title: null,
          },
          error: null,
          provider: 'firecrawl',
          live: true,
          duration_ms: Date.now() - started,
        };
      }
      try {
        const json = await scrapeOne(normalized.url, false);
        const html = json.data?.rawHtml ?? json.data?.html ?? '';
        const finalUrl = json.data?.metadata?.sourceURL ?? json.data?.metadata?.url ?? normalized.url;
        return {
          ok: true,
          data: {
            submittedDomain: domain,
            finalUrl,
            httpStatus: json.data?.metadata?.statusCode ?? 200,
            redirectChain: finalUrl !== normalized.url ? [normalized.url, finalUrl] : [],
            errorCode: null,
            html,
            textContent: json.data?.markdown ?? extractText(html),
            title: json.data?.metadata?.title ?? extractTitle(html),
          },
          error: null,
          provider: 'firecrawl',
          live: true,
          duration_ms: Date.now() - started,
          raw: json.data?.metadata ?? null,
        };
      } catch {
        // Firecrawl abstracts transport errors away, so fall back to a direct probe to
        // learn whether this is DNS, TLS, a timeout or a block.
        return http.probe(domain);
      }
    },

    async scrapeSite(domain, opts) {
      const maxPages = opts?.maxPages ?? 6;
      return timed('firecrawl', true, async () => {
        const normalized = normalizeDomain(domain);
        if (!normalized.ok || !normalized.url) throw new Error('domain could not be normalised');

        const homeJson = await scrapeOne(normalized.url, true);
        const homeHtml = homeJson.data?.rawHtml ?? homeJson.data?.html ?? '';
        const finalUrl = homeJson.data?.metadata?.sourceURL ?? normalized.url;

        const pages: ScrapedPage[] = [
          {
            url: finalUrl,
            page_type: 'home',
            status_code: homeJson.data?.metadata?.statusCode ?? 200,
            html: homeHtml,
            text: homeJson.data?.markdown ?? extractText(homeHtml),
            title: homeJson.data?.metadata?.title ?? extractTitle(homeHtml),
            meta_description: homeJson.data?.metadata?.description ?? extractMetaDescription(homeHtml),
            h1: extractH1(homeHtml),
          },
        ];

        for (const link of internalLinks(homeHtml, finalUrl, maxPages - 1)) {
          try {
            const json = await scrapeOne(link, false);
            const html = json.data?.rawHtml ?? json.data?.html ?? '';
            pages.push({
              url: link,
              page_type: classifyPageType(link, false),
              status_code: json.data?.metadata?.statusCode ?? 200,
              html,
              text: json.data?.markdown ?? extractText(html),
              title: json.data?.metadata?.title ?? extractTitle(html),
              meta_description: json.data?.metadata?.description ?? extractMetaDescription(html),
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
          headers: {},
          screenshot_mobile_url: null,
          screenshot_desktop_url: homeJson.data?.screenshot ?? null,
        };
        return { data: site, raw: homeJson.data?.metadata ?? null };
      });
    },
  };
}

export type { ProviderResult };
