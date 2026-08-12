/**
 * The in-process pipeline runner.
 *
 * Used directly when Trigger.dev is not configured, and used *by* the Trigger.dev tasks
 * when it is — the step functions are the same either way, so behaviour does not diverge
 * between local and hosted execution.
 *
 * Guarantees:
 *   - one failed step never fails the campaign, and never fails the rest of the company's
 *     pipeline unless the remaining steps genuinely depend on it (they report `skipped`);
 *   - every step run is recorded in `job_runs` under a stable idempotency key, so a retry
 *     updates the same row;
 *   - a cancelled campaign stops between steps and marks the remaining work `cancelled`;
 *   - companies run with bounded concurrency to respect provider rate limits.
 */

import { PIPELINE_STEPS, type JobStatus, type PipelineStep } from '@/core/types';
import type { DataStore } from '@/store/types';
import type { Providers } from '@/providers/types';
import { STEP_HANDLERS, type StepContext } from './steps';

/** Campaigns the user has asked to cancel; checked between steps. */
const cancelled = new Set<string>();

export function requestCancel(campaignId: string): void {
  cancelled.add(campaignId);
}

export function clearCancel(campaignId: string): void {
  cancelled.delete(campaignId);
}

export function isCancelRequested(campaignId: string): boolean {
  return cancelled.has(campaignId);
}

export const idempotencyKey = (campaignId: string, companyId: string, step: PipelineStep) =>
  `${campaignId}:${companyId}:${step}`;

export interface RunCompanyOptions {
  store: DataStore;
  providers: Providers;
  campaignId: string;
  companyId: string;
  demo: boolean;
  /** Restrict the run to specific steps, used by manual per-step retry. */
  only?: PipelineStep[];
  /** Attempts per step, including the first. */
  attemptsPerStep?: number;
}

export interface CompanyRunSummary {
  companyId: string;
  succeeded: number;
  skipped: number;
  failed: number;
  cancelled: boolean;
}

export async function runCompanyPipeline(options: RunCompanyOptions): Promise<CompanyRunSummary> {
  const { store, providers, campaignId, companyId, demo } = options;
  const attempts = options.attemptsPerStep ?? 2;
  const steps = options.only ?? [...PIPELINE_STEPS];

  const settings = await store.getSettings(campaignId);
  if (!settings) throw new Error(`campaign ${campaignId} has no settings`);

  const ctx: StepContext = {
    store,
    providers,
    campaignId,
    companyId,
    settings,
    demo,
    isCancelled: () => isCancelRequested(campaignId),
  };

  const summary: CompanyRunSummary = { companyId, succeeded: 0, skipped: 0, failed: 0, cancelled: false };

  for (const step of steps) {
    if (isCancelRequested(campaignId)) {
      summary.cancelled = true;
      await record(store, campaignId, companyId, step, 'cancelled', 0, null, 'Campaign was cancelled before this step ran.');
      continue;
    }

    await record(store, campaignId, companyId, step, 'running', 1, null, null, { started: true });

    let lastError: string | null = null;
    let done = false;

    for (let attempt = 1; attempt <= attempts && !done; attempt += 1) {
      try {
        const result = await STEP_HANDLERS[step](ctx);
        await record(
          store,
          campaignId,
          companyId,
          step,
          result.status === 'failed' ? 'failed' : result.status === 'skipped' ? 'skipped' : 'succeeded',
          attempt,
          result.summary,
          result.status === 'failed' ? (result.error ?? result.summary) : null,
        );
        if (result.status === 'succeeded') summary.succeeded += 1;
        else if (result.status === 'skipped') summary.skipped += 1;
        else summary.failed += 1;
        done = true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < attempts) {
          // Exponential backoff with jitter before the retry.
          await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1) * (0.5 + Math.random())));
        }
      }
    }

    if (!done) {
      summary.failed += 1;
      await record(store, campaignId, companyId, step, 'failed', attempts, null, lastError);
      // Deliberately continue: later steps decide for themselves whether they can run,
      // so one broken provider does not abandon the rest of the company's report.
    }
  }

  return summary;
}

async function record(
  store: DataStore,
  campaignId: string,
  companyId: string,
  step: PipelineStep,
  status: JobStatus,
  attempt: number,
  outputSummary: string | null,
  errorMessage: string | null,
  options: { started?: boolean } = {},
): Promise<void> {
  const key = idempotencyKey(campaignId, companyId, step);
  const existing = (await store.listJobRunsForCompany(companyId)).find((j) => j.idempotency_key === key);
  await store.upsertJobRun({
    id: existing?.id,
    campaign_id: campaignId,
    company_id: companyId,
    step,
    status,
    attempt,
    idempotency_key: key,
    started_at: options.started ? new Date().toISOString() : (existing?.started_at ?? new Date().toISOString()),
    finished_at: status === 'running' ? null : new Date().toISOString(),
    error_message: errorMessage,
    output_summary: outputSummary,
  });
}

/** Run an async mapper over items with a fixed number of workers. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(concurrency, items.length || 1));

  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    }),
  );

  return results;
}

export interface RunCampaignOptions {
  store: DataStore;
  providers: Providers;
  campaignId: string;
  demo: boolean;
  concurrency?: number;
  companyIds?: string[];
}

export async function runCampaignPipeline(options: RunCampaignOptions): Promise<CompanyRunSummary[]> {
  const { store, providers, campaignId, demo } = options;
  clearCancel(campaignId);

  const all = await store.listCompanies(campaignId);
  const targets = options.companyIds ? all.filter((c) => options.companyIds!.includes(c.id)) : all;

  await store.updateCampaign(campaignId, { status: 'running' });

  const summaries = await mapWithConcurrency(targets, options.concurrency ?? 4, async (company) => {
    try {
      return await runCompanyPipeline({ store, providers, campaignId, companyId: company.id, demo });
    } catch (err) {
      // A company that blows up entirely is marked failed; the campaign continues.
      await store.updateCompany(company.id, { pipeline_status: 'failed', needs_manual_review: true });
      return {
        companyId: company.id,
        succeeded: 0,
        skipped: 0,
        failed: 1,
        cancelled: false,
        error: err instanceof Error ? err.message : String(err),
      } as CompanyRunSummary;
    }
  });

  const wasCancelled = isCancelRequested(campaignId);
  await store.updateCampaign(campaignId, { status: wasCancelled ? 'cancelled' : 'completed' });
  clearCancel(campaignId);
  return summaries;
}

export interface CampaignProgress {
  total_companies: number;
  completed: number;
  running: number;
  failed: number;
  needs_review: number;
  pending: number;
  total_steps: number;
  finished_steps: number;
  percent: number;
  per_company: Array<{
    company_id: string;
    name: string;
    pipeline_status: string;
    steps: Array<{ step: PipelineStep; status: JobStatus; summary: string | null; error: string | null }>;
  }>;
}

export async function getCampaignProgress(store: DataStore, campaignId: string): Promise<CampaignProgress> {
  const companies = await store.listCompanies(campaignId);
  const jobs = await store.listJobRuns(campaignId);

  const perCompany = companies.map((c) => {
    const own = jobs.filter((j) => j.company_id === c.id);
    return {
      company_id: c.id,
      name: c.name,
      pipeline_status: c.pipeline_status,
      steps: PIPELINE_STEPS.map((step) => {
        const job = own.find((j) => j.step === step);
        return {
          step,
          status: (job?.status ?? 'pending') as JobStatus,
          summary: job?.output_summary ?? null,
          error: job?.error_message ?? null,
        };
      }),
    };
  });

  const totalSteps = companies.length * PIPELINE_STEPS.length;
  const finishedSteps = jobs.filter((j) =>
    ['succeeded', 'skipped', 'failed', 'cancelled'].includes(j.status),
  ).length;

  return {
    total_companies: companies.length,
    completed: companies.filter((c) => c.pipeline_status === 'completed').length,
    running: companies.filter((c) => c.pipeline_status === 'running').length,
    failed: companies.filter((c) => c.pipeline_status === 'failed').length,
    needs_review: companies.filter((c) => c.pipeline_status === 'needs_review').length,
    pending: companies.filter((c) => c.pipeline_status === 'pending').length,
    total_steps: totalSteps,
    finished_steps: finishedSteps,
    percent: totalSteps === 0 ? 0 : Math.round((finishedSteps / totalSteps) * 100),
    per_company: perCompany,
  };
}
