/**
 * Manual competitor entry.
 *
 * When discovery finds fewer than three valid competitors the product refuses to invent
 * them, so a human needs a way to supply the ones they know. Manually added competitors
 * are marked `source: 'manual'` and survive a re-run of the discovery step.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ownedCompany, withSession } from '@/lib/api';
import { normalizeDomain } from '@/core/domain';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  name: z.string().min(1),
  website: z.string().min(3),
  geography: z.string().nullable().optional(),
});

export const POST = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  const company = await ownedCompany(ctx, id);

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'A competitor needs a name and a website.' }, { status: 422 });
  }

  const normalized = normalizeDomain(parsed.data.website);
  if (!normalized.ok || !normalized.domain) {
    return NextResponse.json(
      { error: `That website could not be read as a domain (${normalized.reason}).` },
      { status: 422 },
    );
  }

  const existing = await ctx.store.listCompetitors(id);
  if (existing.some((c) => c.normalized_domain === normalized.domain)) {
    return NextResponse.json({ error: 'That competitor is already on the list.' }, { status: 409 });
  }

  const competitor = await ctx.store.addCompetitor(id, {
    candidate_id: null,
    name: parsed.data.name,
    website: normalized.url!,
    normalized_domain: normalized.domain,
    geography: parsed.data.geography ?? null,
    sub_sector: company.sub_sector,
    relevance_score: 100,
    relevance_reason: 'Added manually by a reviewer.',
    // Not yet analysed: the next run of the competitor step will measure it.
    website_status: 'unknown_needs_review',
    usage_score: 0,
    signals: {},
    evidence: ['Added manually; re-run the competitor steps to measure this site.'],
    source: 'manual',
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ competitor }, { status: 201 });
});
