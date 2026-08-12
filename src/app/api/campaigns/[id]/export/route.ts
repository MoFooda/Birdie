import { ownedCampaign, withSession } from '@/lib/api';
import { buildExportCsv } from '@/core/export-csv';
import { env } from '@/lib/env';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  const campaign = await ownedCampaign(ctx, id);

  const url = new URL(request.url);
  const onlyApproved = url.searchParams.get('approved') === 'true';
  const minScore = Number(url.searchParams.get('minScore') ?? '0');

  let reports = await ctx.store.listReports(id);
  if (onlyApproved) reports = reports.filter((r) => r.company.review_status === 'approved');
  if (minScore > 0) reports = reports.filter((r) => (r.score?.potential_score ?? 0) >= minScore);

  const csv = buildExportCsv(reports, env.appUrl);
  const filename = `${campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-opportunities.csv`;

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
});
