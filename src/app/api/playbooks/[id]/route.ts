import { NextResponse } from 'next/server';
import { withSession } from '@/lib/api';
import { playbookSchema } from '@/core/schemas';
import { NotFoundError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const PATCH = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  const existing = await ctx.store.getPlaybook(id);
  if (!existing) throw new NotFoundError('Playbook not found');

  const parsed = playbookSchema.partial().safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the playbook fields.', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // The store bumps `version` whenever content changes, so a scored company can always
  // be traced back to the revision that produced its sector importance.
  const playbook = await ctx.store.updatePlaybook(id, parsed.data);
  return NextResponse.json({ playbook });
});
