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
import { after } from 'next/server';
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

/**
 * Keep a batch alive after the response goes out.
 *
 * A bare detached promise is not enough on a serverless host: the platform is entitled to
 * freeze the instance the moment the response is written, so the batch stops somewhere in
 * the middle of a company with no error anywhere. Next's `after` hands the promise to the
 * host's keep-alive instead, which is the supported way to finish work past the response.
 *
 * It only exists inside a request, so tests and the CLI fall back to the plain detached
 * promise — those run in a long-lived process where nothing is going to freeze them.
 *
 * The host's function timeout still applies: `maxDuration` on the run route bounds how
 * long this can keep going, which is why large batches still want Trigger.dev.
 */
function background(promise: Promise<unknown>): void {
  inflight.add(promise);
  const tracked = promise
    .catch(() => {
      /* per-company failures are already recorded in job_runs */
    })
    .finally(() => inflight.delete(promise));

  try {
    after(tracked);
  } catch {
    // Called outside a request scope — nothing to extend, and nothing to freeze either.
  }
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

  // Demo runs are awaited outright: with fixture providers a whole batch finishes in about
  // a second, and awaiting makes a hosted demo deterministic instead of a coin flip. A live
  // batch takes minutes and must not block the request, so it goes to `background`, which
  // asks the host to keep the instance alive until it finishes.
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
