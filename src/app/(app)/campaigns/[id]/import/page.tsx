import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import { PageHeader } from '@/components/ui';
import { ImportWizard } from './import-wizard';

export const dynamic = 'force-dynamic';

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const store = getStore();
  const campaign = await store.getCampaign(id);
  if (!campaign || campaign.owner_id !== session.userId) notFound();

  const existing = await store.listCompanies(id);

  return (
    <>
      <PageHeader
        title="Import an Apollo CSV"
        description={
          <>
            Upload the export, confirm how the columns map, then review exactly what will and will not be
            imported. Only company name, website and sector are required to run the website analysis.{' '}
            <Link className="text-brand underline" href={`/campaigns/${id}`}>
              Back to campaign
            </Link>
          </>
        }
      />
      <ImportWizard campaignId={id} existingCount={existing.length} />
    </>
  );
}
