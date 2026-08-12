import { NextResponse } from 'next/server';
import { withSession } from '@/lib/api';
import { campaignSettingsSchema } from '@/core/schemas';

export const dynamic = 'force-dynamic';

export const GET = withSession(async (ctx) => {
  const campaigns = await ctx.store.listCampaigns(ctx.session.userId);
  const withCounts = await Promise.all(
    campaigns.map(async (campaign) => {
      const companies = await ctx.store.listCompanies(campaign.id);
      return {
        ...campaign,
        company_count: companies.length,
        completed: companies.filter((c) => c.pipeline_status === 'completed').length,
      };
    }),
  );
  return NextResponse.json({ campaigns: withCounts });
});

export const POST = withSession(async (ctx, request: Request) => {
  const body = await request.json();
  const parsed = campaignSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the campaign settings.', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, ...settings } = parsed.data;
  const campaign = await ctx.store.createCampaign({
    owner_id: ctx.session.userId,
    name,
    status: 'draft',
  });
  await ctx.store.upsertSettings({
    ...settings,
    campaign_id: campaign.id,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ campaign }, { status: 201 });
});
