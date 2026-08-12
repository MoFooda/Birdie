/**
 * Screenshot adapters.
 *
 * Screenshots are evidence: the report shows the reviewer what the audit saw, so a
 * finding can be checked by eye rather than taken on trust. In demo mode we render a
 * labelled placeholder rather than a fake browser capture — a fabricated screenshot
 * would be exactly the kind of invented evidence this product must not produce.
 */

import { fetchWithTimeout, retry, timed, type ScreenshotProvider } from './types';
import { findSiteSpec } from '@/fixtures/data';
import { normalizeDomain } from '@/core/domain';

export function createFixtureScreenshot(): ScreenshotProvider {
  return {
    name: 'fixture-screenshot',
    live: false,
    async capture(url, viewport) {
      return timed('fixture-screenshot', false, async () => {
        const domain = normalizeDomain(url).domain;
        const spec = domain ? findSiteSpec(domain) : null;
        if (!spec) throw new Error('no demo fixture for this domain');
        return { data: { url: `/api/demo/screenshot?domain=${encodeURIComponent(domain!)}&viewport=${viewport}` } };
      });
    },
  };
}

interface FirecrawlScreenshotResponse {
  success?: boolean;
  error?: string;
  data?: { screenshot?: string };
}

export function createFirecrawlScreenshot(apiKey: string, baseUrl = 'https://api.firecrawl.dev'): ScreenshotProvider {
  return {
    name: 'firecrawl-screenshot',
    live: true,
    async capture(url, viewport) {
      return timed('firecrawl-screenshot', true, async () => {
        const res = await retry(
          async () => {
            const r = await fetchWithTimeout(`${baseUrl}/v1/scrape`, {
              method: 'POST',
              timeoutMs: 60_000,
              headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                url,
                formats: ['screenshot'],
                mobile: viewport === 'mobile',
              }),
            });
            if (r.status === 429 || r.status >= 500) throw new Error(`firecrawl ${r.status}`);
            return r;
          },
          { attempts: 2, baseMs: 1_000 },
        );
        const json = (await res.json()) as FirecrawlScreenshotResponse;
        if (!res.ok || json.success === false || !json.data?.screenshot) {
          throw new Error(json.error ?? 'no screenshot returned');
        }
        return { data: { url: json.data.screenshot } };
      });
    },
  };
}
