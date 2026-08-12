/**
 * PageSpeed Insights adapters.
 *
 * When the API is unavailable the result carries `fetched: false` and the scoring engine
 * drops the performance item from the denominator. Performance we never measured must
 * not look like performance the site failed.
 */

import type { PageSpeedResult } from '@/core/audit-checks';
import { fetchWithTimeout, retry, timed, type PageSpeedProvider } from './types';
import { findSiteSpec } from '@/fixtures/data';
import { normalizeDomain } from '@/core/domain';

export function createFixturePageSpeed(): PageSpeedProvider {
  return {
    name: 'fixture-pagespeed',
    live: false,
    async audit(url, strategy) {
      return timed('fixture-pagespeed', false, async () => {
        const domain = normalizeDomain(url).domain;
        const spec = domain ? findSiteSpec(domain) : null;
        const score = spec
          ? strategy === 'mobile'
            ? (spec.pagespeed_mobile ?? null)
            : (spec.pagespeed_desktop ?? null)
          : null;

        if (score == null) {
          const missing: PageSpeedResult = {
            strategy,
            performance_score: null,
            lcp_ms: null,
            cls: null,
            tbt_ms: null,
            fetched: false,
            error: 'no demo PageSpeed data for this domain',
          };
          return { data: missing };
        }

        // Derive plausible field metrics from the score so the UI shows a coherent picture.
        const data: PageSpeedResult = {
          strategy,
          performance_score: score,
          lcp_ms: Math.round(6500 - score * 45),
          cls: Number(Math.max(0, (100 - score) / 500).toFixed(3)),
          tbt_ms: Math.round(Math.max(0, (100 - score) * 12)),
          fetched: true,
          error: null,
        };
        return { data };
      });
    },
  };
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, { numericValue?: number }>;
  };
  error?: { message?: string };
}

export function createGooglePageSpeed(apiKey: string): PageSpeedProvider {
  return {
    name: 'google-pagespeed',
    live: true,
    async audit(url, strategy) {
      return timed('google-pagespeed', true, async () => {
        const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
        endpoint.searchParams.set('url', url);
        endpoint.searchParams.set('strategy', strategy);
        endpoint.searchParams.set('category', 'performance');
        endpoint.searchParams.set('key', apiKey);

        const res = await retry(
          async () => {
            // PSI runs a full Lighthouse pass; it is slow and rate-limited by design.
            const r = await fetchWithTimeout(endpoint.toString(), { timeoutMs: 90_000 });
            if (r.status === 429 || r.status >= 500) throw new Error(`pagespeed ${r.status}`);
            return r;
          },
          { attempts: 3, baseMs: 2_000 },
        );

        const json = (await res.json()) as PsiResponse;
        if (!res.ok || json.error) throw new Error(json.error?.message ?? `pagespeed returned ${res.status}`);

        const lh = json.lighthouseResult;
        const raw = lh?.categories?.performance?.score;
        const data: PageSpeedResult = {
          strategy,
          performance_score: typeof raw === 'number' ? Math.round(raw * 100) : null,
          lcp_ms: lh?.audits?.['largest-contentful-paint']?.numericValue ?? null,
          cls: lh?.audits?.['cumulative-layout-shift']?.numericValue ?? null,
          tbt_ms: lh?.audits?.['total-blocking-time']?.numericValue ?? null,
          fetched: true,
          error: null,
        };
        return { data, raw: { categories: lh?.categories } };
      });
    },
  };
}
