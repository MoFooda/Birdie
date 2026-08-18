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
            accessibility_score: null,
            seo_score: null,
            best_practices_score: null,
            lcp_ms: null,
            cls: null,
            tbt_ms: null,
            fetched: false,
            error: 'no demo PageSpeed data for this domain',
          };
          return { data: missing };
        }

        // Derive plausible field metrics from the score so the UI shows a coherent picture.
        const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
        const data: PageSpeedResult = {
          strategy,
          performance_score: score,
          // Correlated with performance but not identical, the way real sites behave.
          accessibility_score: clamp(score * 0.8 + 15),
          seo_score: clamp(score * 0.6 + 35),
          best_practices_score: clamp(score * 0.7 + 22),
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
    categories?: {
      performance?: { score?: number };
      accessibility?: { score?: number };
      seo?: { score?: number };
      'best-practices'?: { score?: number };
    };
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
        // All four categories arrive in one response and cost no extra quota.
        for (const category of ['performance', 'accessibility', 'seo', 'best-practices']) {
          endpoint.searchParams.append('category', category);
        }
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
        const pct = (score: number | undefined) => (typeof score === 'number' ? Math.round(score * 100) : null);
        const data: PageSpeedResult = {
          strategy,
          performance_score: pct(lh?.categories?.performance?.score),
          accessibility_score: pct(lh?.categories?.accessibility?.score),
          seo_score: pct(lh?.categories?.seo?.score),
          best_practices_score: pct(lh?.categories?.['best-practices']?.score),
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
