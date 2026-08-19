import { NextResponse } from 'next/server';
import { ownedCampaign, withSession } from '@/lib/api';
import { dispatchCampaignRun } from '@/pipeline/dispatch';

export const dynamic = 'force-dynamic';
/**
 * 300 seconds — the ceiling every Vercel plan accepts, Hobby included. A higher value is
 * not merely capped there; the build is rejected outright.
 *
 * A 50-company batch with `wait: true` can outrun this, and the platform will kill the
 * request when it does. That is survivable rather than destructive: every step is
 * idempotent and its outcome is recorded in `job_runs`, so re-running the batch picks up
 * where it stopped instead of duplicating work. The durable answer for batches that size
 * is Trigger.dev — see docs/DEPLOYMENT.md.
 */
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export const POST = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  await ownedCampaign(ctx, id);

  const settings = await ctx.store.getSettings(id);
  if (!settings) {
    return NextResponse.json({ error: 'Add the campaign settings before running a batch.' }, { status: 422 });
  }

  const companies = await ctx.store.listCompanies(id);
  if (companies.length === 0) {
    return NextResponse.json({ error: 'Import some companies before running a batch.' }, { status: 422 });
  }

  const body = (await request.json().catch(() => ({}))) as { companyIds?: string[]; wait?: boolean };
  const result = await dispatchCampaignRun(id, { companyIds: body.companyIds, wait: body.wait === true });

  return NextResponse.json(result, { status: 202 });
});
