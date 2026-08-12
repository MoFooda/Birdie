import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ownedCompany, withSession } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  company_id: z.string().min(1),
  status: z.enum(['generated', 'edited', 'approved', 'rejected', 'skipped']),
});

export const PATCH = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unsupported outreach status.' }, { status: 422 });
  }

  await ownedCompany(ctx, parsed.data.company_id);
  const flow = await ctx.store.updateOutreachFlow(id, { status: parsed.data.status });
  return NextResponse.json({ flow });
});
