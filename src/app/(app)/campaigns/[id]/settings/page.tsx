import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import { PageHeader } from '@/components/ui';
import { CampaignForm } from '@/components/campaign-form';

export const dynamic = 'force-dynamic';

export default async function CampaignSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const store = getStore();

  const campaign = await store.getCampaign(id);
  if (!campaign || campaign.owner_id !== session.userId) notFound();
  const settings = await store.getSettings(id);

  return (
    <>
      <PageHeader
        title="Campaign settings"
        description="Changing these does not rewrite existing outreach. Re-run the outreach step on a company to regenerate it with the new settings — human edits are preserved either way."
      />
      <CampaignForm campaignId={id} initialName={campaign.name} initial={settings} />
    </>
  );
}
