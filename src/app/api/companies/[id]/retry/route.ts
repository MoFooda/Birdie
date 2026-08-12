import { NextResponse } from 'next/server';
import { ownedCompany, withSession } from '@/lib/api';
import { dispatchCompanyRetry } from '@/pipeline/dispatch';
import { PIPELINE_STEPS, type PipelineStep } from '@/core/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export const POST = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  const company = await ownedCompany(ctx, id);

  const body = (await request.json().catch(() => ({}))) as { steps?: string[]; wait?: boolean };
  const steps = body.steps?.filter((s): s is PipelineStep => (PIPELINE_STEPS as readonly string[]).includes(s));

  if (body.steps && (!steps || steps.length === 0)) {
    return NextResponse.json({ error: 'None of the requested steps exist.' }, { status: 422 });
  }

  const result = await dispatchCompanyRetry(company.campaign_id, id, {
    steps,
    wait: body.wait === true,
  });

  return NextResponse.json(result, { status: 202 });
});
