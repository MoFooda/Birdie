import { NextResponse } from 'next/server';
import { withSession } from '@/lib/api';
import { playbookSchema } from '@/core/schemas';

export const dynamic = 'force-dynamic';

export const GET = withSession(async (ctx) => {
  return NextResponse.json({ playbooks: await ctx.store.listPlaybooks() });
});

export const POST = withSession(async (ctx, request: Request) => {
  const parsed = playbookSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the playbook fields.', issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const playbook = await ctx.store.createPlaybook({ ...parsed.data, version: 1 });
  return NextResponse.json({ playbook }, { status: 201 });
});
