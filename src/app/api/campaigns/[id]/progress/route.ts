import { NextResponse } from 'next/server';
import { ownedCampaign, withSession } from '@/lib/api';
import { getCampaignProgress } from '@/pipeline/runner';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = withSession(async (ctx, _request: Request, { params }: Params) => {
  const { id } = await params;
  const campaign = await ownedCampaign(ctx, id);
  const progress = await getCampaignProgress(ctx.store, id);
  return NextResponse.json({ campaign_status: campaign.status, ...progress });
});
