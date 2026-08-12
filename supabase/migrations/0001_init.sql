-- Website Opportunity Engine — initial schema.
--
-- Notes on the shape of this schema:
--   * Raw provider payloads live in `provider_usage.raw_response`, separate from the
--     normalised business tables, so a provider format change never corrupts analysis data.
--   * `job_runs.idempotency_key` is unique on (campaign, company, step). That single
--     constraint is what makes a retried background job update rather than duplicate.
--   * Per-company analysis tables cascade from `companies`, so re-running a company's
--     pipeline replaces its slice cleanly.
--   * RLS is on for every table. Access is scoped through campaign ownership; the
--     service-role key used by background jobs bypasses RLS by design.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type website_status as enum (
  'live', 'live_after_redirect', 'dns_failure', 'ssl_failure', 'timeout',
  'access_blocked', 'bot_protection', 'parked_domain', 'domain_for_sale',
  'under_construction', 'partially_broken', 'invalid_domain', 'no_website',
  'unknown_needs_review'
);

create type website_role as enum (
  'ecommerce_transaction', 'appointment_booking', 'lead_generation', 'demo_request',
  'request_for_quotation', 'product_or_service_catalog', 'trust_and_credibility',
  'local_footfall_support', 'distributor_or_partner_acquisition',
  'recruitment_or_investor_info', 'informational_only'
);

create type business_model as enum (
  'b2c_ecommerce', 'b2c_services', 'b2c_appointment', 'b2b_services', 'b2b_saas',
  'b2b_manufacturing', 'b2b2c_distribution', 'marketplace', 'nonprofit_or_public', 'unknown'
);

create type customer_type as enum ('consumer', 'business', 'both', 'unknown');

create type opportunity_classification as enum (
  'very_high', 'high', 'medium_manual_review', 'low', 'skip'
);

create type recommended_action as enum (
  'new_website', 'complete_rebuild', 'major_redesign', 'targeted_improvements',
  'minor_optimization', 'no_action', 'needs_review'
);

create type confidence_level as enum ('high', 'medium', 'low');
create type severity_level as enum ('critical', 'high', 'medium', 'low', 'info');

create type finding_category as enum (
  'availability', 'mobile', 'performance', 'seo', 'content', 'conversion', 'trust',
  'information_architecture', 'tracking', 'technical'
);

create type measurement_source as enum (
  'http_check', 'dom_parse', 'pagespeed', 'screenshot', 'ai_interpretation', 'human', 'fixture'
);

create type job_status as enum (
  'pending', 'queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'
);

create type company_pipeline_status as enum (
  'pending', 'running', 'completed', 'failed', 'cancelled', 'needs_review'
);

create type review_status as enum ('unreviewed', 'approved', 'rejected', 'edited');

create type campaign_status as enum (
  'draft', 'importing', 'ready', 'running', 'paused', 'completed', 'cancelled'
);

create type outreach_language as enum ('en', 'ar');
create type outreach_tone as enum ('professional', 'friendly', 'direct', 'consultative');
create type playbook_approval_status as enum ('approved', 'draft', 'ai_suggested_unapproved', 'archived');
create type validation_status as enum ('valid', 'rejected', 'unverified', 'manual');
create type outreach_flow_status as enum ('generated', 'edited', 'approved', 'rejected', 'skipped');
create type outreach_message_kind as enum (
  'verified_observation', 'competitor_pattern', 'recommended_opportunity', 'breakup'
);
create type competitor_source as enum ('discovered', 'manual');

create type pipeline_step as enum (
  'validate-company', 'check-website-status', 'scrape-company-website',
  'run-pagespeed-audit', 'detect-sector-and-business-model', 'discover-competitors',
  'validate-competitors', 'analyze-competitor-websites', 'calculate-scores',
  'generate-outreach', 'finalize-company-report'
);

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

-- Application profile mirroring auth.users; the app never reads auth.users directly.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete cascade,
  name text not null,
  status campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_owner_idx on campaigns (owner_id, created_at desc);

create table campaign_settings (
  campaign_id uuid primary key references campaigns (id) on delete cascade,
  target_geography text not null default '',
  target_sectors text[] not null default '{}',
  agency_service text not null default '',
  agency_value_proposition text not null default '',
  sender_name text not null default '',
  sender_role text not null default '',
  sender_company text not null default '',
  outreach_language outreach_language not null default 'en',
  outreach_tone outreach_tone not null default 'professional',
  preferred_cta text not null default '',
  competitors_to_analyze int not null default 3 check (competitors_to_analyze between 1 and 10),
  min_score_for_outreach int not null default 40 check (min_score_for_outreach between 0 and 100),
  updated_at timestamptz not null default now()
);

create table sector_playbooks (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  sub_sector text not null,
  business_model business_model not null,
  website_importance_score int not null check (website_importance_score between 0 and 100),
  expected_website_role website_role not null,
  essential_pages text[] not null default '{}',
  essential_conversion_actions text[] not null default '{}',
  essential_trust_signals text[] not null default '{}',
  common_customer_journey text not null default '',
  weak_website_signals text[] not null default '{}',
  rebuild_conditions text[] not null default '{}',
  targeted_improvement_conditions text[] not null default '{}',
  competitor_signals text[] not null default '{}',
  outreach_angles text[] not null default '{}',
  version int not null default 1,
  -- AI-proposed playbooks land as 'ai_suggested_unapproved' and are ignored by scoring
  -- until a human approves them.
  approval_status playbook_approval_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sector_playbooks_lookup_idx on sector_playbooks (sub_sector, business_model, approval_status);
-- One playbook per (sector, sub-sector, business model), so re-seeding updates in place.
create unique index sector_playbooks_identity_unique
  on sector_playbooks (sector, sub_sector, business_model);

create table companies (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  name text not null,
  submitted_website text,
  normalized_domain text,
  apollo_sector text,
  description text,
  employee_count int,
  country text,
  city text,
  linkedin_url text,
  apollo_company_id text,
  import_issues text[] not null default '{}',
  needs_manual_review boolean not null default false,
  pipeline_status company_pipeline_status not null default 'pending',
  review_status review_status not null default 'unreviewed',
  sector text,
  sub_sector text,
  business_model business_model,
  customer_type customer_type,
  expected_website_role website_role,
  sector_confidence confidence_level,
  sector_evidence text[] not null default '{}',
  playbook_id uuid references sector_playbooks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_campaign_idx on companies (campaign_id, created_at);
create index companies_domain_idx on companies (campaign_id, normalized_domain);
create index companies_status_idx on companies (campaign_id, pipeline_status);
-- One row per domain per campaign: the database backstop for duplicate detection.
create unique index companies_campaign_domain_unique
  on companies (campaign_id, normalized_domain)
  where normalized_domain is not null;

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  first_name text,
  last_name text,
  job_title text,
  email text,
  phone text,
  linkedin_url text,
  apollo_contact_id text,
  -- WhatsApp drafts are only surfaced as sendable when this is true.
  whatsapp_consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index contacts_company_idx on contacts (company_id);

-- ---------------------------------------------------------------------------
-- Per-company analysis
-- ---------------------------------------------------------------------------

create table audit_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  status job_status not null default 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  demo boolean not null default false,
  technical_audit jsonb,
  ai_assessment jsonb,
  competitor_summary jsonb,
  unique (campaign_id, company_id)
);

create table website_status_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  submitted_domain text,
  normalized_domain text,
  final_url text,
  status website_status not null,
  http_status int,
  redirect_chain text[] not null default '{}',
  checked_at timestamptz not null default now(),
  screenshot_url text,
  status_reason text not null default '',
  evidence text[] not null default '{}',
  confidence confidence_level not null default 'medium',
  unique (company_id)
);

create table website_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  url text not null,
  page_type text not null default 'other',
  title text,
  meta_description text,
  h1 text,
  status_code int,
  html_excerpt text,
  text_content text,
  fetched_at timestamptz not null default now()
);
create index website_pages_company_idx on website_pages (company_id);

create table website_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  category finding_category not null,
  severity severity_level not null,
  page_url text,
  evidence text not null,
  -- The report distinguishes measured facts from AI interpretation using this column.
  measurement_source measurement_source not null,
  business_impact text not null default '',
  recommended_action text not null default '',
  confidence confidence_level not null default 'medium',
  suitable_for_outreach boolean not null default false,
  created_at timestamptz not null default now()
);
create index website_findings_company_idx on website_findings (company_id, severity);

create table competitor_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  website text,
  geography text,
  sub_sector text,
  relevance_reason text not null default '',
  relevance_score int not null default 0 check (relevance_score between 0 and 100),
  evidence_url text,
  validation_status validation_status not null default 'unverified',
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index competitor_candidates_company_idx on competitor_candidates (company_id, validation_status);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  candidate_id uuid references competitor_candidates (id) on delete set null,
  name text not null,
  website text not null,
  normalized_domain text not null,
  geography text,
  sub_sector text,
  relevance_score int not null default 0,
  relevance_reason text not null default '',
  website_status website_status not null default 'unknown_needs_review',
  usage_score int not null default 0,
  signals jsonb not null default '{}'::jsonb,
  evidence text[] not null default '{}',
  source competitor_source not null default 'discovered',
  created_at timestamptz not null default now()
);
create index competitors_company_idx on competitors (company_id);

create table competitor_findings (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors (id) on delete cascade,
  signal text not null,
  present boolean not null,
  evidence text not null default '',
  measurement_source measurement_source not null default 'dom_parse'
);
create index competitor_findings_competitor_idx on competitor_findings (competitor_id);

create table score_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  sector_website_importance int not null check (sector_website_importance between 0 and 100),
  website_transformation_need int not null check (website_transformation_need between 0 and 100),
  -- Nullable on purpose: when no competitor could be analysed the component is reported
  -- as unmeasured and the final formula drops the C term rather than assuming a value.
  competitor_website_usage int check (competitor_website_usage between 0 and 100),
  competitor_measured boolean not null default false,
  transformation_measured boolean not null default false,
  potential_score int not null check (potential_score between 0 and 100),
  classification opportunity_classification not null,
  recommended_action recommended_action not null,
  primary_reason text not null default '',
  supporting_evidence text[] not null default '{}',
  confidence confidence_level not null default 'medium',
  limitations text[] not null default '{}',
  should_generate_outreach boolean not null default false,
  requires_human_review boolean not null default false,
  transformation_breakdown jsonb not null default '[]'::jsonb,
  competitor_breakdown jsonb not null default '[]'::jsonb,
  importance_breakdown jsonb not null default '[]'::jsonb,
  competitor_summary jsonb,
  created_at timestamptz not null default now(),
  unique (company_id)
);
create index score_results_score_idx on score_results (potential_score desc);

create table outreach_flows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid references contacts (id) on delete set null,
  language outreach_language not null default 'en',
  tone outreach_tone not null default 'professional',
  status outreach_flow_status not null default 'generated',
  skipped_reason text,
  whatsapp_drafts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create table outreach_messages (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references outreach_flows (id) on delete cascade,
  step int not null check (step between 1 and 4),
  kind outreach_message_kind not null,
  subject text not null,
  body text not null,
  personalized_hook text not null default '',
  evidence_used text[] not null default '{}',
  competitor_referenced text,
  cta text not null default '',
  confidence confidence_level not null default 'medium',
  editable_variables jsonb not null default '{}'::jsonb,
  edited_by_human boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, step)
);

-- ---------------------------------------------------------------------------
-- Jobs and telemetry
-- ---------------------------------------------------------------------------

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  step pipeline_step not null,
  status job_status not null default 'pending',
  attempt int not null default 1,
  -- '<campaign>:<company>:<step>'. Unique, so a retry updates this row instead of
  -- inserting a second one — the basis of the pipeline's idempotency guarantee.
  idempotency_key text not null unique,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  output_summary text
);
create index job_runs_campaign_idx on job_runs (campaign_id, status);
create index job_runs_company_idx on job_runs (company_id);

create table provider_usage (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  provider text not null,
  operation text not null,
  succeeded boolean not null,
  duration_ms int not null default 0,
  error_message text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);
create index provider_usage_campaign_idx on provider_usage (campaign_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table campaigns enable row level security;
alter table campaign_settings enable row level security;
alter table sector_playbooks enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table audit_runs enable row level security;
alter table website_status_checks enable row level security;
alter table website_pages enable row level security;
alter table website_findings enable row level security;
alter table competitor_candidates enable row level security;
alter table competitors enable row level security;
alter table competitor_findings enable row level security;
alter table score_results enable row level security;
alter table outreach_flows enable row level security;
alter table outreach_messages enable row level security;
alter table job_runs enable row level security;
alter table provider_usage enable row level security;

create policy users_self on users
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy campaigns_owner on campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy campaign_settings_owner on campaign_settings
  for all using (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

-- Playbooks are shared reference data: everyone signed in may read them, only admins edit.
create policy playbooks_read on sector_playbooks
  for select using (auth.uid() is not null);
create policy playbooks_write on sector_playbooks
  for all using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  ) with check (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy companies_owner on companies
  for all using (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

-- Everything hanging off a company inherits that company's campaign ownership.
create or replace function owns_company(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies co
    join campaigns ca on ca.id = co.campaign_id
    where co.id = target and ca.owner_id = auth.uid()
  );
$$;

create policy contacts_owner on contacts
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy audit_runs_owner on audit_runs
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy status_checks_owner on website_status_checks
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy website_pages_owner on website_pages
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy website_findings_owner on website_findings
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy competitor_candidates_owner on competitor_candidates
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy competitors_owner on competitors
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy score_results_owner on score_results
  for all using (owns_company(company_id)) with check (owns_company(company_id));
create policy outreach_flows_owner on outreach_flows
  for all using (owns_company(company_id)) with check (owns_company(company_id));

create policy competitor_findings_owner on competitor_findings
  for all using (
    exists (select 1 from competitors c where c.id = competitor_id and owns_company(c.company_id))
  ) with check (
    exists (select 1 from competitors c where c.id = competitor_id and owns_company(c.company_id))
  );

create policy outreach_messages_owner on outreach_messages
  for all using (
    exists (select 1 from outreach_flows f where f.id = flow_id and owns_company(f.company_id))
  ) with check (
    exists (select 1 from outreach_flows f where f.id = flow_id and owns_company(f.company_id))
  );

create policy job_runs_owner on job_runs
  for all using (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

create policy provider_usage_owner on provider_usage
  for all using (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Storage bucket for website screenshots
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('website-screenshots', 'website-screenshots', false)
on conflict (id) do nothing;
