import { NextResponse } from 'next/server';
import { ownedCampaign, withSession } from '@/lib/api';
import { campaignSettingsSchema } from '@/core/schemas';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = withSession(async (ctx, _request: Request, { params }: Params) => {
  const { id } = await params;
  const campaign = await ownedCampaign(ctx, id);
  const settings = await ctx.store.getSettings(id);
  const companies = await ctx.store.listCompanies(id);
  return NextResponse.json({ campaign, settings, company_count: companies.length });
});

export const PATCH = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  await ownedCampaign(ctx, id);

  const parsed = campaignSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the campaign settings.', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, ...settings } = parsed.data;
  const campaign = await ctx.store.updateCampaign(id, { name });
  const saved = await ctx.store.upsertSettings({
    ...settings,
    campaign_id: id,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ campaign, settings: saved });
});
