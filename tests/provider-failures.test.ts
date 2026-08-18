/**
 * Provider failure and retry behaviour.
 *
 * The rule these tests defend: when a provider fails, the affected result is reported as
 * not-run / needs-review and the rest of the pipeline continues. A failed provider must
 * never produce an invented finding, and must never take down the batch.
 */

import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '@/store/memory';
import { seedDemoCampaign } from '@/demo/seed';
import { runCampaignPipeline, runCompanyPipeline } from '@/pipeline/runner';
import { createFixtureScraper } from '@/providers/scraper';
import { createFixtureSearch } from '@/providers/search';
import { createFixturePageSpeed } from '@/providers/pagespeed';
import { createFixtureAi } from '@/providers/ai';
import { createFixtureScreenshot } from '@/providers/screenshot';
import { createFixtureArchive } from '@/providers/archive';
import { retry } from '@/providers/types';
import type { AiProvider, PageSpeedProvider, Providers, SearchProvider } from '@/providers/types';

function providers(overrides: Partial<Providers> = {}): Providers {
  return {
    scraper: createFixtureScraper(),
    search: createFixtureSearch(),
    pagespeed: createFixturePageSpeed(),
    ai: createFixtureAi(),
    screenshot: createFixtureScreenshot(),
    archive: createFixtureArchive(),
    ...overrides,
  };
}

const failing = <T extends object>(name: string, method: keyof T, message: string) =>
  ({
    name,
    live: true,
    [method]: async () => ({
      ok: false,
      data: null,
      error: message,
      provider: name,
      live: true,
      duration_ms: 1,
    }),
  }) as unknown as T;

async function seededStore() {
  const store = new MemoryStore({ file: null });
  const { campaignId } = await seedDemoCampaign(store);
  return { store, campaignId };
}

async function companyIdFor(store: MemoryStore, campaignId: string, name: string) {
  const companies = await store.listCompanies(campaignId);
  const company = companies.find((c) => c.name === name);
  if (!company) throw new Error(`no company named ${name}`);
  return company.id;
}

describe('provider failures', () => {
  it('reports PageSpeed as not measured and excludes it from the score', async () => {
    const { store, campaignId } = await seededStore();
    const companyId = await companyIdFor(store, campaignId, 'Al Noor Dental Clinic');

    await runCompanyPipeline({
      store,
      providers: providers({
        pagespeed: failing<PageSpeedProvider>('pagespeed-down', 'audit', 'PageSpeed quota exceeded'),
      }),
      campaignId,
      companyId,
      demo: true,
    });

    const score = await store.getScore(companyId);
    expect(score).toBeTruthy();
    expect(score!.limitations.join(' ')).toMatch(/PageSpeed/i);

    const item = score!.transformation_breakdown.find((b) => b.key === 'pagespeed_mobile');
    expect(item?.detail).toMatch(/not measured/);
    expect(item?.points).toBe(0);

    // No performance finding may exist when performance was never measured.
    const findings = await store.listFindings(companyId);
    expect(findings.some((f) => f.category === 'performance')).toBe(false);
  });

  it('reports the competitor component as unmeasured when search fails, and degrades the formula', async () => {
    const { store, campaignId } = await seededStore();
    const companyId = await companyIdFor(store, campaignId, 'Al Noor Dental Clinic');

    await runCompanyPipeline({
      store,
      providers: providers({ search: failing<SearchProvider>('search-down', 'search', 'search API 503') }),
      campaignId,
      companyId,
      demo: true,
    });

    const score = await store.getScore(companyId);
    expect(score!.competitor_measured).toBe(false);
    expect(score!.competitor_website_usage).toBeNull();
    expect(score!.requires_human_review).toBe(true);
    expect(score!.limitations.join(' ')).toMatch(/competitor term dropped|not be measured/i);

    // The degraded formula must be the documented one.
    expect(score!.potential_score).toBe(
      Math.round(score!.website_transformation_need * (score!.sector_website_importance / 100)),
    );

    expect(await store.listCompetitors(companyId)).toHaveLength(0);
  });

  it('flags the company for review when sector detection is unavailable', async () => {
    const { store, campaignId } = await seededStore();
    const companyId = await companyIdFor(store, campaignId, 'Al Noor Dental Clinic');

    await runCompanyPipeline({
      store,
      providers: providers({ ai: failing<AiProvider>('ai-down', 'generate', 'OpenAI 429') }),
      campaignId,
      companyId,
      demo: true,
    });

    const company = await store.getCompany(companyId);
    expect(company!.sector_confidence).toBe('low');
    expect(company!.needs_manual_review).toBe(true);
    expect(company!.sector_evidence.join(' ')).toMatch(/did not run/i);

    const score = await store.getScore(companyId);
    // The technical audit still ran, so the report is useful even with the model down.
    expect(score).toBeTruthy();
    expect(score!.requires_human_review).toBe(true);
    expect(score!.should_generate_outreach).toBe(false);

    // No AI-sourced finding may exist when the model never answered.
    const findings = await store.listFindings(companyId);
    expect(findings.some((f) => f.measurement_source === 'ai_interpretation')).toBe(false);
    expect(findings.length).toBeGreaterThan(0);

    const jobs = await store.listJobRunsForCompany(companyId);
    expect(jobs.find((j) => j.step === 'detect-sector-and-business-model')!.status).toBe('skipped');
    // A skipped step still records why.
    expect(jobs.find((j) => j.step === 'detect-sector-and-business-model')!.output_summary).toMatch(/unavailable/i);
  });

  it('records a status check that could not be completed as unknown, never as offline', async () => {
    const { store, campaignId } = await seededStore();
    const companyId = await companyIdFor(store, campaignId, 'Al Noor Dental Clinic');

    const brokenScraper = {
      ...createFixtureScraper(),
      probe: async () => ({
        ok: false,
        data: null,
        error: 'scraper crashed',
        provider: 'broken',
        live: true,
        duration_ms: 1,
      }),
    } as unknown as Providers['scraper'];

    await runCompanyPipeline({
      store,
      providers: providers({ scraper: brokenScraper }),
      campaignId,
      companyId,
      demo: true,
    });

    const check = await store.getStatusCheck(companyId);
    expect(check!.status).toBe('unknown_needs_review');
    expect(check!.confidence).toBe('low');
    expect((await store.getCompany(companyId))!.needs_manual_review).toBe(true);
  });

  it('does not let one broken company fail the rest of the campaign', async () => {
    const { store, campaignId } = await seededStore();
    const target = await companyIdFor(store, campaignId, 'Zayn Home Living');

    let calls = 0;
    const flaky = {
      ...createFixtureScraper(),
      probe: async (domain: string) => {
        calls += 1;
        if (domain.includes('zaynhomeliving')) throw new Error('boom');
        return createFixtureScraper().probe(domain);
      },
    } as unknown as Providers['scraper'];

    const summaries = await runCampaignPipeline({
      store,
      providers: providers({ scraper: flaky }),
      campaignId,
      demo: true,
      concurrency: 4,
    });

    expect(calls).toBeGreaterThan(0);
    const broken = summaries.find((s) => s.companyId === target)!;
    expect(broken.failed).toBeGreaterThan(0);

    // Every other company still finished and scored.
    const others = summaries.filter((s) => s.companyId !== target);
    expect(others.length).toBeGreaterThan(5);
    for (const summary of others) {
      expect(await store.getScore(summary.companyId)).toBeTruthy();
    }

    const campaign = await store.getCampaign(campaignId);
    expect(campaign!.status).toBe('completed');
  }, 60_000);

  it('retries a throwing step and records the final attempt number', async () => {
    const { store, campaignId } = await seededStore();
    const companyId = await companyIdFor(store, campaignId, 'Al Noor Dental Clinic');

    const alwaysThrows = {
      ...createFixtureScraper(),
      probe: async () => {
        throw new Error('transient network error');
      },
    } as unknown as Providers['scraper'];

    await runCompanyPipeline({
      store,
      providers: providers({ scraper: alwaysThrows }),
      campaignId,
      companyId,
      demo: true,
      only: ['check-website-status'],
      attemptsPerStep: 3,
    });

    const job = (await store.listJobRunsForCompany(companyId)).find((j) => j.step === 'check-website-status')!;
    expect(job.status).toBe('failed');
    expect(job.attempt).toBe(3);
    expect(job.error_message).toMatch(/transient network error/);
  });
});

describe('retry helper', () => {
  it('succeeds on a later attempt', async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('nope');
        return 'ok';
      },
      { attempts: 3, baseMs: 1 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('gives up after the configured number of attempts', async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts += 1;
          throw new Error('always fails');
        },
        { attempts: 2, baseMs: 1 },
      ),
    ).rejects.toThrow('always fails');
    expect(attempts).toBe(2);
  });

  it('stops immediately when the error is not retryable', async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts += 1;
          throw new Error('401 unauthorized');
        },
        { attempts: 5, baseMs: 1, shouldRetry: (err) => !String(err).includes('401') },
      ),
    ).rejects.toThrow('401');
    expect(attempts).toBe(1);
  });

  it('backs off between attempts rather than hammering the provider', async () => {
    vi.useFakeTimers();
    try {
      const started = Date.now();
      let attempts = 0;
      const promise = retry(
        async () => {
          attempts += 1;
          if (attempts < 3) throw new Error('retry me');
          return Date.now() - started;
        },
        { attempts: 3, baseMs: 1000 },
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;
      expect(attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
