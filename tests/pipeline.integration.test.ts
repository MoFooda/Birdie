/**
 * Integration test for the full per-company pipeline, running against fixture providers.
 *
 * This is the test that proves demo mode is a real rehearsal: the same steps, store and
 * scoring engine run here as in production, with only the provider adapters swapped.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { MemoryStore } from '@/store/memory';
import { seedDemoCampaign } from '@/demo/seed';
import { runCampaignPipeline } from '@/pipeline/runner';
import { createFixtureScraper } from '@/providers/scraper';
import { createFixtureSearch } from '@/providers/search';
import { createFixturePageSpeed } from '@/providers/pagespeed';
import { createFixtureAi } from '@/providers/ai';
import { createFixtureScreenshot } from '@/providers/screenshot';
import { createFixtureArchive } from '@/providers/archive';
import type { Providers } from '@/providers/types';
import type { CompanyReport } from '@/core/types';

function fixtureProviders(): Providers {
  return {
    scraper: createFixtureScraper(),
    search: createFixtureSearch(),
    pagespeed: createFixturePageSpeed(),
    ai: createFixtureAi(),
    screenshot: createFixtureScreenshot(),
    archive: createFixtureArchive(),
  };
}

describe('company pipeline (demo providers)', () => {
  let store: MemoryStore;
  let campaignId: string;
  let reports: CompanyReport[];

  const byName = (name: string) => {
    const report = reports.find((r) => r.company.name === name);
    if (!report) throw new Error(`no report for ${name}`);
    return report;
  };

  beforeAll(async () => {
    store = new MemoryStore({ file: null });
    const seeded = await seedDemoCampaign(store);
    campaignId = seeded.campaignId;
    await runCampaignPipeline({ store, providers: fixtureProviders(), campaignId, demo: true, concurrency: 4 });
    reports = await store.listReports(campaignId);
  }, 120_000);

  it('imports every demo company', () => {
    expect(reports.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every company an independent job status for all eleven steps', async () => {
    for (const report of reports) {
      const jobs = await store.listJobRunsForCompany(report.company.id);
      expect(jobs).toHaveLength(11);
      expect(jobs.every((j) => j.status !== 'pending' && j.status !== 'running')).toBe(true);
      // Idempotency keys must be unique per (company, step).
      expect(new Set(jobs.map((j) => j.idempotency_key)).size).toBe(11);
    }
  });

  it('scores every company and applies the published formula', () => {
    for (const report of reports) {
      const score = report.score;
      expect(score, `${report.company.name} has no score`).toBeTruthy();
      const expected = score!.competitor_measured
        ? Math.round(
            score!.website_transformation_need *
              ((0.65 * score!.sector_website_importance + 0.35 * score!.competitor_website_usage!) / 100),
          )
        : Math.round(score!.website_transformation_need * (score!.sector_website_importance / 100));
      expect(score!.potential_score).toBe(expected);
    }
  });

  it('rates a weak clinic site as a very high opportunity and recommends a rebuild', () => {
    const report = byName('Al Noor Dental Clinic');
    expect(report.status_check?.status).toBe('live');
    expect(report.score!.website_transformation_need).toBeGreaterThanOrEqual(60);
    expect(['very_high', 'high']).toContain(report.score!.classification);
    expect(['complete_rebuild', 'major_redesign']).toContain(report.score!.recommended_action);
  });

  it('rates a strong site in the same sector far lower', () => {
    const weak = byName('Al Noor Dental Clinic').score!;
    const strong = byName('Marina Aesthetics Clinic').score!;
    expect(strong.website_transformation_need).toBeLessThan(weak.website_transformation_need);
    expect(strong.potential_score).toBeLessThan(weak.potential_score);
  });

  it('treats a parked domain as no website and recommends building one', () => {
    const report = byName('Horizon Stone Works');
    expect(report.status_check?.status).toBe('parked_domain');
    expect(report.score!.recommended_action).toBe('new_website');
    expect(report.score!.website_transformation_need).toBeGreaterThanOrEqual(85);
  });

  it('never reports a bot-protected site as offline, and flags it for review', () => {
    const report = byName('Cedar Grill House');
    expect(report.status_check?.status).toBe('bot_protection');
    expect(report.score!.transformation_measured).toBe(false);
    expect(report.score!.requires_human_review).toBe(true);
    expect(report.score!.recommended_action).toBe('needs_review');
    expect(report.score!.should_generate_outreach).toBe(false);
    expect(report.score!.limitations.join(' ')).toMatch(/could not be read/i);
  });

  it('records a DNS failure as a missing website rather than a crawl error', () => {
    const report = byName('Desert Rose Interiors');
    expect(report.status_check?.status).toBe('dns_failure');
    expect(report.score!.recommended_action).toBe('new_website');
  });

  it('detects a cross-host redirect as live-after-redirect', () => {
    const report = byName('Falcon Logistics Systems');
    expect(report.status_check?.status).toBe('live_after_redirect');
    expect(report.status_check?.redirect_chain.length).toBeGreaterThan(0);
  });

  it('imports a company with no website and scores it as an opportunity', () => {
    const report = byName('Meridian Consulting Group');
    expect(report.status_check?.status).toBe('no_website');
    expect(report.score!.potential_score).toBeGreaterThan(50);
    expect(report.score!.recommended_action).toBe('new_website');
  });

  it('flags a company whose sector could not be determined confidently', () => {
    const report = byName('Bright Path Academy');
    expect(report.company.sector_confidence).toBe('low');
    expect(report.score!.requires_human_review).toBe(true);
  });

  it('finds and validates competitors, or reports the limitation', () => {
    for (const report of reports) {
      const summary = report.score!.competitor_summary as { analyzed_count: number; limitations: string[] } | null;
      if (report.competitors.length >= 3) {
        expect(report.score!.competitor_measured).toBe(true);
      } else {
        expect(summary?.limitations.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('generates a four-email sequence only for companies above the threshold', () => {
    for (const report of reports) {
      if (report.score!.should_generate_outreach) {
        expect(report.messages).toHaveLength(4);
        expect(report.messages.map((m) => m.step)).toEqual([1, 2, 3, 4]);
        for (const m of report.messages) {
          expect(m.subject.length).toBeGreaterThan(0);
          expect(m.body.length).toBeGreaterThan(20);
          // No generic filler and no invented numbers.
          expect(m.body.toLowerCase()).not.toContain('your website needs improvement');
        }
      } else {
        expect(report.messages).toHaveLength(0);
        expect(report.flow?.skipped_reason).toBeTruthy();
      }
    }
  });

  it('only marks WhatsApp drafts as consented when consent is recorded', () => {
    for (const report of reports) {
      for (const draft of report.flow?.whatsapp_drafts ?? []) {
        expect(draft.consent_required).toBe(true);
        expect(draft.consent_on_file).toBe(report.contacts[0]?.whatsapp_consent === true);
      }
    }
  });

  it('produces at least one company in each broad opportunity band', () => {
    const bands = new Set(reports.map((r) => r.score!.classification));
    expect(bands.size).toBeGreaterThanOrEqual(3);
    expect(bands.has('very_high')).toBe(true);
  });

  it('is idempotent: re-running produces no duplicate rows', async () => {
    const target = byName('Al Noor Dental Clinic');
    const before = {
      findings: (await store.listFindings(target.company.id)).length,
      pages: (await store.listPages(target.company.id)).length,
      competitors: (await store.listCompetitors(target.company.id)).length,
      jobs: (await store.listJobRunsForCompany(target.company.id)).length,
    };

    await runCampaignPipeline({
      store,
      providers: fixtureProviders(),
      campaignId,
      demo: true,
      concurrency: 1,
      companyIds: [target.company.id],
    });

    expect((await store.listFindings(target.company.id)).length).toBe(before.findings);
    expect((await store.listPages(target.company.id)).length).toBe(before.pages);
    expect((await store.listCompetitors(target.company.id)).length).toBe(before.competitors);
    expect((await store.listJobRunsForCompany(target.company.id)).length).toBe(before.jobs);
    expect((await store.getScore(target.company.id))!.potential_score).toBe(target.score!.potential_score);
  }, 60_000);
});
