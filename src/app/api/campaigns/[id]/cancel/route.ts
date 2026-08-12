import { NextResponse } from 'next/server';
import { ownedCampaign, withSession } from '@/lib/api';
import { cancelCampaign } from '@/pipeline/dispatch';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const POST = withSession(async (ctx, _request: Request, { params }: Params) => {
  const { id } = await params;
  await ownedCampaign(ctx, id);

  // Cancellation is cooperative: running steps finish, queued ones are skipped.
  cancelCampaign(id);
  await ctx.store.updateCampaign(id, { status: 'cancelled' });

  return NextResponse.json({
    cancelled: true,
    detail: 'Steps already in flight will finish; nothing further will start.',
  });
});
