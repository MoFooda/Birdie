/**
 * Batch dispatch.
 *
 * A batch of 50 companies must never run inside the HTTP request that starts it, so this
 * module hands the work to a background executor and returns immediately.
 *
 * Two executors, one behaviour: when `TRIGGER_SECRET_KEY` is set the per-company task is
 * queued on Trigger.dev (durable, retried, concurrency-limited by the platform);
 * otherwise the same pipeline runs in-process on this server. The step functions are
 * identical in both cases.
 */

import 'server-only';
import { env } from '@/lib/env';
import { getStore } from '@/store';
import { getProviders } from '@/providers/registry';
import { runCampaignPipeline, runCompanyPipeline, requestCancel, clearCancel } from './runner';
import type { PipelineStep } from '@/core/types';

export type DispatchMode = 'trigger' | 'inline';

export function dispatchMode(): DispatchMode {
  return env.triggerSecretKey ? 'trigger' : 'inline';
}

/** Fire-and-forget promises, tracked so `waitForIdle` can await them in tests. */
const inflight = new Set<Promise<unknown>>();

function background(promise: Promise<unknown>): void {
  inflight.add(promise);
  promise
    .catch(() => {
      /* per-company failures are already recorded in job_runs */
    })
    .finally(() => inflight.delete(promise));
}

/** Test/CLI helper: resolve once all background pipeline work has finished. */
export async function waitForIdle(): Promise<void> {
  while (inflight.size > 0) {
    await Promise.allSettled([...inflight]);
  }
}

export interface DispatchResult {
  mode: DispatchMode;
  companies: number;
  detail: string;
}

export async function dispatchCampaignRun(
  campaignId: string,
  options: { companyIds?: string[]; wait?: boolean } = {},
): Promise<DispatchResult> {
  const store = getStore();
  const providers = getProviders();
  const companies = await store.listCompanies(campaignId);
  const targets = options.companyIds ? companies.filter((c) => options.companyIds!.includes(c.id)) : companies;

  clearCancel(campaignId);

  if (dispatchMode() === 'trigger') {
    // Imported lazily so the SDK is never pulled into a build that does not use it.
    const { tasks } = await import('@trigger.dev/sdk');
    await store.updateCampaign(campaignId, { status: 'running' });
    await tasks.batchTrigger(
      'analyze-company',
      targets.map((c) => ({ payload: { campaignId, companyId: c.id } })),
    );
    return {
      mode: 'trigger',
      companies: targets.length,
      detail: `Queued ${targets.length} company task(s) on Trigger.dev.`,
    };
  }

  const run = runCampaignPipeline({
    store,
    providers,
    campaignId,
    demo: env.demoMode,
    concurrency: env.pipelineConcurrency,
    companyIds: targets.map((c) => c.id),
  });

  // On a serverless host a detached promise can be frozen the moment the response is
  // returned. With fixture providers a whole batch finishes in about a second, so demo
  // runs are awaited — that makes a hosted demo deterministic instead of a coin flip.
  // Live batches take minutes and must not block the request; those need Trigger.dev.
  if (options.wait || env.demoMode) {
    await run;
  } else {
    background(run);
  }

  return {
    mode: 'inline',
    companies: targets.length,
    detail: `Running ${targets.length} company pipeline(s) in-process with concurrency ${env.pipelineConcurrency}.`,
  };
}

export async function dispatchCompanyRetry(
  campaignId: string,
  companyId: string,
  options: { steps?: PipelineStep[]; wait?: boolean } = {},
): Promise<DispatchResult> {
  const store = getStore();
  const providers = getProviders();
  clearCancel(campaignId);

  if (dispatchMode() === 'trigger' && !options.steps) {
    const { tasks } = await import('@trigger.dev/sdk');
    await tasks.trigger('analyze-company', { campaignId, companyId });
    return { mode: 'trigger', companies: 1, detail: 'Re-queued the company task on Trigger.dev.' };
  }

  const run = runCompanyPipeline({
    store,
    providers,
    campaignId,
    companyId,
    demo: env.demoMode,
    only: options.steps,
  });

  if (options.wait) await run;
  else background(run);

  return {
    mode: 'inline',
    companies: 1,
    detail: options.steps ? `Retrying step(s): ${options.steps.join(', ')}.` : 'Re-running the full company pipeline.',
  };
}

export function cancelCampaign(campaignId: string): void {
  requestCancel(campaignId);
}
