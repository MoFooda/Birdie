import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import { dispatchMode } from '@/pipeline/dispatch';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { CampaignProgressPanel } from './progress-panel';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const store = getStore();

  const campaign = await store.getCampaign(id);
  if (!campaign || campaign.owner_id !== session.userId) notFound();

  const settings = await store.getSettings(id);
  const companies = await store.listCompanies(id);
  const mode = dispatchMode();

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={
          settings
            ? `${settings.target_geography} · offering "${settings.agency_service}" · outreach in ${settings.outreach_language === 'ar' ? 'Arabic' : 'English'} at or above a score of ${settings.min_score_for_outreach}`
            : 'This campaign has no settings yet.'
        }
        actions={
          <>
            <Link href={`/campaigns/${id}/import`}>
              <Button variant="secondary">Import CSV</Button>
            </Link>
            <Link href={`/campaigns/${id}/companies`}>
              <Button variant="secondary">Company results</Button>
            </Link>
            <Link href={`/campaigns/${id}/settings`}>
              <Button variant="ghost">Settings</Button>
            </Link>
          </>
        }
      />

      {companies.length === 0 ? (
        <EmptyState title="No companies imported yet">
          <Link className="text-brand-strong underline" href={`/campaigns/${id}/import`}>
            Upload an Apollo CSV
          </Link>{' '}
          to get started.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <CampaignProgressPanel campaignId={id} initialStatus={campaign.status} />

          <Card>
            <CardHeader>
              <CardTitle>How this batch runs</CardTitle>
            </CardHeader>
            <CardBody className="text-sm text-muted">
              <p>
                Each company runs eleven steps independently.{' '}
                {mode === 'trigger'
                  ? 'Steps are queued on Trigger.dev, which handles retries, concurrency limits and durability.'
                  : 'Trigger.dev is not configured, so steps run on the built-in in-process runner with the same retry, concurrency and idempotency behaviour.'}
              </p>
              <p className="mt-2">
                A step that fails is recorded against that company alone — the rest of the batch carries on. Every
                step is keyed by company and step name, so retrying updates its row rather than creating a second
                one.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={mode === 'trigger' ? 'success' : 'info'}>
                  {mode === 'trigger' ? 'Trigger.dev' : 'In-process runner'}
                </Badge>
                <Badge tone="neutral">{companies.length} companies</Badge>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
