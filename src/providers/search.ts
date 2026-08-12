/**
 * Search adapters, used for competitor discovery.
 *
 * A search hit is only a *candidate*. Nothing in this file decides that a result is a
 * competitor — validation happens downstream against sub-sector, geography and business
 * model, precisely because "it came back in a search" is not evidence of relevance.
 */

import { fetchWithTimeout, retry, timed, type SearchProvider, type SearchResult } from './types';
import { COMPETITOR_POOLS } from '@/fixtures/data';

export function createFixtureSearch(): SearchProvider {
  return {
    name: 'fixture-search',
    live: false,
    async search(query, options) {
      return timed('fixture-search', false, async () => {
        const limit = options?.limit ?? 5;
        const q = query.toLowerCase();

        // The pool key is passed through the query by the discovery step so demo results
        // stay coherent with the company being analysed.
        const poolKey = Object.keys(COMPETITOR_POOLS).find((k) => q.includes(k));
        const pool = poolKey ? COMPETITOR_POOLS[poolKey]! : [];

        const results: SearchResult[] = pool.slice(0, limit).map((c) => ({
          title: c.name,
          url: `https://${c.domain}`,
          snippet: `${c.snippet} — ${c.sub_sector}, ${c.geography}`,
        }));
        return { data: results };
      });
    },
  };
}

interface SerperResponse {
  organic?: Array<{ title?: string; link?: string; snippet?: string }>;
}

/** Serper.dev — a thin Google SERP API. Swap freely; the port is what matters. */
export function createSerperSearch(apiKey: string): SearchProvider {
  return {
    name: 'serper',
    live: true,
    async search(query, options) {
      return timed('serper', true, async () => {
        const res = await retry(
          async () => {
            const r = await fetchWithTimeout('https://google.serper.dev/search', {
              method: 'POST',
              timeoutMs: 20_000,
              headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
              body: JSON.stringify({ q: query, num: options?.limit ?? 10, gl: options?.country ?? 'ae' }),
            });
            if (r.status === 429 || r.status >= 500) throw new Error(`serper ${r.status}`);
            return r;
          },
          { attempts: 3, baseMs: 700 },
        );
        if (!res.ok) throw new Error(`serper returned ${res.status}`);
        const json = (await res.json()) as SerperResponse;
        const results: SearchResult[] = (json.organic ?? [])
          .filter((o) => !!o.link)
          .map((o) => ({ title: o.title ?? '', url: o.link!, snippet: o.snippet ?? '' }));
        return { data: results, raw: json };
      });
    },
  };
}
