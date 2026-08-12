import { PageHeader } from '@/components/ui';
import { CampaignForm } from '@/components/campaign-form';

export const dynamic = 'force-dynamic';

export default function NewCampaignPage() {
  return (
    <>
      <PageHeader
        title="New campaign"
        description="These settings shape every email the engine writes. Outreach only ever offers the service you configure here — it will not invent an offer you do not sell."
      />
      <CampaignForm />
    </>
  );
}
