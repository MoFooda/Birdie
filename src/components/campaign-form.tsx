'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui';
import type { CampaignSettings } from '@/core/types';

export interface CampaignFormProps {
  campaignId?: string;
  initialName?: string;
  initial?: CampaignSettings | null;
}

const DEFAULTS = {
  target_geography: 'United Arab Emirates',
  target_sectors: 'Healthcare, Retail, Professional Services',
  agency_service: 'Website design and rebuild',
  agency_value_proposition: '',
  sender_name: '',
  sender_role: '',
  sender_company: '',
  outreach_language: 'en' as const,
  outreach_tone: 'consultative' as const,
  preferred_cta: 'Worth a 15-minute call to walk through what we found?',
  competitors_to_analyze: 3,
  min_score_for_outreach: 40,
};

export function CampaignForm({ campaignId, initialName, initial }: CampaignFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: initialName ?? '',
    target_geography: initial?.target_geography ?? DEFAULTS.target_geography,
    target_sectors: initial?.target_sectors.join(', ') ?? DEFAULTS.target_sectors,
    agency_service: initial?.agency_service ?? DEFAULTS.agency_service,
    agency_value_proposition: initial?.agency_value_proposition ?? DEFAULTS.agency_value_proposition,
    sender_name: initial?.sender_name ?? DEFAULTS.sender_name,
    sender_role: initial?.sender_role ?? DEFAULTS.sender_role,
    sender_company: initial?.sender_company ?? DEFAULTS.sender_company,
    outreach_language: initial?.outreach_language ?? DEFAULTS.outreach_language,
    outreach_tone: initial?.outreach_tone ?? DEFAULTS.outreach_tone,
    preferred_cta: initial?.preferred_cta ?? DEFAULTS.preferred_cta,
    competitors_to_analyze: initial?.competitors_to_analyze ?? DEFAULTS.competitors_to_analyze,
    min_score_for_outreach: initial?.min_score_for_outreach ?? DEFAULTS.min_score_for_outreach,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const issue = (key: string) => issues[key]?.[0] ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssues({});
    setSaved(false);

    const payload = {
      ...form,
      target_sectors: form.target_sectors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      competitors_to_analyze: Number(form.competitors_to_analyze),
      min_score_for_outreach: Number(form.min_score_for_outreach),
    };

    try {
      const res = await fetch(campaignId ? `/api/campaigns/${campaignId}` : '/api/campaigns', {
        method: campaignId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save the campaign.');
        setIssues(json.issues ?? {});
        return;
      }
      if (campaignId) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/campaigns/${json.campaign.id}/import`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Campaign and targeting</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Campaign name" error={issue('name')}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </Field>
          <Field label="Target geography" error={issue('target_geography')} hint="Used to judge whether a competitor serves the same market.">
            <Input value={form.target_geography} onChange={(e) => set('target_geography', e.target.value)} required />
          </Field>
          <Field label="Target sectors" error={issue('target_sectors')} hint="Comma separated.">
            <Input value={form.target_sectors} onChange={(e) => set('target_sectors', e.target.value)} required />
          </Field>
          <Field
            label="Competitors to analyse per company"
            error={issue('competitors_to_analyze')}
            hint="Three is the target. When fewer valid competitors exist the report says so rather than filling the gap."
          >
            <Input
              type="number"
              min={1}
              max={10}
              value={form.competitors_to_analyze}
              onChange={(e) => set('competitors_to_analyze', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Minimum potential score for outreach"
            error={issue('min_score_for_outreach')}
            hint="Companies below this score are analysed but no email is written."
          >
            <Input
              type="number"
              min={0}
              max={100}
              value={form.min_score_for_outreach}
              onChange={(e) => set('min_score_for_outreach', Number(e.target.value))}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your offer and voice</CardTitle>
        </CardHeader>
        <CardBody>
          <Field
            label="Service you are offering"
            error={issue('agency_service')}
            hint="Outreach will not recommend anything outside this."
          >
            <Input value={form.agency_service} onChange={(e) => set('agency_service', e.target.value)} required />
          </Field>
          <Field label="Value proposition" error={issue('agency_value_proposition')}>
            <Textarea
              value={form.agency_value_proposition}
              onChange={(e) => set('agency_value_proposition', e.target.value)}
              placeholder="What you do, for whom, and why it lands — in one or two sentences."
              required
            />
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="Sender name" error={issue('sender_name')}>
              <Input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} required />
            </Field>
            <Field label="Sender role" error={issue('sender_role')}>
              <Input value={form.sender_role} onChange={(e) => set('sender_role', e.target.value)} required />
            </Field>
            <Field label="Sender company" error={issue('sender_company')}>
              <Input value={form.sender_company} onChange={(e) => set('sender_company', e.target.value)} required />
            </Field>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Outreach language">
              <Select
                value={form.outreach_language}
                onChange={(e) => set('outreach_language', e.target.value as 'en' | 'ar')}
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </Select>
            </Field>
            <Field label="Tone">
              <Select
                value={form.outreach_tone}
                onChange={(e) => set('outreach_tone', e.target.value as typeof form.outreach_tone)}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="direct">Direct</option>
                <option value="consultative">Consultative</option>
              </Select>
            </Field>
          </div>
          <Field label="Preferred call to action" error={issue('preferred_cta')}>
            <Input value={form.preferred_cta} onChange={(e) => set('preferred_cta', e.target.value)} required />
          </Field>
        </CardBody>
      </Card>

      <div className="lg:col-span-2">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        {saved && <p className="mb-3 text-sm text-success">Campaign settings saved.</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Saving…' : campaignId ? 'Save settings' : 'Create campaign and continue to import'}
        </Button>
      </div>
    </form>
  );
}
