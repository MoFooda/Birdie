import { describe, expect, it } from 'vitest';
import { buildExportCsv, csvEscape, EXPORT_HEADERS, toCsv } from '@/core/export-csv';
import type { CompanyReport } from '@/core/types';

describe('csvEscape', () => {
  it('leaves plain values alone', () => {
    expect(csvEscape('Acme')).toBe('Acme');
    expect(csvEscape(42)).toBe('42');
  });

  it('renders null and undefined as an empty field, not the word "null"', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes values containing a comma, quote or newline', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line one\nline two')).toBe('"line one\nline two"');
  });

  it('round-trips a full multiline email body', () => {
    const body = 'Hi Hana,\n\nI noticed there is no way to book online.\n\nWorth a call?\n\nNadia — "Birdie", MENA';
    const escaped = csvEscape(body);
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
    // Unescaping restores the original exactly.
    expect(escaped.slice(1, -1).replace(/""/g, '"')).toBe(body);
  });

  it('preserves Arabic text unchanged', () => {
    expect(csvEscape('مرحباً كريم')).toBe('مرحباً كريم');
  });
});

describe('toCsv', () => {
  it('emits a UTF-8 BOM so Excel reads Arabic correctly', () => {
    expect(toCsv(['a'], [['1']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('uses CRLF line endings', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('﻿a,b\r\n1,2\r\n');
  });
});

describe('buildExportCsv', () => {
  const report = (overrides: Partial<CompanyReport> = {}): CompanyReport =>
    ({
      company: {
        id: 'c1',
        campaign_id: 'camp1',
        name: 'Al Noor Dental Clinic',
        submitted_website: 'alnoordental.ae',
        normalized_domain: 'alnoordental.ae',
        apollo_sector: 'Hospital & Health Care',
        description: null,
        employee_count: 24,
        country: 'United Arab Emirates',
        city: 'Dubai',
        linkedin_url: null,
        apollo_company_id: null,
        import_issues: [],
        needs_manual_review: false,
        pipeline_status: 'completed',
        review_status: 'approved',
        sector: 'Healthcare',
        sub_sector: 'Appointment-driven clinic',
        business_model: 'b2c_appointment',
        customer_type: 'consumer',
        expected_website_role: 'appointment_booking',
        sector_confidence: 'high',
        sector_evidence: [],
        playbook_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      contacts: [],
      status_check: null,
      pages: [],
      findings: [],
      candidates: [],
      competitors: [],
      score: null,
      flow: null,
      messages: [],
      jobs: [],
      playbook: null,
      ...overrides,
    }) as CompanyReport;

  it('emits one row per company plus a header row', () => {
    const csv = buildExportCsv([report(), report()], 'https://app.example.com');
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('company_name');
  });

  it('exports every documented column', () => {
    const csv = buildExportCsv([report()], 'https://app.example.com');
    for (const header of EXPORT_HEADERS) {
      expect(csv).toContain(header);
    }
  });

  it('includes a link back to the company report', () => {
    const csv = buildExportCsv([report()], 'https://app.example.com');
    expect(csv).toContain('https://app.example.com/campaigns/camp1/companies/c1');
  });

  it('says "not measured" rather than 0 when the competitor score is unavailable', () => {
    const csv = buildExportCsv(
      [
        report({
          score: {
            id: 's1',
            company_id: 'c1',
            sector_website_importance: 88,
            website_transformation_need: 70,
            competitor_website_usage: null,
            competitor_measured: false,
            transformation_measured: true,
            potential_score: 62,
            classification: 'high',
            recommended_action: 'major_redesign',
            primary_reason: 'No booking path.',
            supporting_evidence: ['No booking markup found.'],
            confidence: 'medium',
            limitations: ['Competitor website usage could not be measured.'],
            should_generate_outreach: true,
            requires_human_review: true,
            transformation_breakdown: [],
            competitor_breakdown: [],
            importance_breakdown: [],
            competitor_summary: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      ],
      'https://app.example.com',
    );
    expect(csv).toContain('not measured');
    expect(csv).not.toMatch(/,0,62,/);
  });
});
