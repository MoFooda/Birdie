/**
 * Wayback Machine history.
 *
 * Answers a question none of the other providers can: *how long has this site looked the
 * way it looks now?* A site whose content hash has not changed since 2016 is a rebuild
 * conversation regardless of how it scores technically — and it is the single most
 * quotable line in a cold email, because the prospect can verify it themselves.
 *
 * Free, no API key, no account. The CDX endpoint returns one row per capture including a
 * content digest, so the last genuine content change is derivable rather than guessed.
 *
 * Honest limits, recorded rather than papered over: archive coverage is uneven, a digest
 * changes on trivial edits as well as redesigns, and a site absent from the archive
 * returns `fetched: false` rather than "never changed".
 */

import type { ArchiveHistory } from '@/core/audit-checks';
import { fetchWithTimeout, retry, timed, type ProviderMeta, type ProviderResult } from './types';

export interface ArchiveProvider extends ProviderMeta {
  history(domain: string): Promise<ProviderResult<ArchiveHistory>>;
}

const unavailable = (error: string): ArchiveHistory => ({
  fetched: false,
  first_seen: null,
  last_seen: null,
  last_content_change: null,
  months_since_change: null,
  snapshot_count: 0,
  error,
});

/** CDX timestamps are `YYYYMMDDhhmmss`. */
function parseTimestamp(ts: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(ts);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

export function createWaybackArchive(): ArchiveProvider {
  return {
    name: 'wayback',
    live: true,
    async history(domain) {
      return timed('wayback', true, async () => {
        const endpoint = new URL('https://web.archive.org/cdx/search/cdx');
        endpoint.searchParams.set('url', domain);
        endpoint.searchParams.set('output', 'json');
        endpoint.searchParams.set('fl', 'timestamp,digest,statuscode');
        endpoint.searchParams.set('filter', 'statuscode:200');
        // One capture per month keeps the response small while still resolving a redesign
        // to the right month.
        endpoint.searchParams.set('collapse', 'timestamp:6');
        endpoint.searchParams.set('limit', '400');

        const res = await retry(
          async () => {
            const r = await fetchWithTimeout(endpoint.toString(), { timeoutMs: 20_000 });
            if (r.status === 429 || r.status >= 500) throw new Error(`wayback ${r.status}`);
            return r;
          },
          { attempts: 2, baseMs: 1_500 },
        );

        if (!res.ok) return { data: unavailable(`wayback returned ${res.status}`) };

        const rows = (await res.json()) as string[][];
        // First row is the header; anything less means the domain is not archived.
        if (!Array.isArray(rows) || rows.length < 2) {
          return { data: unavailable('no archived captures for this domain') };
        }

        const captures = rows
          .slice(1)
          .map(([timestamp, digest]) => ({ timestamp: timestamp ?? '', digest: digest ?? '' }))
          .filter((c) => c.timestamp !== '')
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        if (captures.length === 0) return { data: unavailable('no usable captures returned') };

        // Walk backwards to the most recent capture whose content differed from its
        // predecessor: that is the last time the page meaningfully changed.
        let lastChange = captures[0]!.timestamp;
        for (let i = captures.length - 1; i > 0; i -= 1) {
          if (captures[i]!.digest !== captures[i - 1]!.digest) {
            lastChange = captures[i]!.timestamp;
            break;
          }
        }

        const first = parseTimestamp(captures[0]!.timestamp);
        const last = parseTimestamp(captures[captures.length - 1]!.timestamp);
        const changed = parseTimestamp(lastChange);

        const data: ArchiveHistory = {
          fetched: true,
          first_seen: first?.toISOString() ?? null,
          last_seen: last?.toISOString() ?? null,
          last_content_change: changed?.toISOString() ?? null,
          months_since_change: changed ? monthsBetween(changed, new Date()) : null,
          snapshot_count: captures.length,
          error: null,
        };
        return { data, raw: { captures: captures.length } };
      });
    },
  };
}

/**
 * Demo adapter. Derives a plausible history from the domain name so fixtures stay stable
 * between runs, and marks itself as not-live so the settings page tells the truth.
 */
export function createFixtureArchive(): ArchiveProvider {
  return {
    name: 'fixture-archive',
    live: false,
    async history(domain) {
      return timed('fixture-archive', false, async () => {
        let hash = 0;
        for (const ch of domain) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

        // Truncated to whole days so repeat calls return byte-identical history. The
        // pipeline's idempotency guarantee says a re-run must not change stored data, and
        // a fixture carrying millisecond timestamps would quietly violate it.
        const today = new Date();
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

        const monthsSinceChange = hash % 120;
        const changed = new Date(day);
        changed.setUTCMonth(changed.getUTCMonth() - monthsSinceChange);
        const first = new Date(changed);
        first.setUTCFullYear(first.getUTCFullYear() - (2 + (hash % 8)));

        const data: ArchiveHistory = {
          fetched: true,
          first_seen: first.toISOString(),
          last_seen: day.toISOString(),
          last_content_change: changed.toISOString(),
          months_since_change: monthsSinceChange,
          snapshot_count: 12 + (hash % 90),
          error: null,
        };
        return { data };
      });
    },
  };
}

export function createDisabledArchive(reason: string): ArchiveProvider {
  return {
    name: 'archive-disabled',
    live: false,
    async history() {
      return {
        ok: false,
        data: null,
        error: reason,
        provider: 'archive-disabled',
        live: false,
        duration_ms: 0,
      };
    },
  };
}
