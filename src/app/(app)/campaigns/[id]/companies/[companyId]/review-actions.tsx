'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@/components/ui';

export function ReviewActions({ companyId, reviewStatus }: { companyId: string; reviewStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function call(label: string, path: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST') {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'That action failed.');
        return;
      }
      if (json.detail) setNote(json.detail);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {reviewStatus !== 'unreviewed' && <Badge tone="accent">{reviewStatus}</Badge>}
        <Button
          size="sm"
          variant="accent"
          disabled={busy != null}
          onClick={() => call('approve', `/api/companies/${companyId}`, { review_status: 'approved' }, 'PATCH')}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={busy != null}
          onClick={() => call('reject', `/api/companies/${companyId}`, { review_status: 'rejected' }, 'PATCH')}
        >
          Reject
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy != null}
          onClick={() => call('rerun', `/api/companies/${companyId}/retry`, { wait: true })}
        >
          {busy === 'rerun' ? 'Re-running…' : 'Re-run analysis'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy != null}
          onClick={() =>
            call('outreach', `/api/companies/${companyId}/retry`, {
              steps: ['generate-outreach', 'finalize-company-report'],
              wait: true,
            })
          }
        >
          {busy === 'outreach' ? 'Regenerating…' : 'Regenerate outreach'}
        </Button>
      </div>
      {note && <p className="text-xs text-muted">{note}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
