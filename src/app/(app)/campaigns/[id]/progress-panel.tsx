'use client';

/**
 * Live batch progress.
 *
 * Polls the progress endpoint while anything is still running and shows a per-company,
 * per-step grid — a failure needs to be attributable to one company and one step, not to
 * "the batch".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Progress } from '@/components/ui';
import type { CampaignProgress } from '@/pipeline/runner';
import type { JobStatus } from '@/core/types';

const STEP_SHORT: Record<string, string> = {
  'validate-company': 'Validate',
  'check-website-status': 'Status',
  'scrape-company-website': 'Crawl',
  'run-pagespeed-audit': 'Audit',
  'detect-sector-and-business-model': 'Sector',
  'analyze-visual-design': 'Look',
  'discover-competitors': 'Find',
  'validate-competitors': 'Verify',
  'analyze-competitor-websites': 'Compare',
  'calculate-scores': 'Score',
  'generate-outreach': 'Outreach',
  'finalize-company-report': 'Finalise',
};

const STATUS_CLASS: Record<JobStatus, string> = {
  pending: 'bg-surface-2 text-muted',
  queued: 'bg-surface-2 text-muted',
  running: 'bg-info-soft text-info animate-pulse',
  succeeded: 'bg-success-soft text-success',
  skipped: 'bg-warning-soft text-warning',
  failed: 'bg-danger-soft text-danger',
  cancelled: 'bg-surface-2 text-muted line-through',
};

export function CampaignProgressPanel({
  campaignId,
  initialStatus,
}: {
  campaignId: string;
  initialStatus: string;
}) {
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/progress`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setProgress(json);
      setStatus(json.campaign_status);
    } catch {
      // A dropped poll is not worth surfacing; the next tick will pick it up.
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Poll only while there is something to watch.
    const active = status === 'running' || (progress != null && progress.percent < 100 && progress.running > 0);
    if (!active) return;
    timer.current = setTimeout(() => void load(), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, progress, load]);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? 'That action failed.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const running = status === 'running';

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Batch progress</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || running} onClick={() => post(`/api/campaigns/${campaignId}/run`)}>
            {running ? 'Running…' : progress && progress.finished_steps > 0 ? 'Re-run batch' : 'Start analysis'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !running}
            onClick={() => post(`/api/campaigns/${campaignId}/cancel`)}
          >
            Cancel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardBody>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        {progress ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="success">{progress.completed} completed</Badge>
              <Badge tone="warning">{progress.needs_review} need review</Badge>
              <Badge tone="danger">{progress.failed} failed</Badge>
              <Badge tone="info">{progress.running} running</Badge>
              <Badge tone="neutral">{progress.pending} pending</Badge>
              <span className="ml-auto tabular-nums text-muted">
                {progress.finished_steps}/{progress.total_steps} steps
              </span>
            </div>
            <Progress value={progress.percent} />

            <div className="table-wrap mt-5">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Company</th>
                    {Object.values(STEP_SHORT).map((label) => (
                      <th key={label} className="px-2 py-2 text-center font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {progress.per_company.map((company) => (
                    <tr key={company.company_id} className="border-t">
                      <td className="px-3 py-2">
                        <Link
                          className="font-medium hover:underline"
                          href={`/campaigns/${campaignId}/companies/${company.company_id}`}
                        >
                          {company.name}
                        </Link>
                      </td>
                      {company.steps.map((step) => (
                        <td key={step.step} className="px-2 py-2 text-center">
                          <span
                            title={`${step.step}: ${step.status}${step.summary ? ` — ${step.summary}` : ''}${step.error ? ` — ${step.error}` : ''}`}
                            className={`inline-block h-5 w-5 rounded-sm text-[10px] leading-5 ${STATUS_CLASS[step.status]}`}
                          >
                            {step.status === 'succeeded' ? '✓' : step.status === 'failed' ? '!' : step.status === 'skipped' ? '–' : ''}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="hint mt-3">
              Hover any cell for the step&apos;s outcome. ✓ succeeded · – skipped with a reason · ! failed.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Loading progress…</p>
        )}
      </CardBody>
    </Card>
  );
}
