/**
 * Tests for the free data sources: platform fingerprinting and archive history.
 *
 * Both feed the score and both are quoted in outreach, so the bar is the same as
 * everywhere else — a signal we did not establish must read as "not measured", never as a
 * fault we found.
 */

import { describe, expect, it } from 'vitest';
import { detectPlatform, runTechnicalAudit, type ArchiveHistory, type ScrapedSite } from '@/core/audit-checks';
import { calculateScores, type ScoringInput } from '@/core/scoring';
import { createFixtureArchive } from '@/providers/archive';
import { summarizeCompetitorUsage } from '@/core/competitor-scoring';
import { SEED_PLAYBOOKS } from '@/core/playbooks';
import type { SectorPlaybook } from '@/core/types';

function site(html: string): ScrapedSite {
  return {
    final_url: 'https://example.com',
    pages: [
      {
        url: 'https://example.com',
        page_type: 'home',
        status_code: 200,
        html,
        text: 'text',
        title: 'Example',
        meta_description: null,
        h1: 'Example',
      },
    ],
    robots_txt: null,
    sitemap_url: null,
    headers: {},
    screenshot_mobile_url: null,
    screenshot_desktop_url: null,
  };
}

describe('detectPlatform', () => {
  it.each([
    ['<script src="https://cdn.shopify.com/s/files/x.js"></script>', 'Shopify', false],
    ['<link href="/wp-content/themes/x/style.css">', 'WordPress', false],
    ['<script src="https://static.parastorage.com/x.js"></script>', 'Wix', true],
    ['<div data-wf-page="abc">', 'Webflow', true],
    ['<img src="https://img1.wsimg.com/x.png">', 'GoDaddy Website Builder', true],
    ['<script src="/_next/static/chunks/main.js"></script>', 'Next.js', false],
  ])('identifies %s as %s', (html, platform, builder) => {
    const result = detectPlatform(site(html));
    expect(result.platform).toBe(platform);
    expect(result.is_website_builder).toBe(builder);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('returns null rather than guessing when nothing is recognisable', () => {
    const result = detectPlatform(site('<html><body><p>plain</p></body></html>'));
    expect(result.platform).toBeNull();
    expect(result.is_website_builder).toBe(false);
    expect(result.evidence.join(' ')).toMatch(/no recognisable platform/i);
  });

  it('flags a dated stack independently of the platform', () => {
    const result = detectPlatform(
      site('<script src="/js/jquery-1.11.3.min.js"></script><font size="2">old</font>'),
    );
    expect(result.dated_markers).toContain('jQuery 1.x');
    expect(result.dated_markers).toContain('Inline font tag');
  });

  it('does not mistake a current library for a dated one', () => {
    const result = detectPlatform(site('<script src="/js/jquery-3.7.1.min.js"></script>'));
    expect(result.dated_markers).toHaveLength(0);
  });
});

describe('fixture archive provider', () => {
  it('returns a stable history for the same domain', async () => {
    const archive = createFixtureArchive();
    const a = await archive.history('example.com');
    const b = await archive.history('example.com');
    expect(a.data).toEqual(b.data);
    expect(a.data?.fetched).toBe(true);
  });

  it('gives different domains different histories', async () => {
    const archive = createFixtureArchive();
    const a = await archive.history('example.com');
    const b = await archive.history('different.com');
    expect(a.data?.months_since_change).not.toBe(b.data?.months_since_change);
  });

  it('reports itself as not live so the settings page stays honest', () => {
    expect(createFixtureArchive().live).toBe(false);
  });
});

describe('freshness in the score', () => {
  const playbook: SectorPlaybook = {
    ...SEED_PLAYBOOKS.find((p) => p.sub_sector === 'B2B professional service')!,
    id: 'pb',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const auditWith = (archive: ArchiveHistory | null) =>
    runTechnicalAudit(
      site('<html><head><meta name="viewport" content="width=device-width"></head><body><h1>x</h1></body></html>'),
      { mobile: null, desktop: null },
      archive,
    );

  const scoreWith = (archive: ArchiveHistory | null) =>
    calculateScores({
      status: 'live',
      audit: auditWith(archive),
      playbook,
      ai: null,
      competitors: summarizeCompetitorUsage([], null),
      sector_confidence: 'high',
      min_score_for_outreach: 40,
    } satisfies ScoringInput);

  const history = (months: number): ArchiveHistory => ({
    fetched: true,
    first_seen: '2015-01-01T00:00:00Z',
    last_seen: new Date().toISOString(),
    last_content_change: new Date(Date.now() - months * 30 * 864e5).toISOString(),
    months_since_change: months,
    snapshot_count: 40,
  });

  it('scores a long-frozen site as needing more work than a fresh one', () => {
    expect(scoreWith(history(72)).website_transformation_need).toBeGreaterThan(
      scoreWith(history(2)).website_transformation_need,
    );
  });

  it('excludes freshness entirely when the archive could not be read', () => {
    const result = scoreWith(null);
    const item = result.transformation_breakdown.find((b) => b.key === 'content_freshness');
    expect(item?.points).toBe(0);
    expect(item?.detail).toMatch(/not measured/i);
  });

  it('treats an unreadable archive better than a stale one, never worse', () => {
    // The point of the whole model: a gap in our data must not read as a fault in theirs.
    expect(scoreWith(null).website_transformation_need).toBeLessThan(
      scoreWith(history(72)).website_transformation_need,
    );
  });

  it('records the change date in the breakdown detail so the claim is checkable', () => {
    const result = scoreWith(history(48));
    const item = result.transformation_breakdown.find((b) => b.key === 'content_freshness');
    expect(item?.detail).toMatch(/48 month/);
  });
});
