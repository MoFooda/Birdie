/**
 * CSV import: preview and commit.
 *
 * `POST` with `{ rows, mapping, commit: false }` validates and returns the full row list
 * with per-row issues so the UI can show exactly what will and will not be imported.
 * With `commit: true` the same validation runs again server-side before anything is
 * written — the client's preview is never trusted as the source of truth.
 */

import { NextResponse } from 'next/server';
import { ownedCampaign, withSession } from '@/lib/api';
import { missingRequiredMappings, validateImport, type CsvMapping } from '@/core/csv-mapping';
import { companyNameKey } from '@/core/domain';
import { importRows } from '@/core/import';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface ImportBody {
  rows: Record<string, string>[];
  mapping: CsvMapping;
  commit?: boolean;
}

export const POST = withSession(async (ctx, request: Request, { params }: Params) => {
  const { id } = await params;
  await ownedCampaign(ctx, id);

  const body = (await request.json()) as ImportBody;
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'No CSV rows were supplied.' }, { status: 400 });
  }

  const missing = missingRequiredMappings(body.mapping ?? {});
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Map the required columns first: ${missing.map((m) => m.label).join(', ')}.` },
      { status: 422 },
    );
  }

  if (body.rows.length > env.maxCompaniesPerBatch) {
    return NextResponse.json(
      { error: `A batch is limited to ${env.maxCompaniesPerBatch} companies. This file has ${body.rows.length}.` },
      { status: 422 },
    );
  }

  // Existing rows are fed into validation so a re-import cannot create duplicates.
  const existing = await ctx.store.listCompanies(id);
  const result = validateImport(
    body.rows,
    body.mapping,
    existing.map((c) => c.normalized_domain).filter((d): d is string => !!d),
    existing.map((c) => companyNameKey(c.name)),
  );

  if (!body.commit) {
    return NextResponse.json({ preview: true, ...result });
  }

  const imported = await importRows(ctx.store, id, result.rows);
  await ctx.store.updateCampaign(id, { status: 'ready' });

  return NextResponse.json({ preview: false, summary: result.summary, ...imported }, { status: 201 });
});
