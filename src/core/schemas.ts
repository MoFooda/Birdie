/**
 * Zod schemas for every structured AI output.
 *
 * The AI provider is asked for JSON matching these shapes and the response is parsed
 * here before it touches the rest of the system. A response that does not validate is
 * discarded and the step reports `needs_review` — a malformed model answer must never
 * become a business claim.
 */

import { z } from 'zod';
import {
  BUSINESS_MODELS,
  CONFIDENCE_LEVELS,
  CUSTOMER_TYPES,
  FINDING_CATEGORIES,
  SEVERITIES,
  WEBSITE_ROLES,
} from './types';

export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);

// ---------------------------------------------------------------------------
// Sector and business model detection
// ---------------------------------------------------------------------------

export const sectorDetectionSchema = z.object({
  sector: z.string().min(1),
  sub_sector: z.string().min(1),
  business_model: z.enum(BUSINESS_MODELS),
  primary_customer_type: z.enum(CUSTOMER_TYPES),
  expected_website_role: z.enum(WEBSITE_ROLES),
  confidence: confidenceSchema,
  evidence: z.array(z.string()).min(1).max(8),
});
export type SectorDetection = z.infer<typeof sectorDetectionSchema>;

// ---------------------------------------------------------------------------
// Website interpretation
// ---------------------------------------------------------------------------

export const aiFindingSchema = z.object({
  title: z.string().min(1),
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(SEVERITIES),
  page_url: z.string().nullable(),
  /** Must quote or reference something supplied in the prompt evidence pack. */
  evidence: z.string().min(1),
  business_impact: z.string().min(1),
  recommended_action: z.string().min(1),
  confidence: confidenceSchema,
  suitable_for_outreach: z.boolean(),
});
export type AiFinding = z.infer<typeof aiFindingSchema>;

const score0to100 = z.number().min(0).max(100);

export const websiteAssessmentSchema = z.object({
  value_proposition_clarity: score0to100,
  customer_journey_clarity: score0to100,
  conversion_path_quality: score0to100,
  trust_and_credibility: score0to100,
  information_architecture: score0to100,
  fulfills_expected_role: z.boolean(),
  problems_are_structural: z.boolean(),
  rebuild_justified: z.boolean(),
  targeted_improvements_sufficient: z.boolean(),
  summary: z.string().min(1),
  confidence: confidenceSchema,
  findings: z.array(aiFindingSchema).max(12),
});
export type WebsiteAssessment = z.infer<typeof websiteAssessmentSchema>;

// ---------------------------------------------------------------------------
// Competitor discovery and validation
// ---------------------------------------------------------------------------

export const competitorCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().min(1),
  geography: z.string().nullable(),
  sub_sector: z.string().nullable(),
  relevance_reason: z.string().min(1),
  relevance_score: z.number().min(0).max(100),
  evidence_url: z.string().nullable(),
});
export type CompetitorCandidateOutput = z.infer<typeof competitorCandidateSchema>;

export const competitorCandidatesSchema = z.object({
  candidates: z.array(competitorCandidateSchema).max(10),
  limitations: z.array(z.string()).default([]),
});

export const competitorValidationSchema = z.object({
  valid: z.boolean(),
  relevance_score: z.number().min(0).max(100),
  reason: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------

export const outreachMessageSchema = z.object({
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  subject: z.string().min(1).max(120),
  body: z.string().min(1),
  personalized_hook: z.string().min(1),
  /** Each entry must correspond to a verified finding or competitor observation. */
  evidence_used: z.array(z.string()),
  competitor_referenced: z.string().nullable(),
  cta: z.string().min(1),
  confidence: confidenceSchema,
  editable_variables: z.record(z.string(), z.string()).default({}),
});
export type OutreachMessageOutput = z.infer<typeof outreachMessageSchema>;

export const outreachFlowSchema = z.object({
  messages: z.array(outreachMessageSchema).length(4),
  whatsapp_drafts: z
    .array(
      z.object({
        step: z.number().int().min(1).max(3),
        body: z.string().min(1),
      }),
    )
    .max(3)
    .default([]),
});
export type OutreachFlowOutput = z.infer<typeof outreachFlowSchema>;

// ---------------------------------------------------------------------------
// Campaign settings (also used by the create-campaign form)
// ---------------------------------------------------------------------------

export const campaignSettingsSchema = z.object({
  name: z.string().min(2, 'Campaign name is required'),
  target_geography: z.string().min(2, 'Target geography is required'),
  target_sectors: z.array(z.string().min(1)).min(1, 'Pick at least one target sector'),
  agency_service: z.string().min(2, 'Describe the service you are offering'),
  agency_value_proposition: z.string().min(10, 'Describe your value proposition'),
  sender_name: z.string().min(2),
  sender_role: z.string().min(2),
  sender_company: z.string().min(2),
  outreach_language: z.enum(['en', 'ar']),
  outreach_tone: z.enum(['professional', 'friendly', 'direct', 'consultative']),
  preferred_cta: z.string().min(2),
  competitors_to_analyze: z.number().int().min(1).max(10),
  min_score_for_outreach: z.number().int().min(0).max(100),
});
export type CampaignSettingsInput = z.infer<typeof campaignSettingsSchema>;

export const playbookSchema = z.object({
  sector: z.string().min(1),
  sub_sector: z.string().min(1),
  business_model: z.enum(BUSINESS_MODELS),
  website_importance_score: z.number().int().min(0).max(100),
  expected_website_role: z.enum(WEBSITE_ROLES),
  essential_pages: z.array(z.string()),
  essential_conversion_actions: z.array(z.string()),
  essential_trust_signals: z.array(z.string()),
  common_customer_journey: z.string(),
  weak_website_signals: z.array(z.string()),
  rebuild_conditions: z.array(z.string()),
  targeted_improvement_conditions: z.array(z.string()),
  competitor_signals: z.array(z.string()),
  outreach_angles: z.array(z.string()),
  approval_status: z.enum(['approved', 'draft', 'ai_suggested_unapproved', 'archived']),
});
export type PlaybookInput = z.infer<typeof playbookSchema>;

/**
 * Parse a provider payload against a schema without throwing.
 * Callers turn a failure into `needs_review`, never into a fabricated default.
 */
export function safeParseAi<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
  };
}
