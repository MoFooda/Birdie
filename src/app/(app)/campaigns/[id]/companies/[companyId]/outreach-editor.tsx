'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import type { OutreachFlow, OutreachMessage } from '@/core/types';

const STEP_TITLES: Record<number, string> = {
  1: 'Email 1 — Verified observation',
  2: 'Email 2 — Competitor pattern',
  3: 'Email 3 — Recommended opportunity',
  4: 'Email 4 — Breakup',
};

export function OutreachEditor({
  companyId,
  flow,
  messages,
  whatsappConsent,
}: {
  companyId: string;
  flow: OutreachFlow | null;
  messages: OutreachMessage[];
  whatsappConsent: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(messages.map((m) => [m.id, { subject: m.subject, body: m.body }])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(messageId: string) {
    setSaving(messageId);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, ...drafts[messageId] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Could not save that edit.');
        return;
      }
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  async function setFlowStatus(status: 'approved' | 'rejected') {
    if (!flow) return;
    setSaving('flow');
    try {
      await fetch(`/api/outreach/flows/${flow.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, status }),
      });
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Outreach</CardTitle>
        {flow && (
          <div className="flex items-center gap-2">
            <Badge tone={flow.status === 'approved' ? 'success' : flow.status === 'skipped' ? 'neutral' : 'brand'}>
              {flow.status}
            </Badge>
            {flow.status !== 'skipped' && (
              <>
                <Button size="sm" variant="accent" disabled={saving != null} onClick={() => setFlowStatus('approved')}>
                  Approve sequence
                </Button>
                <Button size="sm" variant="ghost" disabled={saving != null} onClick={() => setFlowStatus('rejected')}>
                  Reject
                </Button>
              </>
            )}
          </div>
        )}
      </CardHeader>

      <CardBody>
        {!flow && <p className="text-sm text-muted">Outreach has not been generated for this company yet.</p>}

        {flow?.status === 'skipped' && (
          <div className="rounded border border-warning bg-warning-soft px-3 py-2 text-sm">
            <strong>No outreach was written.</strong>
            <p className="mt-1">{flow.skipped_reason}</p>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        {messages.length > 0 && (
          <div className="space-y-5">
            {messages.map((message) => (
              <div key={message.id} className="rounded border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{STEP_TITLES[message.step]}</h3>
                  <Badge tone={message.confidence === 'high' ? 'success' : message.confidence === 'medium' ? 'info' : 'warning'}>
                    {message.confidence} confidence
                  </Badge>
                  {message.edited_by_human && <Badge tone="accent">edited by a human</Badge>}
                  {message.competitor_referenced && <Badge tone="neutral">cites {message.competitor_referenced}</Badge>}
                </div>

                <label className="label">Subject</label>
                <Input
                  value={drafts[message.id]?.subject ?? message.subject}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [message.id]: { ...d[message.id]!, subject: e.target.value } }))
                  }
                />

                <label className="label mt-3">Body</label>
                <Textarea
                  className="min-h-48 font-sans"
                  dir={flow?.language === 'ar' ? 'rtl' : 'ltr'}
                  value={drafts[message.id]?.body ?? message.body}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [message.id]: { ...d[message.id]!, body: e.target.value } }))
                  }
                />

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" disabled={saving != null} onClick={() => save(message.id)}>
                    {saving === message.id ? 'Saving…' : 'Save edit'}
                  </Button>
                  <span className="text-xs text-muted">CTA: {message.cta}</span>
                </div>

                {message.evidence_used.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium">
                      Evidence this email is built on ({message.evidence_used.length})
                    </summary>
                    <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                      {message.evidence_used.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {flow && flow.whatsapp_drafts.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold">WhatsApp drafts</h3>
            <div
              className={`mt-2 rounded border px-3 py-2 text-sm ${
                whatsappConsent ? 'border-info bg-info-soft' : 'border-danger bg-danger-soft'
              }`}
            >
              {whatsappConsent
                ? 'This contact has WhatsApp consent recorded. These are still drafts — the MVP does not send WhatsApp messages.'
                : 'No WhatsApp consent is recorded for this contact. Do not send these. They are shown only so you can use them once consent exists.'}
            </div>
            {flow.whatsapp_drafts.map((draft) => (
              <Textarea
                key={draft.step}
                readOnly
                className="mt-2"
                dir={flow.language === 'ar' ? 'rtl' : 'ltr'}
                value={draft.body}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
