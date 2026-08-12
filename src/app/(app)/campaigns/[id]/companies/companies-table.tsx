'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, EmptyState, Input, Select } from '@/components/ui';
import { CLASSIFICATION_LABELS, ACTION_LABELS } from '@/core/scoring';
import { WEBSITE_STATUS_LABELS } from '@/core/website-status';
import type {
  ConfidenceLevel,
  OpportunityClassification,
  RecommendedAction,
  WebsiteStatus,
} from '@/core/types';

export interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  website_status: WebsiteStatus | null;
  sector: string | null;
  sub_sector: string | null;
  website_role: string | null;
  transformation: number | null;
  importance: number | null;
  competitor: number | null;
  score: number | null;
  classification: OpportunityClassification | null;
  action: RecommendedAction | null;
  confidence: ConfidenceLevel | null;
  pipeline_status: string;
  review_status: string;
  needs_review: boolean;
  has_outreach: boolean;
  competitors: number;
}

const ANY = '';

export function CompaniesTable({ campaignId, rows }: { campaignId: string; rows: CompanyRow[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ANY);
  const [sector, setSector] = useState(ANY);
  const [subSector, setSubSector] = useState(ANY);
  const [classification, setClassification] = useState(ANY);
  const [action, setAction] = useState(ANY);
  const [confidence, setConfidence] = useState(ANY);
  const [job, setJob] = useState(ANY);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);

  const options = useMemo(
    () => ({
      statuses: unique(rows.map((r) => r.website_status)),
      sectors: unique(rows.map((r) => r.sector)),
      subSectors: unique(rows.map((r) => r.sub_sector)),
      classifications: unique(rows.map((r) => r.classification)),
      actions: unique(rows.map((r) => r.action)),
      jobs: unique(rows.map((r) => r.pipeline_status)),
    }),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => {
          if (search && !`${r.name} ${r.domain ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
          if (status && r.website_status !== status) return false;
          if (sector && r.sector !== sector) return false;
          if (subSector && r.sub_sector !== subSector) return false;
          if (classification && r.classification !== classification) return false;
          if (action && r.action !== action) return false;
          if (confidence && r.confidence !== confidence) return false;
          if (job && r.pipeline_status !== job) return false;
          if (reviewOnly && !r.needs_review) return false;
          if (minScore > 0 && (r.score ?? 0) < minScore) return false;
          return true;
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    [rows, search, status, sector, subSector, classification, action, confidence, job, reviewOnly, minScore],
  );

  function reset() {
    setSearch('');
    setStatus(ANY);
    setSector(ANY);
    setSubSector(ANY);
    setClassification(ANY);
    setAction(ANY);
    setConfidence(ANY);
    setJob(ANY);
    setReviewOnly(false);
    setMinScore(0);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <Input placeholder="Search name or domain" value={search} onChange={(e) => setSearch(e.target.value)} />

            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={ANY}>Any website status</option>
              {options.statuses.map((s) => (
                <option key={s} value={s}>
                  {WEBSITE_STATUS_LABELS[s as WebsiteStatus] ?? s}
                </option>
              ))}
            </Select>

            <Select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value={ANY}>Any sector</option>
              {options.sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>

            <Select value={subSector} onChange={(e) => setSubSector(e.target.value)}>
              <option value={ANY}>Any sub-sector</option>
              {options.subSectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>

            <Select value={classification} onChange={(e) => setClassification(e.target.value)}>
              <option value={ANY}>Any classification</option>
              {options.classifications.map((s) => (
                <option key={s} value={s}>
                  {CLASSIFICATION_LABELS[s as OpportunityClassification] ?? s}
                </option>
              ))}
            </Select>

            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value={ANY}>Any recommended action</option>
              {options.actions.map((s) => (
                <option key={s} value={s}>
                  {ACTION_LABELS[s as RecommendedAction] ?? s}
                </option>
              ))}
            </Select>

            <Select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              <option value={ANY}>Any confidence</option>
              <option value="high">High confidence</option>
              <option value="medium">Medium confidence</option>
              <option value="low">Low confidence</option>
            </Select>

            <Select value={job} onChange={(e) => setJob(e.target.value)}>
              <option value={ANY}>Any job status</option>
              {options.jobs.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>

            <label className="flex items-center gap-2 text-sm">
              <span className="whitespace-nowrap">Min score</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
              Needs manual review only
            </label>

            <Button variant="ghost" onClick={reset}>
              Reset filters
            </Button>

            <a href={`/api/campaigns/${campaignId}/export`} download>
              <Button variant="secondary" className="w-full">
                Export CSV
              </Button>
            </a>
          </div>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="No companies match these filters" />
      ) : (
        <div className="table-wrap">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Website status</th>
                <th className="px-3 py-2">Sub-sector</th>
                <th className="px-3 py-2 text-right" title="Website transformation need">W</th>
                <th className="px-3 py-2 text-right" title="Sector website importance">S</th>
                <th className="px-3 py-2 text-right" title="Competitor website usage">C</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Classification</th>
                <th className="px-3 py-2">Recommended action</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t hover:bg-surface-2/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/campaigns/${campaignId}/companies/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="font-mono text-xs text-muted">{row.domain ?? 'no domain'}</div>
                  </td>
                  <td className="px-3 py-2">
                    {row.website_status ? (
                      <Badge tone={statusTone(row.website_status)}>
                        {WEBSITE_STATUS_LABELS[row.website_status]}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.sub_sector ?? <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.transformation ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.importance ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.competitor ?? <span className="text-muted" title="not measured">n/m</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-base font-bold tabular-nums">{row.score ?? '—'}</td>
                  <td className="px-3 py-2">
                    {row.classification && (
                      <Badge tone={classificationTone(row.classification)}>
                        {CLASSIFICATION_LABELS[row.classification]}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.action ? ACTION_LABELS[row.action] : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.needs_review && <Badge tone="warning">review</Badge>}
                      {row.confidence && <Badge tone={row.confidence === 'high' ? 'success' : row.confidence === 'medium' ? 'info' : 'danger'}>{row.confidence}</Badge>}
                      {row.has_outreach && <Badge tone="brand">outreach</Badge>}
                      {row.review_status !== 'unreviewed' && <Badge tone="accent">{row.review_status}</Badge>}
                      {row.pipeline_status === 'failed' && <Badge tone="danger">failed</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

function statusTone(status: WebsiteStatus) {
  if (status === 'live' || status === 'live_after_redirect') return 'success' as const;
  if (status === 'bot_protection' || status === 'access_blocked' || status === 'timeout' || status === 'unknown_needs_review') {
    return 'info' as const;
  }
  if (status === 'partially_broken' || status === 'under_construction' || status === 'ssl_failure') {
    return 'warning' as const;
  }
  return 'danger' as const;
}

function classificationTone(c: OpportunityClassification) {
  if (c === 'very_high') return 'success' as const;
  if (c === 'high') return 'brand' as const;
  if (c === 'medium_manual_review') return 'warning' as const;
  if (c === 'low') return 'neutral' as const;
  return 'neutral' as const;
}
