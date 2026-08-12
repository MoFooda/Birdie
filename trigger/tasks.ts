/**
 * Trigger.dev tasks.
 *
 * These are thin wrappers: all the work lives in `src/pipeline/steps.ts`, so the hosted
 * and in-process executors cannot drift apart. Each task is keyed by (campaign, company,
 * step) and every write it performs is replace-by-company, which is what makes a
 * Trigger.dev retry safe — re-running a task updates the same rows rather than appending.
 *
 * Concurrency is capped per queue so a 50-company batch cannot exceed provider rate
 * limits, and `maxDuration` bounds a single company's run.
 */

import { task, logger } from '@trigger.dev/sdk';
import { PIPELINE_STEPS, type PipelineStep } from '../src/core/types';
import { getStore } from '../src/store';
import { getProviders } from '../src/providers/registry';
import { STEP_HANDLERS, type StepContext } from '../src/pipeline/steps';
import { idempotencyKey, isCancelRequested } from '../src/pipeline/runner';
import { env } from '../src/lib/env';

interface CompanyPayload {
  campaignId: string;
  companyId: string;
}

interface StepPayload extends CompanyPayload {
  step: PipelineStep;
}

/** One pipeline step for one company. Retried by the platform on an unhandled throw. */
export const runStepTask = task({
  id: 'run-pipeline-step',
  queue: { name: 'pipeline-steps', concurrencyLimit: 8 },
  retry: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 30_000, factor: 2 },
  maxDuration: 300,
  run: async ({ campaignId, companyId, step }: StepPayload, { ctx }) => {
    const store = getStore();
    const providers = getProviders();
    const settings = await store.getSettings(campaignId);
    if (!settings) throw new Error(`campaign ${campaignId} has no settings`);

    const key = idempotencyKey(campaignId, companyId, step);
    const stepContext: StepContext = {
      store,
      providers,
      campaignId,
      companyId,
      settings,
      demo: env.demoMode,
      isCancelled: () => isCancelRequested(campaignId),
    };

    const existing = (await store.listJobRunsForCompany(companyId)).find((j) => j.idempotency_key === key);
    await store.upsertJobRun({
      id: existing?.id,
      campaign_id: campaignId,
      company_id: companyId,
      step,
      status: 'running',
      attempt: ctx.attempt.number,
      idempotency_key: key,
      started_at: new Date().toISOString(),
      finished_at: null,
      error_message: null,
      output_summary: null,
    });

    try {
      const result = await STEP_HANDLERS[step](stepContext);
      await store.upsertJobRun({
        id: existing?.id,
        campaign_id: campaignId,
        company_id: companyId,
        step,
        status: result.status === 'skipped' ? 'skipped' : result.status === 'failed' ? 'failed' : 'succeeded',
        attempt: ctx.attempt.number,
        idempotency_key: key,
        started_at: existing?.started_at ?? new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error_message: result.error ?? null,
        output_summary: result.summary,
      });
      logger.info(`${step} for ${companyId}: ${result.status}`, { summary: result.summary });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await store.upsertJobRun({
        id: existing?.id,
        campaign_id: campaignId,
        company_id: companyId,
        step,
        status: 'failed',
        attempt: ctx.attempt.number,
        idempotency_key: key,
        started_at: existing?.started_at ?? new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error_message: message,
        output_summary: null,
      });
      throw err;
    }
  },
});

/**
 * The full per-company pipeline. Steps run in order; a step that throws on its final
 * attempt is caught here so the remaining steps still get their chance to report
 * `skipped` — one failure degrades a company, it does not abandon it.
 */
export const analyzeCompanyTask = task({
  id: 'analyze-company',
  queue: { name: 'company-pipeline', concurrencyLimit: 4 },
  retry: { maxAttempts: 1 },
  maxDuration: 1800,
  run: async ({ campaignId, companyId }: CompanyPayload) => {
    const results: Array<{ step: PipelineStep; status: string }> = [];

    for (const step of PIPELINE_STEPS) {
      if (isCancelRequested(campaignId)) {
        results.push({ step, status: 'cancelled' });
        continue;
      }
      try {
        const result = await runStepTask.triggerAndWait({ campaignId, companyId, step });
        results.push({ step, status: result.ok ? 'succeeded' : 'failed' });
      } catch (err) {
        logger.error(`step ${step} failed for company ${companyId}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({ step, status: 'failed' });
      }
    }

    return { companyId, results };
  },
});
