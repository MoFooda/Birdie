/**
 * Schema validation for AI outputs.
 *
 * A model response that does not validate must be discarded, not repaired. These tests
 * pin that contract, because "the model said so" is exactly the kind of unverified claim
 * this product must never turn into a business assertion.
 */

import { describe, expect, it } from 'vitest';
import {
  outreachFlowSchema,
  safeParseAi,
  sectorDetectionSchema,
  websiteAssessmentSchema,
  competitorValidationSchema,
} from '@/core/schemas';

const validSector = {
  sector: 'Healthcare',
  sub_sector: 'Appointment-driven clinic',
  business_model: 'b2c_appointment',
  primary_customer_type: 'consumer',
  expected_website_role: 'appointment_booking',
  confidence: 'high',
  evidence: ['Apollo industry: Hospital & Health Care'],
};

describe('sectorDetectionSchema', () => {
  it('accepts a well-formed detection', () => {
    expect(safeParseAi(sectorDetectionSchema, validSector).ok).toBe(true);
  });

  it('rejects an invented business model', () => {
    const result = safeParseAi(sectorDetectionSchema, { ...validSector, business_model: 'b2c_vibes' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/business_model/);
  });

  it('rejects a detection with no evidence', () => {
    expect(safeParseAi(sectorDetectionSchema, { ...validSector, evidence: [] }).ok).toBe(false);
  });

  it('rejects a confidence value outside the allowed set', () => {
    expect(safeParseAi(sectorDetectionSchema, { ...validSector, confidence: 'very high' }).ok).toBe(false);
  });

  it('rejects a missing field rather than defaulting it', () => {
    const { sub_sector: _dropped, ...partial } = validSector;
    expect(safeParseAi(sectorDetectionSchema, partial).ok).toBe(false);
  });
});

describe('websiteAssessmentSchema', () => {
  const valid = {
    value_proposition_clarity: 70,
    customer_journey_clarity: 60,
    conversion_path_quality: 40,
    trust_and_credibility: 55,
    information_architecture: 65,
    fulfills_expected_role: false,
    problems_are_structural: false,
    rebuild_justified: false,
    targeted_improvements_sufficient: true,
    summary: 'Booking is missing.',
    confidence: 'medium',
    findings: [
      {
        title: 'No online booking',
        category: 'conversion',
        severity: 'high',
        page_url: 'https://example.com',
        evidence: 'No booking markup on 3 crawled pages.',
        business_impact: 'Patients cannot book in the moment.',
        recommended_action: 'Add booking to service pages.',
        confidence: 'high',
        suitable_for_outreach: true,
      },
    ],
  };

  it('accepts a well-formed assessment', () => {
    expect(safeParseAi(websiteAssessmentSchema, valid).ok).toBe(true);
  });

  it('rejects dimension scores outside 0–100', () => {
    expect(safeParseAi(websiteAssessmentSchema, { ...valid, conversion_path_quality: 140 }).ok).toBe(false);
    expect(safeParseAi(websiteAssessmentSchema, { ...valid, conversion_path_quality: -5 }).ok).toBe(false);
  });

  it('rejects a finding with an unknown category or severity', () => {
    const badCategory = { ...valid, findings: [{ ...valid.findings[0], category: 'vibes' }] };
    expect(safeParseAi(websiteAssessmentSchema, badCategory).ok).toBe(false);
    const badSeverity = { ...valid, findings: [{ ...valid.findings[0], severity: 'apocalyptic' }] };
    expect(safeParseAi(websiteAssessmentSchema, badSeverity).ok).toBe(false);
  });

  it('rejects a finding with empty evidence', () => {
    const noEvidence = { ...valid, findings: [{ ...valid.findings[0], evidence: '' }] };
    expect(safeParseAi(websiteAssessmentSchema, noEvidence).ok).toBe(false);
  });
});

describe('outreachFlowSchema', () => {
  const message = (step: number) => ({
    step,
    subject: `Subject ${step}`,
    body: 'Body text',
    personalized_hook: 'hook',
    evidence_used: ['No booking markup found.'],
    competitor_referenced: null,
    cta: 'Worth a call?',
    confidence: 'high',
    editable_variables: { company_name: 'Acme' },
  });

  it('requires exactly four messages', () => {
    expect(safeParseAi(outreachFlowSchema, { messages: [1, 2, 3, 4].map(message) }).ok).toBe(true);
    expect(safeParseAi(outreachFlowSchema, { messages: [1, 2, 3].map(message) }).ok).toBe(false);
    expect(safeParseAi(outreachFlowSchema, { messages: [1, 2, 3, 4, 1].map(message) }).ok).toBe(false);
  });

  it('rejects a step number outside 1–4', () => {
    expect(safeParseAi(outreachFlowSchema, { messages: [1, 2, 3, 9].map(message) }).ok).toBe(false);
  });

  it('rejects an over-long subject line', () => {
    const messages = [1, 2, 3, 4].map(message);
    messages[0]!.subject = 'x'.repeat(200);
    expect(safeParseAi(outreachFlowSchema, { messages }).ok).toBe(false);
  });

  it('defaults WhatsApp drafts to an empty list rather than failing', () => {
    const result = safeParseAi(outreachFlowSchema, { messages: [1, 2, 3, 4].map(message) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.whatsapp_drafts).toEqual([]);
  });
});

describe('competitorValidationSchema', () => {
  it('requires a reason for every verdict', () => {
    expect(safeParseAi(competitorValidationSchema, { valid: true, relevance_score: 80, reason: 'same sub-sector' }).ok).toBe(true);
    expect(safeParseAi(competitorValidationSchema, { valid: true, relevance_score: 80, reason: '' }).ok).toBe(false);
  });

  it('rejects a relevance score outside 0–100', () => {
    expect(safeParseAi(competitorValidationSchema, { valid: true, relevance_score: 150, reason: 'x' }).ok).toBe(false);
  });
});

describe('safeParseAi', () => {
  it('never throws on hostile payloads', () => {
    for (const payload of [null, undefined, 'string', 42, [], { nested: { deep: true } }]) {
      expect(() => safeParseAi(sectorDetectionSchema, payload)).not.toThrow();
      expect(safeParseAi(sectorDetectionSchema, payload).ok).toBe(false);
    }
  });

  it('returns a readable path for each problem', () => {
    const result = safeParseAi(sectorDetectionSchema, { ...validSector, confidence: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('confidence');
  });
});
