/**
 * Demo screenshot placeholder.
 *
 * Renders a labelled card rather than a mock browser capture. A fabricated screenshot
 * would be exactly the kind of invented evidence this product must never produce, so the
 * placeholder says plainly that it is demo data and summarises what the fixture site
 * actually contains.
 */

import { NextResponse } from 'next/server';
import { findSiteSpec } from '@/fixtures/data';
import { SIGNAL_LABELS } from '@/core/audit-checks';

export const dynamic = 'force-dynamic';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') ?? '';
  const viewport = url.searchParams.get('viewport') === 'desktop' ? 'desktop' : 'mobile';
  const spec = findSiteSpec(domain);

  const width = viewport === 'desktop' ? 1200 : 420;
  const height = viewport === 'desktop' ? 750 : 760;

  const features = (spec?.features ?? [])
    .map((f) => SIGNAL_LABELS[f] ?? f.replace(/_/g, ' '))
    .slice(0, 10);

  const lines = features.length > 0 ? features : ['no conversion or trust markup in this fixture'];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Demo placeholder for ${escape(domain)}">
  <rect width="100%" height="100%" fill="#eef2f7"/>
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="14" fill="#ffffff" stroke="#dde4ed"/>
  <rect x="10" y="10" width="${width - 20}" height="54" rx="14" fill="#1d4ed8"/>
  <text x="30" y="44" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#ffffff">DEMO FIXTURE — not a real screenshot</text>
  <text x="30" y="106" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#16202e">${escape(spec?.name ?? domain)}</text>
  <text x="30" y="134" font-family="ui-monospace, monospace" font-size="14" fill="#5d6b7f">${escape(domain)} · ${viewport}</text>
  <text x="30" y="176" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#16202e">Markup present in this fixture site:</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="30" y="${206 + i * 26}" font-family="system-ui, sans-serif" font-size="14" fill="#5d6b7f">• ${escape(line)}</text>`,
    )
    .join('\n  ')}
  <text x="30" y="${height - 34}" font-family="system-ui, sans-serif" font-size="12" fill="#5d6b7f">Connect Firecrawl and disable DEMO_MODE to capture real screenshots.</text>
</svg>`;

  return new NextResponse(svg, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
