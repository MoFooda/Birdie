/**
 * CSV export: one row per company.
 *
 * Email bodies contain newlines, quotes and commas, so fields are quoted per RFC 4180
 * (a literal `"` is doubled) and a UTF-8 BOM is prepended so Excel opens Arabic
 * outreach correctly instead of mangling it.
 */

import type { CompanyReport } from './types';
import { CLASSIFICATION_LABELS, ACTION_LABELS } from './scoring';
import { WEBSITE_STATUS_LABELS } from './website-status';
import type { CompetitorUsageSummary } from './competitor-scoring';
import { DESIGN_ERA_LABELS, type VisualAssessment, type VisualComparison } from './visual-schemas';

export function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const EXPORT_HEADERS = [
  'company_name',
  'website',
  'normalized_domain',
  'country',
  'city',
  'employee_count',
  'company_linkedin_url',
  'contact_first_name',
  'contact_last_name',
  'contact_job_title',
  'contact_email',
  'contact_phone',
  'contact_linkedin_url',
  'website_status',
  'website_status_reason',
  'sector',
  'sub_sector',
  'business_model',
  'website_role',
  'sector_website_importance',
  'website_transformation_need',
  'competitor_website_usage',
  'final_potential_score',
  'classification',
  'recommended_action',
  'confidence',
  'primary_problem',
  'primary_evidence',
  'competitor_pattern',
  'design_era',
  'design_era_confidence',
  'visual_verdict_vs_competitors',
  'best_outreach_angle',
  'email_1_subject',
  'email_1_body',
  'email_2_subject',
  'email_2_body',
  'email_3_subject',
  'email_3_body',
  'email_4_subject',
  'email_4_body',
  'whatsapp_drafts',
  'whatsapp_consent',
  'limitations',
  'report_url',
  'review_status',
  'pipeline_status',
];

export function reportToCsvRow(report: CompanyReport, baseUrl: string): string[] {
  const { company, contacts, status_check, score, messages, flow } = report;
  const contact = contacts[0] ?? null;
  const summary = (score?.competitor_summary ?? null) as CompetitorUsageSummary | null;
  const visual = (report.audit_run?.visual_assessment ?? null) as VisualAssessment | null;
  const visualComparison = (report.audit_run?.visual_comparison ?? null) as VisualComparison | null;

  const msg = (step: number) => messages.find((m) => m.step === step) ?? null;

  const competitorPattern =
    summary?.common_patterns?.slice(0, 3).join(' | ') ??
    (summary?.limitations?.[0] ?? 'not measured');

  const bestAngle =
    msg(1)?.personalized_hook ??
    report.playbook?.outreach_angles?.[0] ??
    score?.primary_reason ??
    '';

  const whatsapp = (flow?.whatsapp_drafts ?? [])
    .map((d) => `Step ${d.step}: ${d.body}`)
    .join('\n\n');

  return [
    company.name,
    company.submitted_website ?? '',
    company.normalized_domain ?? '',
    company.country ?? '',
    company.city ?? '',
    company.employee_count == null ? '' : String(company.employee_count),
    company.linkedin_url ?? '',
    contact?.first_name ?? '',
    contact?.last_name ?? '',
    contact?.job_title ?? '',
    contact?.email ?? '',
    contact?.phone ?? '',
    contact?.linkedin_url ?? '',
    status_check ? WEBSITE_STATUS_LABELS[status_check.status] : '',
    status_check?.status_reason ?? '',
    company.sector ?? company.apollo_sector ?? '',
    company.sub_sector ?? '',
    company.business_model ?? '',
    company.expected_website_role ?? '',
    score ? String(score.sector_website_importance) : '',
    score ? String(score.website_transformation_need) : '',
    score?.competitor_website_usage == null ? 'not measured' : String(score.competitor_website_usage),
    score ? String(score.potential_score) : '',
    score ? CLASSIFICATION_LABELS[score.classification] : '',
    score ? ACTION_LABELS[score.recommended_action] : '',
    score?.confidence ?? '',
    score?.primary_reason ?? '',
    (score?.supporting_evidence ?? []).slice(0, 3).join(' | '),
    competitorPattern,
    // "not assessed" rather than an empty cell: a blank reads as "fine", and this column
    // is empty far more often than it is negative.
    visual ? DESIGN_ERA_LABELS[visual.design_era] : 'not assessed',
    visual?.design_era_confidence ?? '',
    visualComparison ? visualComparison.company_stands_out_as.replace(/_/g, ' ') : 'not compared',
    bestAngle,
    msg(1)?.subject ?? '',
    msg(1)?.body ?? '',
    msg(2)?.subject ?? '',
    msg(2)?.body ?? '',
    msg(3)?.subject ?? '',
    msg(3)?.body ?? '',
    msg(4)?.subject ?? '',
    msg(4)?.body ?? '',
    whatsapp,
    contact?.whatsapp_consent ? 'yes' : 'no',
    (score?.limitations ?? []).join(' | '),
    `${baseUrl}/campaigns/${company.campaign_id}/companies/${company.id}`,
    company.review_status,
    company.pipeline_status,
  ];
}

export function buildExportCsv(reports: CompanyReport[], baseUrl: string): string {
  return toCsv(EXPORT_HEADERS, reports.map((r) => reportToCsvRow(r, baseUrl)));
}
