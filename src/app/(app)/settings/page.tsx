import { requireSession } from '@/lib/auth';
import { connectionStatuses, env } from '@/lib/env';
import { dispatchMode } from '@/pipeline/dispatch';
import { getStore } from '@/store';
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireSession();
  const statuses = connectionStatuses();
  const store = getStore();

  return (
    <>
      <PageHeader
        title="Settings and connections"
        description="What each provider is doing right now. A provider that is not configured reports its results as not run — it is never replaced with an invented value."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider connections</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-4">
              {statuses.map((status) => (
                <li key={status.key} className="border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{status.label}</span>
                    <Badge tone={modeTone(status.mode)}>{status.mode}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{status.detail}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Runtime</CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              <dl className="space-y-1">
                <Row label="Demo mode" value={env.demoMode ? 'on — all providers served from fixtures' : 'off'} />
                <Row label="Data store" value={store.kind === 'supabase' ? 'Supabase Postgres' : 'in-memory (demo)'} />
                <Row label="Job runner" value={dispatchMode() === 'trigger' ? 'Trigger.dev' : 'in-process'} />
                <Row label="Pipeline concurrency" value={String(env.pipelineConcurrency)} />
                <Row label="Max companies per batch" value={String(env.maxCompaniesPerBatch)} />
                <Row label="App URL" value={env.appUrl} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What the engine will not do</CardTitle>
            </CardHeader>
            <CardBody className="text-sm text-muted">
              <ul className="list-disc space-y-1 pl-5">
                <li>Claim a technical problem it did not measure.</li>
                <li>Report a site it could not read as offline.</li>
                <li>Invent a competitor to reach three.</li>
                <li>Quote traffic, revenue or loss figures.</li>
                <li>Recommend a service the campaign has not configured.</li>
                <li>Send WhatsApp messages, or treat a draft as consented.</li>
                <li>Bypass authentication or fetch content behind a login.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-48 shrink-0 text-muted">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function modeTone(mode: string) {
  if (mode === 'live') return 'success' as const;
  if (mode === 'fixture') return 'warning' as const;
  if (mode === 'fallback') return 'info' as const;
  return 'danger' as const;
}
