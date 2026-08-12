/**
 * Domain types for the Website Opportunity Engine.
 *
 * These mirror the Postgres schema in `supabase/migrations/0001_init.sql` one-for-one,
 * so the memory store and the Supabase store are interchangeable behind `DataStore`.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const WEBSITE_STATUSES = [
  'live',
  'live_after_redirect',
  'dns_failure',
  'ssl_failure',
  'timeout',
  'access_blocked',
  'bot_protection',
  'parked_domain',
  'domain_for_sale',
  'under_construction',
  'partially_broken',
  'invalid_domain',
  'no_website',
  'unknown_needs_review',
] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

/** Statuses where we successfully retrieved renderable content we can audit. */
export const REACHABLE_STATUSES: readonly WebsiteStatus[] = [
  'live',
  'live_after_redirect',
  'partially_broken',
];

export const WEBSITE_ROLES = [
  'ecommerce_transaction',
  'appointment_booking',
  'lead_generation',
  'demo_request',
  'request_for_quotation',
  'product_or_service_catalog',
  'trust_and_credibility',
  'local_footfall_support',
  'distributor_or_partner_acquisition',
  'recruitment_or_investor_info',
  'informational_only',
] as const;
export type WebsiteRole = (typeof WEBSITE_ROLES)[number];

export const BUSINESS_MODELS = [
  'b2c_ecommerce',
  'b2c_services',
  'b2c_appointment',
  'b2b_services',
  'b2b_saas',
  'b2b_manufacturing',
  'b2b2c_distribution',
  'marketplace',
  'nonprofit_or_public',
  'unknown',
] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const CUSTOMER_TYPES = ['consumer', 'business', 'both', 'unknown'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const OPPORTUNITY_CLASSIFICATIONS = [
  'very_high',
  'high',
  'medium_manual_review',
  'low',
  'skip',
] as const;
export type OpportunityClassification = (typeof OPPORTUNITY_CLASSIFICATIONS)[number];

export const RECOMMENDED_ACTIONS = [
  'new_website',
  'complete_rebuild',
  'major_redesign',
  'targeted_improvements',
  'minor_optimization',
  'no_action',
  'needs_review',
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_CATEGORIES = [
  'availability',
  'mobile',
  'performance',
  'seo',
  'content',
  'conversion',
  'trust',
  'information_architecture',
  'tracking',
  'technical',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

/**
 * How a claim was established. Surfaced in the UI so a reviewer can always tell a
 * measured fact from an AI interpretation — the product must never blur the two.
 */
export const MEASUREMENT_SOURCES = [
  'http_check',
  'dom_parse',
  'pagespeed',
  'screenshot',
  'ai_interpretation',
  'human',
  'fixture',
] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const JOB_STATUSES = [
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const COMPANY_PIPELINE_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'needs_review',
] as const;
export type CompanyPipelineStatus = (typeof COMPANY_PIPELINE_STATUSES)[number];

export const REVIEW_STATUSES = ['unreviewed', 'approved', 'rejected', 'edited'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'importing',
  'ready',
  'running',
  'paused',
  'completed',
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const OUTREACH_LANGUAGES = ['en', 'ar'] as const;
export type OutreachLanguage = (typeof OUTREACH_LANGUAGES)[number];

export const OUTREACH_TONES = [
  'professional',
  'friendly',
  'direct',
  'consultative',
] as const;
export type OutreachTone = (typeof OUTREACH_TONES)[number];

export const PLAYBOOK_APPROVAL_STATUSES = [
  'approved',
  'draft',
  'ai_suggested_unapproved',
  'archived',
] as const;
export type PlaybookApprovalStatus = (typeof PLAYBOOK_APPROVAL_STATUSES)[number];

export const VALIDATION_STATUSES = [
  'valid',
  'rejected',
  'unverified',
  'manual',
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** Sentinel results for anything a provider could not establish. Never invent a value instead. */
export const NOT_MEASURED = ['not_run', 'unavailable', 'needs_review'] as const;
export type NotMeasured = (typeof NOT_MEASURED)[number];

/** A tri-state measurement: true / false / explicitly-not-measured. */
export type Measured<T> = { value: T; source: MeasurementSource } | { value: null; reason: NotMeasured };

export const PIPELINE_STEPS = [
  'validate-company',
  'check-website-status',
  'scrape-company-website',
  'run-pagespeed-audit',
  'detect-sector-and-business-model',
  'discover-competitors',
  'validate-competitors',
  'analyze-competitor-websites',
  'calculate-scores',
  'generate-outreach',
  'finalize-company-report',
] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'member';
  created_at: string;
}

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface CampaignSettings {
  campaign_id: string;
  target_geography: string;
  target_sectors: string[];
  agency_service: string;
  agency_value_proposition: string;
  sender_name: string;
  sender_role: string;
  sender_company: string;
  outreach_language: OutreachLanguage;
  outreach_tone: OutreachTone;
  preferred_cta: string;
  competitors_to_analyze: number;
  min_score_for_outreach: number;
  updated_at: string;
}

export interface Company {
  id: string;
  campaign_id: string;
  name: string;
  submitted_website: string | null;
  normalized_domain: string | null;
  apollo_sector: string | null;
  description: string | null;
  employee_count: number | null;
  country: string | null;
  city: string | null;
  linkedin_url: string | null;
  apollo_company_id: string | null;
  /** Import-time validation issues, e.g. missing_website / duplicate / invalid_domain. */
  import_issues: string[];
  needs_manual_review: boolean;
  pipeline_status: CompanyPipelineStatus;
  review_status: ReviewStatus;
  /** Populated by detect-sector-and-business-model. */
  sector: string | null;
  sub_sector: string | null;
  business_model: BusinessModel | null;
  customer_type: CustomerType | null;
  expected_website_role: WebsiteRole | null;
  sector_confidence: ConfidenceLevel | null;
  sector_evidence: string[];
  playbook_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  apollo_contact_id: string | null;
  /** WhatsApp drafts are only generated when this is explicitly true. */
  whatsapp_consent: boolean;
  created_at: string;
}

export interface SectorPlaybook {
  id: string;
  sector: string;
  sub_sector: string;
  business_model: BusinessModel;
  website_importance_score: number;
  expected_website_role: WebsiteRole;
  essential_pages: string[];
  essential_conversion_actions: string[];
  essential_trust_signals: string[];
  common_customer_journey: string;
  weak_website_signals: string[];
  rebuild_conditions: string[];
  targeted_improvement_conditions: string[];
  competitor_signals: string[];
  outreach_angles: string[];
  version: number;
  approval_status: PlaybookApprovalStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditRun {
  id: string;
  campaign_id: string;
  company_id: string;
  status: JobStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  demo: boolean;
  /** Normalised technical audit for this run; shape: TechnicalAudit. */
  technical_audit: unknown | null;
  /** AI interpretation for this run; shape: AiWebsiteAssessment. */
  ai_assessment: unknown | null;
  /** Rates and gaps behind the competitor component; shape: CompetitorUsageSummary. */
  competitor_summary: unknown | null;
}

export interface WebsiteStatusCheck {
  id: string;
  company_id: string;
  submitted_domain: string | null;
  normalized_domain: string | null;
  final_url: string | null;
  status: WebsiteStatus;
  http_status: number | null;
  redirect_chain: string[];
  checked_at: string;
  screenshot_url: string | null;
  status_reason: string;
  evidence: string[];
  confidence: ConfidenceLevel;
}

export interface WebsitePage {
  id: string;
  company_id: string;
  url: string;
  page_type: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  status_code: number | null;
  html_excerpt: string | null;
  text_content: string | null;
  fetched_at: string;
}

export interface WebsiteFinding {
  id: string;
  company_id: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  page_url: string | null;
  evidence: string;
  measurement_source: MeasurementSource;
  business_impact: string;
  recommended_action: string;
  confidence: ConfidenceLevel;
  suitable_for_outreach: boolean;
  created_at: string;
}

export interface CompetitorCandidate {
  id: string;
  company_id: string;
  name: string;
  website: string | null;
  geography: string | null;
  sub_sector: string | null;
  relevance_reason: string;
  relevance_score: number;
  evidence_url: string | null;
  validation_status: ValidationStatus;
  rejection_reason: string | null;
  created_at: string;
}

export interface Competitor {
  id: string;
  company_id: string;
  candidate_id: string | null;
  name: string;
  website: string;
  normalized_domain: string;
  geography: string | null;
  sub_sector: string | null;
  relevance_score: number;
  relevance_reason: string;
  website_status: WebsiteStatus;
  usage_score: number;
  /** Presence map for the conversion/communication signals we probe. */
  signals: Record<string, boolean>;
  evidence: string[];
  source: 'discovered' | 'manual';
  created_at: string;
}

export interface CompetitorFinding {
  id: string;
  competitor_id: string;
  signal: string;
  present: boolean;
  evidence: string;
  measurement_source: MeasurementSource;
}

export interface ScoreComponentBreakdown {
  key: string;
  label: string;
  points: number;
  max_points: number;
  detail: string;
  source: MeasurementSource;
}

export interface ScoreResult {
  id: string;
  company_id: string;
  sector_website_importance: number;
  website_transformation_need: number;
  /** null when no competitor could be analysed — the formula degrades instead of guessing. */
  competitor_website_usage: number | null;
  competitor_measured: boolean;
  transformation_measured: boolean;
  potential_score: number;
  classification: OpportunityClassification;
  recommended_action: RecommendedAction;
  primary_reason: string;
  supporting_evidence: string[];
  confidence: ConfidenceLevel;
  limitations: string[];
  should_generate_outreach: boolean;
  requires_human_review: boolean;
  transformation_breakdown: ScoreComponentBreakdown[];
  competitor_breakdown: ScoreComponentBreakdown[];
  importance_breakdown: ScoreComponentBreakdown[];
  /** Rates, patterns and gaps behind the competitor component; shape: CompetitorUsageSummary. */
  competitor_summary: unknown | null;
  created_at: string;
}

/** Everything the report UI and the CSV export need for one company. */
export interface CompanyReport {
  company: Company;
  contacts: Contact[];
  status_check: WebsiteStatusCheck | null;
  pages: WebsitePage[];
  findings: WebsiteFinding[];
  candidates: CompetitorCandidate[];
  competitors: Competitor[];
  score: ScoreResult | null;
  flow: OutreachFlow | null;
  messages: OutreachMessage[];
  jobs: JobRun[];
  playbook: SectorPlaybook | null;
}

export interface OutreachFlow {
  id: string;
  company_id: string;
  contact_id: string | null;
  language: OutreachLanguage;
  tone: OutreachTone;
  status: 'generated' | 'edited' | 'approved' | 'rejected' | 'skipped';
  skipped_reason: string | null;
  whatsapp_drafts: WhatsAppDraft[];
  created_at: string;
  updated_at: string;
}

export interface WhatsAppDraft {
  step: number;
  body: string;
  /** Always true in the MVP: WhatsApp is draft-only and consent-gated. */
  consent_required: true;
  consent_on_file: boolean;
}

export interface OutreachMessage {
  id: string;
  flow_id: string;
  step: 1 | 2 | 3 | 4;
  kind: 'verified_observation' | 'competitor_pattern' | 'recommended_opportunity' | 'breakup';
  subject: string;
  body: string;
  personalized_hook: string;
  evidence_used: string[];
  competitor_referenced: string | null;
  cta: string;
  confidence: ConfidenceLevel;
  editable_variables: Record<string, string>;
  edited_by_human: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobRun {
  id: string;
  campaign_id: string;
  company_id: string | null;
  step: PipelineStep;
  status: JobStatus;
  attempt: number;
  /** Stable per (company, step) so a retry updates rather than duplicates. */
  idempotency_key: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  output_summary: string | null;
}

export interface ProviderUsage {
  id: string;
  campaign_id: string | null;
  company_id: string | null;
  provider: string;
  operation: string;
  succeeded: boolean;
  duration_ms: number;
  error_message: string | null;
  /** Raw provider payload, stored apart from normalised business data. */
  raw_response: unknown;
  created_at: string;
}
