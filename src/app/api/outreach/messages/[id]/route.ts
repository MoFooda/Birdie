import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSession, ownedCompany } from '@/lib/api';
import { NotFoundError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  company_id: z.string().min(1),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  cta: z.string().optional(),
});

export const PATCH = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nothing valid to update on this message.' }, { status: 422 });
  }

  await ownedCompany(ctx, parsed.data.company_id);
  const outreach = await ctx.store.getOutreach(parsed.data.company_id);
  const message = outreach.messages.find((m) => m.id === id);
  if (!message || !outreach.flow) throw new NotFoundError('Outreach message not found');

  const { company_id: _companyId, ...patch } = parsed.data;
  const updated = await ctx.store.updateOutreachMessage(id, { ...patch, edited_by_human: true });

  // A human edit is sticky: re-running generation will not overwrite it.
  if (outreach.flow.status === 'generated') {
    await ctx.store.updateOutreachFlow(outreach.flow.id, { status: 'edited' });
  }
  await ctx.store.updateCompany(parsed.data.company_id, { review_status: 'edited' });

  return NextResponse.json({ message: updated });
});
