import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  ScoreDial,
  SourceChip,
} from '@/components/ui';
import { ACTION_LABELS, CLASSIFICATION_LABELS } from '@/core/scoring';
import { WEBSITE_STATUS_LABELS } from '@/core/website-status';
import { SIGNAL_LABELS } from '@/core/audit-checks';
import type { CompetitorUsageSummary } from '@/core/competitor-scoring';
import type { ScoreComponentBreakdown, Severity } from '@/core/types';
import { ReviewActions } from './review-actions';
import { OutreachEditor } from './outreach-editor';
import { AddCompetitor } from './add-competitor';

export const dynamic = 'force-dynamic';

export default async function CompanyReportPage({
  params,
}: {
  params: Promise<{ id: string; companyId: string }>;
}) {
  const { id, companyId } = await params;
  const session = await requireSession();
  const store = getStore();

  const campaign = await store.getCampaign(id);
  if (!campaign || campaign.owner_id !== session.userId) notFound();

  const report = await store.getReport(companyId);
  if (!report || report.company.campaign_id !== id) notFound();

  const { company, contacts, status_check, findings, competitors, candidates, score, flow, messages, playbook } =
    report;
  const contact = contacts[0] ?? null;
  const summary = (score?.competitor_summary ?? null) as CompetitorUsageSummary | null;

  const measured = findings.filter((f) => f.measurement_source !== 'ai_interpretation');
  const interpreted = findings.filter((f) => f.measurement_source === 'ai_interpretation');

  return (
    <>
      <PageHeader
        title={company.name}
        description={
          <>
            {company.normalized_domain ? (
              <a
                className="font-mono text-brand underline"
                href={`https://${company.normalized_domain}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {company.normalized_domain}
              </a>
            ) : (
              <span>No website supplied</span>
            )}
            {company.city && ` · ${company.city}`}
            {company.country && `, ${company.country}`}
            {company.employee_count != null && ` · ${company.employee_count} employees`}
            <span className="ml-2 text-xs">
              (company size is context only — it is not an input to any score)
            </span>
            <div className="mt-2">
              <Link className="text-brand underline" href={`/campaigns/${id}/companies`}>
                Back to results
              </Link>
            </div>
          </>
        }
        actions={<ReviewActions companyId={companyId} reviewStatus={company.review_status} />}
      />

      {score?.requires_human_review && (
        <div className="mb-6 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm">
          <strong>Needs a human look before outreach.</strong>
          <ul className="mt-1 list-disc pl-5">
            {score.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Website status</CardTitle>
            </CardHeader>
            <CardBody>
              {status_check ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Badge tone="info">{WEBSITE_STATUS_LABELS[status_check.status]}</Badge>
                    <p className="mt-2 text-sm">{status_check.status_reason}</p>
                    <dl className="mt-3 space-y-1 text-xs text-muted">
                      <Row label="Submitted" value={status_check.submitted_domain ?? '—'} />
                      <Row label="Normalised" value={status_check.normalized_domain ?? '—'} />
                      <Row label="Final URL" value={status_check.final_url ?? '—'} />
                      <Row label="HTTP status" value={status_check.http_status?.toString() ?? '—'} />
                      <Row
                        label="Redirects"
                        value={status_check.redirect_chain.length ? status_check.redirect_chain.join(' → ') : 'none'}
                      />
                      <Row label="Checked" value={new Date(status_check.checked_at).toLocaleString()} />
                      <Row label="Confidence" value={status_check.confidence} />
                    </dl>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium">Evidence</summary>
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                        {status_check.evidence.map((e, i) => (
                          <li key={i} className="break-words">{e}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <div>
                    {status_check.screenshot_url ? (
                      <img
                        src={status_check.screenshot_url}
                        alt={`Screenshot of ${company.name}'s homepage`}
                        className="w-full rounded border"
                      />
                    ) : (
                      <div className="flex h-full min-h-40 items-center justify-center rounded border border-dashed text-xs text-muted">
                        No screenshot captured
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">The website status check has not run yet.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Measured findings</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-sm text-muted">
                Every item here restates something the audit actually observed. Nothing in this list is inferred.
              </p>
              <FindingList findings={measured} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI interpretation</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-sm text-muted">
                Judgements drawn from the measured evidence above. Treated as opinion, weighted at 14 of the
                transformation-need points, and never used to assert a technical fact.
              </p>
              {interpreted.length === 0 ? (
                <p className="text-sm text-muted">AI interpretation did not run for this company.</p>
              ) : (
                <FindingList findings={interpreted} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Competitor comparison</CardTitle>
              <AddCompetitor companyId={companyId} />
            </CardHeader>
            <CardBody>
              {summary?.limitations?.length ? (
                <div className="mb-4 rounded border border-warning bg-warning-soft px-3 py-2 text-xs">
                  {summary.limitations.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </div>
              ) : null}

              {competitors.length === 0 ? (
                <p className="text-sm text-muted">
                  No competitor was validated for this company. Rather than fill the gap with a guess, the
                  competitor component was left unmeasured and the final score dropped its term.
                </p>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-3 py-2">Competitor</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Usage</th>
                          <th className="px-3 py-2">Signals present</th>
                        </tr>
                      </thead>
                      <tbody>
                        {competitors.map((c) => (
                          <tr key={c.id} className="border-t align-top">
                            <td className="px-3 py-2">
                              <a
                                className="font-medium text-brand underline"
                                href={c.website}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {c.name}
                              </a>
                              <div className="text-xs text-muted">{c.relevance_reason}</div>
                              {c.source === 'manual' && <Badge tone="accent">added manually</Badge>}
                            </td>
                            <td className="px-3 py-2">
                              <Badge tone="neutral">{WEBSITE_STATUS_LABELS[c.website_status]}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.usage_score}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(c.signals)
                                  .filter(([, v]) => v === true)
                                  .map(([k]) => (
                                    <Badge key={k} tone="success">
                                      {SIGNAL_LABELS[k] ?? k}
                                    </Badge>
                                  ))}
                                {Object.values(c.signals).every((v) => v !== true) && (
                                  <span className="text-xs text-muted">nothing measurable</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {summary && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-bold">Patterns across competitors</h3>
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                          {summary.common_patterns.length === 0 ? (
                            <li>No pattern was shared by a majority of competitors.</li>
                          ) : (
                            summary.common_patterns.map((p) => <li key={p}>{p}</li>)
                          )}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">Where this company differs</h3>
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                          {summary.gaps_vs_company.length === 0 ? (
                            <li>No gap against the common competitor pattern.</li>
                          ) : (
                            summary.gaps_vs_company.map((g) => <li key={g}>{g}</li>)
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}

              {candidates.filter((c) => c.validation_status === 'rejected').length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-medium">
                    Rejected candidates ({candidates.filter((c) => c.validation_status === 'rejected').length})
                  </summary>
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {candidates
                      .filter((c) => c.validation_status === 'rejected')
                      .map((c) => (
                        <li key={c.id}>
                          <strong>{c.name}</strong> — {c.rejection_reason}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </CardBody>
          </Card>

          <OutreachEditor
            companyId={companyId}
            flow={flow}
            messages={messages}
            whatsappConsent={contact?.whatsapp_consent === true}
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Opportunity score</CardTitle>
            </CardHeader>
            <CardBody>
              {score ? (
                <>
                  <div className="mb-4 rounded-lg border bg-brand-soft p-4 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-brand">Final potential score</p>
                    <p className="text-5xl font-extrabold tabular-nums text-brand">{score.potential_score}</p>
                    <p className="mt-1 text-sm font-medium">{CLASSIFICATION_LABELS[score.classification]}</p>
                  </div>

                  <div className="grid gap-3">
                    <ScoreDial
                      label="Website transformation need (W)"
                      value={score.website_transformation_need}
                      caption={score.transformation_measured ? 'measured' : 'indeterminate placeholder — needs review'}
                    />
                    <ScoreDial
                      label="Sector website importance (S)"
                      value={score.sector_website_importance}
                      tone="accent"
                      caption={playbook ? `from playbook v${playbook.version}` : 'no playbook matched'}
                    />
                    <ScoreDial
                      label="Competitor website usage (C)"
                      value={score.competitor_website_usage}
                      tone="warning"
                      caption={score.competitor_measured ? 'measured' : 'not measured — C term dropped'}
                    />
                  </div>

                  <p className="mt-4 rounded border bg-surface-2/60 p-3 text-xs">
                    <code>
                      {score.competitor_measured
                        ? `round(${score.website_transformation_need} × ((0.65 × ${score.sector_website_importance} + 0.35 × ${score.competitor_website_usage}) / 100)) = ${score.potential_score}`
                        : `round(${score.website_transformation_need} × (${score.sector_website_importance} / 100)) = ${score.potential_score}`}
                    </code>
                  </p>

                  <div className="mt-4">
                    <h3 className="text-sm font-bold">Recommended action</h3>
                    <p className="mt-1">
                      <Badge tone="brand">{ACTION_LABELS[score.recommended_action]}</Badge>
                    </p>
                    <p className="mt-2 text-sm text-muted">{score.primary_reason}</p>
                    <p className="mt-2 text-xs text-muted">
                      The action follows the transformation need; the score above sets outreach priority.
                    </p>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-sm font-bold">Supporting evidence</h3>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                      {score.supporting_evidence.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>

                  <p className="mt-4 text-xs text-muted">
                    Overall confidence: <Badge tone={score.confidence === 'high' ? 'success' : score.confidence === 'medium' ? 'info' : 'danger'}>{score.confidence}</Badge>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">Scoring has not run for this company yet.</p>
              )}
            </CardBody>
          </Card>

          {score && (
            <Card>
              <CardHeader>
                <CardTitle>Score breakdown</CardTitle>
              </CardHeader>
              <CardBody className="space-y-5">
                <Breakdown title="Website transformation need" items={score.transformation_breakdown} />
                <Breakdown title="Sector website importance" items={score.importance_breakdown} />
                <Breakdown title="Competitor website usage" items={score.competitor_breakdown} />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Sector and business model</CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              <dl className="space-y-1">
                <Row label="Apollo industry" value={company.apollo_sector ?? '—'} />
                <Row label="Detected sector" value={company.sector ?? 'not detected'} />
                <Row label="Sub-sector" value={company.sub_sector ?? 'not detected'} />
                <Row label="Business model" value={company.business_model ?? 'not detected'} />
                <Row label="Primary customer" value={company.customer_type ?? 'not detected'} />
                <Row label="Expected website role" value={company.expected_website_role ?? 'not detected'} />
                <Row label="Confidence" value={company.sector_confidence ?? '—'} />
                <Row label="Playbook" value={playbook ? `${playbook.sub_sector} v${playbook.version}` : 'none matched'} />
              </dl>
              {company.sector_evidence.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium">Evidence</summary>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                    {company.sector_evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              {contact ? (
                <dl className="space-y-1">
                  <Row label="Name" value={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || '—'} />
                  <Row label="Title" value={contact.job_title ?? '—'} />
                  <Row label="Email" value={contact.email ?? '—'} />
                  <Row label="Phone" value={contact.phone ?? '—'} />
                  <Row label="WhatsApp consent" value={contact.whatsapp_consent ? 'yes' : 'no'} />
                </dl>
              ) : (
                <p className="text-muted">No contact was imported for this company.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job history</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-1 text-xs">
                {report.jobs
                  .slice()
                  .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))
                  .map((job) => (
                    <li key={job.id} className="flex items-start gap-2">
                      <Badge
                        tone={
                          job.status === 'succeeded'
                            ? 'success'
                            : job.status === 'failed'
                              ? 'danger'
                              : job.status === 'skipped'
                                ? 'warning'
                                : 'neutral'
                        }
                      >
                        {job.status}
                      </Badge>
                      <span>
                        <strong>{job.step}</strong>
                        <br />
                        <span className="text-muted">{job.output_summary ?? job.error_message ?? ''}</span>
                      </span>
                    </li>
                  ))}
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
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: ScoreComponentBreakdown[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{item.label}</span>
              <span className="tabular-nums text-muted">
                {item.points}/{item.max_points}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-surface-2">
              <div
                className="h-full bg-brand"
                style={{ width: `${item.max_points === 0 ? 0 : Math.min(100, (item.points / item.max_points) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-muted">{item.detail}</p>
            <div className="mt-1">
              <SourceChip source={item.source} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FindingList({
  findings,
}: {
  findings: Array<{
    id: string;
    title: string;
    category: string;
    severity: Severity;
    evidence: string;
    measurement_source: string;
    business_impact: string;
    recommended_action: string;
    confidence: string;
    suitable_for_outreach: boolean;
  }>;
}) {
  if (findings.length === 0) {
    return <p className="text-sm text-muted">Nothing to report.</p>;
  }
  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <li key={f.id} className="rounded border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
            <span className="font-medium">{f.title}</span>
            <Badge tone="neutral">{f.category.replace(/_/g, ' ')}</Badge>
            <SourceChip source={f.measurement_source} />
            {f.suitable_for_outreach && <Badge tone="brand">usable in outreach</Badge>}
          </div>
          <p className="mt-2 text-xs text-muted">
            <strong>Evidence:</strong> {f.evidence}
          </p>
          <p className="mt-1 text-xs text-muted">
            <strong>Business impact:</strong> {f.business_impact}
          </p>
          <p className="mt-1 text-xs text-muted">
            <strong>Recommended:</strong> {f.recommended_action}
          </p>
        </li>
      ))}
    </ul>
  );
}

function severityTone(severity: Severity) {
  if (severity === 'critical') return 'danger' as const;
  if (severity === 'high') return 'warning' as const;
  if (severity === 'medium') return 'info' as const;
  return 'neutral' as const;
}
