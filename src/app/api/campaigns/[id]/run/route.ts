import { NextResponse } from 'next/server';
import { ownedCampaign, withSession } from '@/lib/api';
import { dispatchCampaignRun } from '@/pipeline/dispatch';

export const dynamic = 'force-dynamic';
// A 50-company batch can take a while when the runner is in-process and `wait` is set.
export const maxDuration = 800;

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
