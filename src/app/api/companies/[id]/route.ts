import { NextResponse } from 'next/server';
import { ownedCompany, withSession } from '@/lib/api';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = withSession(async (ctx, _request: Request, { params }: Params) => {
  const { id } = await params;
  await ownedCompany(ctx, id);
  const report = await ctx.store.getReport(id);
  return NextResponse.json({ report });
});

const patchSchema = z.object({
  review_status: z.enum(['unreviewed', 'approved', 'rejected', 'edited']).optional(),
  needs_manual_review: z.boolean().optional(),
});

export const PATCH = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  await ownedCompany(ctx, id);

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unsupported review update.' }, { status: 422 });
  }

  // Approving or rejecting a row resolves its manual-review flag unless the caller
  // explicitly keeps it open.
  const resolvesReview = parsed.data.review_status === 'approved' || parsed.data.review_status === 'rejected';
  const company = await ctx.store.updateCompany(id, {
    ...parsed.data,
    needs_manual_review: parsed.data.needs_manual_review ?? (resolvesReview ? false : undefined),
  });

  return NextResponse.json({ company });
});
