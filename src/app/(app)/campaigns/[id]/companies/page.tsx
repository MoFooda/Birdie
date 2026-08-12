import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import { PageHeader } from '@/components/ui';
import { CompaniesTable, type CompanyRow } from './companies-table';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const store = getStore();

  const campaign = await store.getCampaign(id);
  if (!campaign || campaign.owner_id !== session.userId) notFound();

  const reports = await store.listReports(id);

  const rows: CompanyRow[] = reports.map((r) => ({
    id: r.company.id,
    name: r.company.name,
    domain: r.company.normalized_domain,
    website_status: r.status_check?.status ?? null,
    sector: r.company.sector,
    sub_sector: r.company.sub_sector,
    website_role: r.company.expected_website_role,
    transformation: r.score?.website_transformation_need ?? null,
    importance: r.score?.sector_website_importance ?? null,
    competitor: r.score?.competitor_website_usage ?? null,
    score: r.score?.potential_score ?? null,
    classification: r.score?.classification ?? null,
    action: r.score?.recommended_action ?? null,
    confidence: r.score?.confidence ?? null,
    pipeline_status: r.company.pipeline_status,
    review_status: r.company.review_status,
    needs_review: r.company.needs_manual_review,
    has_outreach: r.messages.length > 0,
    competitors: r.competitors.length,
  }));

  return (
    <>
      <PageHeader
        title="Company results"
        description={`${rows.length} companies in ${campaign.name}. Filter, review, then export.`}
      />
      <CompaniesTable campaignId={id} rows={rows} />
    </>
  );
}
