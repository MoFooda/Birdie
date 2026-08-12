import { NextResponse } from 'next/server';
import { withSession } from '@/lib/api';
import { seedDemoCampaign } from '@/demo/seed';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const POST = withSession(async (ctx) => {
  if (!env.demoMode) {
    return NextResponse.json(
      { error: 'Demo seeding is only available when DEMO_MODE is enabled.' },
      { status: 403 },
    );
  }

  await ctx.store.ensureUser(ctx.session.userId, ctx.session.email);
  const seeded = await seedDemoCampaign(ctx.store, { ownerId: ctx.session.userId });
  return NextResponse.json(seeded, { status: 201 });
});
