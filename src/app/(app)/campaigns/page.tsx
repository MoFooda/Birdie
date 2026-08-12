import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import { env } from '@/lib/env';
import { Badge, Card, CardBody, EmptyState, PageHeader, Progress } from '@/components/ui';
import { SeedDemoButton } from './seed-demo-button';
import { Button } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const session = await requireSession();
  const store = getStore();
  const campaigns = await store.listCampaigns(session.userId);

  const rows = await Promise.all(
    campaigns.map(async (campaign) => {
      const companies = await store.listCompanies(campaign.id);
      const done = companies.filter((c) =>
        ['completed', 'failed', 'needs_review', 'cancelled'].includes(c.pipeline_status),
      ).length;
      return { campaign, total: companies.length, done };
    }),
  );

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Each campaign holds one Apollo import, its settings and the analysis of every company in it."
        actions={
          <>
            {env.demoMode && <SeedDemoButton />}
            <Link href="/campaigns/new">
              <Button>New campaign</Button>
            </Link>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No campaigns yet">
          Create a campaign to set your outreach details, then upload an Apollo CSV.
          {env.demoMode && ' Or seed the demo campaign to see the full flow with thirteen sample companies.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ campaign, total, done }) => (
            <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-pop">
                <CardBody>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h2 className="font-bold">{campaign.name}</h2>
                    <Badge tone={statusTone(campaign.status)}>{campaign.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {total} {total === 1 ? 'company' : 'companies'} · {done} analysed
                  </p>
                  <Progress className="mt-3" value={total === 0 ? 0 : (done / total) * 100} />
                  <p className="mt-3 text-xs text-muted">
                    Created {new Date(campaign.created_at).toLocaleDateString()}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function statusTone(status: string) {
  if (status === 'running') return 'info' as const;
  if (status === 'completed') return 'success' as const;
  if (status === 'cancelled') return 'danger' as const;
  if (status === 'ready') return 'brand' as const;
  return 'neutral' as const;
}
