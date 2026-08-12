'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui';
import type { SectorPlaybook } from '@/core/types';

const LIST_FIELDS = [
  ['essential_pages', 'Essential pages'],
  ['essential_conversion_actions', 'Essential conversion actions'],
  ['essential_trust_signals', 'Essential trust signals'],
  ['weak_website_signals', 'Signs of a weak website'],
  ['rebuild_conditions', 'Conditions that justify a rebuild'],
  ['targeted_improvement_conditions', 'Conditions for targeted improvements only'],
  ['competitor_signals', 'Competitor signals to evaluate'],
  ['outreach_angles', 'Recommended outreach angles'],
] as const;

export function PlaybookManager({ playbooks }: { playbooks: SectorPlaybook[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(playbook: SectorPlaybook) {
    setEditing(playbook.id);
    setError(null);
    setDraft({
      website_importance_score: playbook.website_importance_score,
      common_customer_journey: playbook.common_customer_journey,
      approval_status: playbook.approval_status,
      ...Object.fromEntries(LIST_FIELDS.map(([key]) => [key, playbook[key].join('\n')])),
    });
  }

  async function save(id: string) {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        website_importance_score: Number(draft.website_importance_score),
        common_customer_journey: String(draft.common_customer_journey ?? ''),
        approval_status: draft.approval_status,
      };
      for (const [key] of LIST_FIELDS) {
        payload[key] = String(draft[key] ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const res = await fetch(`/api/playbooks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Could not save the playbook.');
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {playbooks.map((playbook) => (
        <Card key={playbook.id}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>
                {playbook.sector} › {playbook.sub_sector}
              </CardTitle>
              <p className="mt-1 text-xs text-muted">
                {playbook.business_model} · expects {playbook.expected_website_role.replace(/_/g, ' ')} · v
                {playbook.version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={playbook.approval_status === 'approved' ? 'success' : 'warning'}>
                {playbook.approval_status.replace(/_/g, ' ')}
              </Badge>
              <Badge tone="brand">importance {playbook.website_importance_score}</Badge>
              <Button size="sm" variant="secondary" onClick={() => (editing === playbook.id ? setEditing(null) : startEdit(playbook))}>
                {editing === playbook.id ? 'Close' : 'Edit'}
              </Button>
            </div>
          </CardHeader>

          <CardBody>
            {editing === playbook.id ? (
              <>
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <Field
                    label="Website importance score (0–100)"
                    hint="This is the primary driver of S. Company evidence can only shift it by ±8."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.website_importance_score as number}
                      onChange={(e) => setDraft((d) => ({ ...d, website_importance_score: Number(e.target.value) }))}
                    />
                  </Field>
                  <Field label="Approval status" hint="Only approved playbooks influence scoring.">
                    <Select
                      value={draft.approval_status as string}
                      onChange={(e) => setDraft((d) => ({ ...d, approval_status: e.target.value }))}
                    >
                      <option value="approved">approved</option>
                      <option value="draft">draft</option>
                      <option value="ai_suggested_unapproved">ai suggested — unapproved</option>
                      <option value="archived">archived</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Common customer journey">
                  <Textarea
                    value={draft.common_customer_journey as string}
                    onChange={(e) => setDraft((d) => ({ ...d, common_customer_journey: e.target.value }))}
                  />
                </Field>

                <div className="grid gap-x-6 sm:grid-cols-2">
                  {LIST_FIELDS.map(([key, label]) => (
                    <Field key={key} label={label} hint="One per line.">
                      <Textarea
                        className="min-h-28"
                        value={draft[key] as string}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    </Field>
                  ))}
                </div>

                {error && <p className="mb-3 text-sm text-danger">{error}</p>}

                <Button disabled={busy} onClick={() => save(playbook.id)}>
                  {busy ? 'Saving…' : 'Save (bumps the version)'}
                </Button>
              </>
            ) : (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <h3 className="font-bold">Customer journey</h3>
                  <p className="mt-1 text-muted">{playbook.common_customer_journey}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ListBlock title="Essential conversion actions" items={playbook.essential_conversion_actions} />
                  <ListBlock title="Essential trust signals" items={playbook.essential_trust_signals} />
                  <ListBlock title="Rebuild conditions" items={playbook.rebuild_conditions} />
                  <ListBlock title="Outreach angles" items={playbook.outreach_angles} />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-1 list-disc pl-4 text-xs">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
