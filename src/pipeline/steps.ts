/**
 * The eleven per-company pipeline steps.
 *
 * Each step is a pure function of (store, providers, company) that writes its own slice
 * of the report and returns a summary. Steps are:
 *
 *   - **idempotent** — every write is replace-by-company, so a retry updates rather than
 *     duplicates;
 *   - **independent** — a step that cannot run reports `skipped` with a reason instead of
 *     throwing, so one failure degrades one company rather than the campaign;
 *   - **runner-agnostic** — the in-process runner and the Trigger.dev tasks both call
 *     these same functions.
 */

import type { CampaignSettings, Company, ConfidenceLevel, PipelineStep, SectorPlaybook } from '@/core/types';
import type { DataStore } from '@/store/types';
import type { Providers } from '@/providers/types';
import { classifyWebsiteStatus, isAuditable, isMeasurementBlocked, WEBSITE_STATUS_LABELS } from '@/core/website-status';
import { normalizeDomain } from '@/core/domain';
import { runTechnicalAudit, auditSignalMap, type ScrapedSite, type TechnicalAudit, type PageSpeedResult } from '@/core/audit-checks';
import { auditFindings, statusFindings, type NewFinding } from '@/core/findings';
import { matchPlaybook } from '@/core/playbooks';
import { sectorDetectionSchema, websiteAssessmentSchema, competitorValidationSchema, outreachFlowSchema } from '@/core/schemas';
import { summarizeCompetitorUsage, type CompetitorAnalysis, type CompetitorUsageSummary } from '@/core/competitor-scoring';
import { calculateScores, ACTION_LABELS, type AiWebsiteAssessment } from '@/core/scoring';
import type { AssessmentContext, OutreachContext, SectorDetectionContext } from '@/providers/ai';

export interface StepContext {
  store: DataStore;
  providers: Providers;
  campaignId: string;
  companyId: string;
  settings: CampaignSettings;
  demo: boolean;
  isCancelled: () => boolean;
}

export interface StepResult {
  status: 'succeeded' | 'skipped' | 'failed';
  summary: string;
  error?: string;
}

const ok = (summary: string): StepResult => ({ status: 'succeeded', summary });
const skip = (summary: string): StepResult => ({ status: 'skipped', summary });

async function loadCompany(ctx: StepContext): Promise<Company> {
  const company = await ctx.store.getCompany(ctx.companyId);
  if (!company) throw new Error(`company ${ctx.companyId} not found`);
  return company;
}

/** Persist provider telemetry without ever letting a logging failure break a step. */
async function track(
  ctx: StepContext,
  operation: string,
  result: { ok: boolean; provider: string; duration_ms: number; error: string | null; raw?: unknown },
): Promise<void> {
  try {
    await ctx.store.recordProviderUsage({
      campaign_id: ctx.campaignId,
      company_id: ctx.companyId,
      provider: result.provider,
      operation,
      succeeded: result.ok,
      duration_ms: result.duration_ms,
      error_message: result.error,
      raw_response: result.raw ?? null,
    });
  } catch {
    /* telemetry is best-effort */
  }
}

/**
 * Get the company's audit run, creating it on first use.
 * Steps write to it with `patchAuditRun` so one step never clears another's output —
 * `run-pagespeed-audit` stores the technical audit, `calculate-scores` adds the AI
 * interpretation and the competitor summary on top of it.
 */
async function ensureAuditRun(ctx: StepContext) {
  const existing = await ctx.store.getAuditRun(ctx.companyId);
  if (existing) return existing;
  return ctx.store.upsertAuditRun({
    campaign_id: ctx.campaignId,
    company_id: ctx.companyId,
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    error_message: null,
    demo: ctx.demo,
    technical_audit: null,
    ai_assessment: null,
    competitor_summary: null,
  });
}

// ---------------------------------------------------------------------------
// 1. validate-company
// ---------------------------------------------------------------------------

async function validateCompany(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const normalized = normalizeDomain(company.submitted_website);

  const issues = new Set(company.import_issues);
  issues.delete('invalid_domain');
  issues.delete('missing_website');

  if (!company.submitted_website) {
    issues.add('missing_website');
  } else if (!normalized.ok) {
    issues.add(normalized.reason === 'is_social_profile' ? 'social_profile_instead_of_website' : 'invalid_domain');
  }

  if (!company.name || company.name.trim() === '') {
    issues.add('missing_company_name');
  }

  await ctx.store.updateCompany(company.id, {
    normalized_domain: normalized.ok ? normalized.domain : null,
    import_issues: [...issues],
    pipeline_status: 'running',
  });

  return ok(
    normalized.ok
      ? `Validated. Normalised domain: ${normalized.domain}.`
      : `Validated. No usable domain (${company.submitted_website ? normalized.reason : 'no website supplied'}).`,
  );
}

// ---------------------------------------------------------------------------
// 2. check-website-status
// ---------------------------------------------------------------------------

async function checkWebsiteStatus(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);

  if (!company.submitted_website) {
    const classification = classifyWebsiteStatus({
      submittedDomain: null,
      finalUrl: null,
      httpStatus: null,
      redirectChain: [],
      errorCode: null,
      html: null,
      textContent: null,
      title: null,
    });
    await ctx.store.saveStatusCheck({
      company_id: company.id,
      submitted_domain: null,
      normalized_domain: null,
      final_url: null,
      status: classification.status,
      http_status: null,
      redirect_chain: [],
      checked_at: new Date().toISOString(),
      screenshot_url: null,
      status_reason: classification.reason,
      evidence: classification.evidence,
      confidence: classification.confidence,
    });
    return ok('No website supplied — recorded as "no website".');
  }

  const result = await ctx.providers.scraper.probe(company.submitted_website);
  await track(ctx, 'probe', result);

  if (!result.ok || !result.data) {
    // The provider itself failed. That is a gap in our measurement, not a verdict on
    // the site, so it is recorded as unknown/needs review.
    await ctx.store.saveStatusCheck({
      company_id: company.id,
      submitted_domain: company.submitted_website,
      normalized_domain: company.normalized_domain,
      final_url: null,
      status: 'unknown_needs_review',
      http_status: null,
      redirect_chain: [],
      checked_at: new Date().toISOString(),
      screenshot_url: null,
      status_reason: `The website check could not be completed: ${result.error ?? 'provider error'}.`,
      evidence: [`provider: ${result.provider}`],
      confidence: 'low',
    });
    await ctx.store.updateCompany(company.id, { needs_manual_review: true });
    return skip(`Website status could not be established: ${result.error ?? 'provider error'}.`);
  }

  const classification = classifyWebsiteStatus(result.data);

  let screenshotUrl: string | null = null;
  if (isAuditable(classification.status) && result.data.finalUrl) {
    const shot = await ctx.providers.screenshot.capture(result.data.finalUrl, 'mobile');
    await track(ctx, 'screenshot', shot);
    screenshotUrl = shot.ok ? (shot.data?.url ?? null) : null;
  }

  await ctx.store.saveStatusCheck({
    company_id: company.id,
    submitted_domain: company.submitted_website,
    normalized_domain: company.normalized_domain,
    final_url: result.data.finalUrl,
    status: classification.status,
    http_status: result.data.httpStatus,
    redirect_chain: result.data.redirectChain,
    checked_at: new Date().toISOString(),
    screenshot_url: screenshotUrl,
    status_reason: classification.reason,
    evidence: classification.evidence,
    confidence: classification.confidence,
  });

  await ctx.store.saveFindings(
    company.id,
    statusFindings(classification.status, classification.reason, classification.evidence),
  );

  if (isMeasurementBlocked(classification.status)) {
    await ctx.store.updateCompany(company.id, { needs_manual_review: true });
  }

  return ok(`Website status: ${WEBSITE_STATUS_LABELS[classification.status]} (${classification.confidence} confidence).`);
}

// ---------------------------------------------------------------------------
// 3. scrape-company-website
// ---------------------------------------------------------------------------

async function scrapeCompanyWebsite(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const check = await ctx.store.getStatusCheck(company.id);

  if (!check || !isAuditable(check.status)) {
    return skip(
      `Nothing to crawl — website status is "${check ? WEBSITE_STATUS_LABELS[check.status] : 'unknown'}".`,
    );
  }

  const result = await ctx.providers.scraper.scrapeSite(company.normalized_domain ?? company.submitted_website ?? '', {
    maxPages: 6,
  });
  await track(ctx, 'scrapeSite', result);

  if (!result.ok || !result.data) {
    await ctx.store.updateCompany(company.id, { needs_manual_review: true });
    return skip(`The site could not be crawled: ${result.error ?? 'provider error'}.`);
  }

  await ctx.store.savePages(
    company.id,
    result.data.pages.map((p) => ({
      url: p.url,
      page_type: p.page_type,
      title: p.title,
      meta_description: p.meta_description,
      h1: p.h1,
      status_code: p.status_code,
      html_excerpt: p.html.slice(0, 20_000),
      text_content: p.text.slice(0, 20_000),
      fetched_at: new Date().toISOString(),
    })),
  );

  return ok(`Crawled ${result.data.pages.length} page(s): ${result.data.pages.map((p) => p.page_type).join(', ')}.`);
}

/** Rebuild the scraped-site shape from what was persisted, so later steps can re-audit. */
async function rebuildSite(ctx: StepContext): Promise<ScrapedSite | null> {
  const pages = await ctx.store.listPages(ctx.companyId);
  if (pages.length === 0) return null;
  const check = await ctx.store.getStatusCheck(ctx.companyId);
  return {
    final_url: check?.final_url ?? pages[0]!.url,
    pages: pages.map((p) => ({
      url: p.url,
      page_type: p.page_type,
      status_code: p.status_code,
      html: p.html_excerpt ?? '',
      text: p.text_content ?? '',
      title: p.title,
      meta_description: p.meta_description,
      h1: p.h1,
    })),
    robots_txt: null,
    sitemap_url: null,
    headers: {},
    screenshot_mobile_url: check?.screenshot_url ?? null,
    screenshot_desktop_url: null,
  };
}

// ---------------------------------------------------------------------------
// 4. run-pagespeed-audit
// ---------------------------------------------------------------------------

async function runPageSpeedAudit(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const site = await rebuildSite(ctx);
  const check = await ctx.store.getStatusCheck(company.id);

  if (!site || !check?.final_url) {
    return skip('No crawled pages, so no performance audit and no technical audit could run.');
  }

  const mobileResult = await ctx.providers.pagespeed.audit(check.final_url, 'mobile');
  await track(ctx, 'pagespeed:mobile', mobileResult);
  const desktopResult = await ctx.providers.pagespeed.audit(check.final_url, 'desktop');
  await track(ctx, 'pagespeed:desktop', desktopResult);

  const unavailable = (strategy: 'mobile' | 'desktop', error: string | null): PageSpeedResult => ({
    strategy,
    performance_score: null,
    lcp_ms: null,
    cls: null,
    tbt_ms: null,
    fetched: false,
    error,
  });

  const mobile = mobileResult.ok && mobileResult.data ? mobileResult.data : unavailable('mobile', mobileResult.error);
  const desktop = desktopResult.ok && desktopResult.data ? desktopResult.data : unavailable('desktop', desktopResult.error);

  const audit = runTechnicalAudit(site, { mobile, desktop });

  // Findings are written in `calculate-scores`, not here: the playbook-driven conversion
  // gaps need the sector match from step 5, and generating them in one place keeps the
  // finding set identical no matter how many times the pipeline is re-run.
  await ensureAuditRun(ctx);
  await ctx.store.patchAuditRun(company.id, { technical_audit: audit, status: 'running' });

  return ok(
    mobile.fetched
      ? `Technical audit complete. Mobile performance ${mobile.performance_score}/100.`
      : `Technical audit complete. PageSpeed unavailable (${mobile.error ?? 'not run'}) and excluded from scoring.`,
  );
}

// ---------------------------------------------------------------------------
// 5. detect-sector-and-business-model
// ---------------------------------------------------------------------------

async function detectSector(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const pages = await ctx.store.listPages(company.id);
  const home = pages.find((p) => p.page_type === 'home') ?? pages[0] ?? null;

  const context: SectorDetectionContext = {
    name: company.name,
    domain: company.normalized_domain,
    apollo_sector: company.apollo_sector,
    description: company.description,
    homepage_text: home?.text_content ?? null,
  };

  const result = await ctx.providers.ai.generate({
    operation: 'sector_detection',
    schemaName: 'sector_detection',
    schema: sectorDetectionSchema,
    system:
      'You classify companies into a sector, sub-sector and business model for a website-opportunity analysis. ' +
      'Base the answer only on the supplied evidence. If the evidence does not support a confident classification, ' +
      'return confidence "low". Never invent an industry that is not supported by the text.',
    user: JSON.stringify(context),
    context: context as unknown as Record<string, unknown>,
  });
  await track(ctx, 'sector_detection', result);

  if (!result.ok || !result.data) {
    await ctx.store.updateCompany(company.id, {
      needs_manual_review: true,
      sector_confidence: 'low',
      sector_evidence: [`Sector detection did not run: ${result.error ?? 'provider error'}`],
    });
    return skip(`Sector detection unavailable: ${result.error ?? 'provider error'}.`);
  }

  const detected = result.data;
  const playbooks = await ctx.store.listPlaybooks();
  const playbook = matchPlaybook(playbooks, {
    sector: detected.sector,
    sub_sector: detected.sub_sector,
    business_model: detected.business_model,
  });

  const needsReview = detected.confidence === 'low' || playbook == null;

  await ctx.store.updateCompany(company.id, {
    sector: detected.sector,
    sub_sector: detected.sub_sector,
    business_model: detected.business_model,
    customer_type: detected.primary_customer_type,
    expected_website_role: detected.expected_website_role,
    sector_confidence: detected.confidence,
    sector_evidence: detected.evidence,
    playbook_id: playbook?.id ?? null,
    needs_manual_review: company.needs_manual_review || needsReview,
  });

  return ok(
    `${detected.sector} › ${detected.sub_sector} (${detected.business_model}), ${detected.confidence} confidence. ` +
      (playbook ? `Matched playbook v${playbook.version}.` : 'No approved playbook matched — flagged for review.'),
  );
}

// ---------------------------------------------------------------------------
// 6. discover-competitors
// ---------------------------------------------------------------------------

/** Domains that are never competitors: directories, marketplaces, social platforms. */
const NON_COMPETITOR_HOSTS = [
  'wikipedia.org', 'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'x.com', 'twitter.com',
  'yelp.com', 'tripadvisor.com', 'google.com', 'maps.google.com', 'crunchbase.com', 'glassdoor.com',
  'indeed.com', 'amazon.com', 'noon.com', 'yellowpages.com', 'clutch.co', 'trustpilot.com', 'medium.com',
];

async function discoverCompetitors(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);

  if (!company.sub_sector) {
    return skip('No sub-sector was detected, so competitor discovery had nothing to search for.');
  }

  // In demo mode the pool key is embedded in the query so fixtures stay coherent.
  const poolHint = ctx.demo ? ` ${demoPoolKey(company)}` : '';
  const query =
    `${company.sub_sector} ${company.business_model === 'b2c_ecommerce' ? 'online store' : ''} ` +
    `${ctx.settings.target_geography || company.city || company.country || ''}${poolHint}`.trim();

  const result = await ctx.providers.search.search(query, { limit: 8 });
  await track(ctx, 'competitor_search', result);

  if (!result.ok || !result.data) {
    await ctx.store.saveCandidates(company.id, []);
    return skip(`Competitor discovery did not run: ${result.error ?? 'provider error'}.`);
  }

  const seen = new Set<string>([company.normalized_domain ?? '']);
  const candidates = result.data
    .map((r) => {
      const normalized = normalizeDomain(r.url);
      return { r, domain: normalized.domain };
    })
    .filter(({ domain }) => {
      if (!domain || seen.has(domain)) return false;
      if (NON_COMPETITOR_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`))) return false;
      seen.add(domain);
      return true;
    })
    .slice(0, 5)
    .map(({ r, domain }) => ({
      name: r.title.split(/[|–-]/)[0]!.trim() || domain!,
      website: `https://${domain}`,
      geography: ctx.settings.target_geography || null,
      sub_sector: company.sub_sector,
      relevance_reason: r.snippet || 'Returned by competitor search for this sub-sector and geography.',
      // Search rank alone is not evidence of relevance; validation sets the real score.
      relevance_score: 0,
      evidence_url: r.url,
      validation_status: 'unverified' as const,
      rejection_reason: null,
      created_at: new Date().toISOString(),
    }));

  await ctx.store.saveCandidates(company.id, candidates);

  return candidates.length === 0
    ? skip('Competitor search returned no usable candidates.')
    : ok(`Found ${candidates.length} competitor candidate(s) awaiting validation.`);
}

function demoPoolKey(company: Company): string {
  const map: Record<string, string> = {
    'Appointment-driven clinic': 'dental_clinic_ae',
    'E-commerce brand': 'home_ecommerce_gcc',
    'B2B professional service': 'law_firm_ae',
    'Building materials manufacturer': 'stone_manufacturer_mena',
    'Restaurant and local dining': 'restaurant_ae',
    'B2B SaaS': 'logistics_saas',
  };
  return map[company.sub_sector ?? ''] ?? '';
}

// ---------------------------------------------------------------------------
// 7. validate-competitors
// ---------------------------------------------------------------------------

async function validateCompetitors(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const candidates = await ctx.store.listCandidates(company.id);

  if (candidates.length === 0) {
    return skip('No competitor candidates to validate.');
  }

  const validated: typeof candidates = [];

  for (const candidate of candidates) {
    if (ctx.isCancelled()) break;

    const context = {
      candidate_name: candidate.name,
      candidate_website: candidate.website,
      candidate_sub_sector: candidate.sub_sector,
      candidate_geography: candidate.geography,
      candidate_snippet: candidate.relevance_reason,
      target_company: company.name,
      target_sub_sector: company.sub_sector,
      target_business_model: company.business_model,
      target_customer_type: company.customer_type,
      target_geography: ctx.settings.target_geography,
    };

    const result = await ctx.providers.ai.generate({
      operation: 'competitor_validation',
      schemaName: 'competitor_validation',
      schema: competitorValidationSchema,
      system:
        'You decide whether a candidate business is a genuine competitor of a target company. ' +
        'Appearing in a search result is NOT evidence of competition. Require a matching sub-sector, ' +
        'a comparable customer type and an overlapping geography or serving area. When in doubt, reject.',
      user: JSON.stringify(context),
      context,
    });
    await track(ctx, 'competitor_validation', result);

    if (!result.ok || !result.data) {
      validated.push({ ...candidate, validation_status: 'unverified', rejection_reason: result.error });
      continue;
    }

    validated.push({
      ...candidate,
      relevance_score: result.data.relevance_score,
      validation_status: result.data.valid ? 'valid' : 'rejected',
      rejection_reason: result.data.valid ? null : result.data.reason,
      relevance_reason: result.data.reason,
    });
  }

  await ctx.store.saveCandidates(
    company.id,
    validated.map(({ id: _id, company_id: _companyId, ...rest }) => rest),
  );

  const validCount = validated.filter((c) => c.validation_status === 'valid').length;
  return ok(
    `${validCount} of ${validated.length} candidate(s) validated as genuine competitors.` +
      (validCount < 3 ? ' Fewer than three — the competitor comparison will be reported as limited.' : ''),
  );
}

// ---------------------------------------------------------------------------
// 8. analyze-competitor-websites
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

/** Human-authored playbook requirements mapped onto the signal keys we measure. */
const REQUIREMENT_TO_SIGNAL: Record<string, string> = {
  'online booking': 'booking_link', booking: 'booking_link', 'appointment booking': 'booking_link',
  'contact form': 'contact_form', 'lead capture form': 'contact_form',
  'quote request': 'quote_request', 'request a quote': 'quote_request',
  'demo request': 'demo_request', 'book a demo': 'demo_request',
  whatsapp: 'whatsapp_link', 'whatsapp cta': 'whatsapp_link',
  'click-to-call': 'click_to_call', 'click to call': 'click_to_call', 'phone number': 'click_to_call',
  'live chat': 'live_chat', checkout: 'checkout_or_cart', 'add to cart': 'checkout_or_cart',
  'online checkout': 'checkout_or_cart', pricing: 'pricing', 'transparent pricing': 'pricing',
  testimonials: 'testimonials', reviews: 'reviews', 'case studies': 'case_studies',
  'client logos': 'client_logos', certifications: 'certifications', 'contact details': 'contact_details',
  menu: 'pricing', 'product specifications': 'landing_pages', 'service landing pages': 'landing_pages',
  'product pages': 'landing_pages', 'project gallery': 'case_studies', 'free trial': 'demo_request',
  'delivery terms': 'pricing', 'team page': 'client_logos', 'practitioner bios': 'value_proposition',
  'delivery links': 'whatsapp_link',
};

/**
 * Narrow the competitor comparison to the signals this sector's journey actually needs.
 * Judging a dental clinic's competitors on shopping-cart adoption would understate how
 * hard they work their websites, and would understate the company's own gap in turn.
 */
function relevantCompetitorSignals(playbook: SectorPlaybook | null): { conversion?: string[]; content?: string[] } {
  if (!playbook) return {};
  const map = (list: string[]) =>
    [...new Set(list.map((x) => REQUIREMENT_TO_SIGNAL[x.trim().toLowerCase()]).filter(Boolean))] as string[];

  const conversion = [...new Set([...map(playbook.essential_conversion_actions), ...map(playbook.competitor_signals), 'landing_pages'])];
  const content = [...new Set(['value_proposition', ...map(playbook.essential_trust_signals)])];
  return { conversion, content };
}

/** Extra signals measured on competitor sites beyond the shared audit map. */
function competitorExtraSignals(site: ScrapedSite | null, audit: TechnicalAudit | null): Record<string, boolean | null> {
  if (!site || !audit) {
    return { value_proposition: null, landing_pages: null, lead_magnet: null, updated_content: null };
  }
  const html = site.pages.map((p) => p.html).join(' ');
  const types = new Set(site.pages.map((p) => p.page_type));
  const home = site.pages.find((p) => p.page_type === 'home') ?? site.pages[0];

  return {
    value_proposition: !!home?.h1 && !!home?.title,
    landing_pages: types.has('services') || types.has('products'),
    lead_magnet: /(download|free guide|whitepaper|e-?book|checklist|دليل مجاني)/i.test(html),
    updated_content:
      new RegExp(`(${CURRENT_YEAR}|${CURRENT_YEAR - 1})`).test(html) && (types.has('blog') || types.has('products')),
  };
}

async function analyzeCompetitorWebsites(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const candidates = await ctx.store.listCandidates(company.id);

  const selected = candidates
    .filter((c) => c.validation_status === 'valid')
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, Math.max(1, ctx.settings.competitors_to_analyze ?? 3));

  if (selected.length === 0) {
    await ctx.store.saveCompetitors(company.id, []);
    return skip('No validated competitor to analyse.');
  }

  const rows: Parameters<DataStore['saveCompetitors']>[1] = [];

  for (const candidate of selected) {
    if (ctx.isCancelled()) break;
    const domain = normalizeDomain(candidate.website).domain;
    if (!domain) continue;

    const probe = await ctx.providers.scraper.probe(domain);
    await track(ctx, 'competitor_probe', probe);

    if (!probe.ok || !probe.data) {
      rows.push({
        candidate_id: candidate.id,
        name: candidate.name,
        website: candidate.website ?? `https://${domain}`,
        normalized_domain: domain,
        geography: candidate.geography,
        sub_sector: candidate.sub_sector,
        relevance_score: candidate.relevance_score,
        relevance_reason: candidate.relevance_reason,
        website_status: 'unknown_needs_review',
        usage_score: 0,
        signals: {},
        evidence: [`Competitor site could not be checked: ${probe.error ?? 'provider error'}`],
        source: 'discovered',
        created_at: new Date().toISOString(),
      });
      continue;
    }

    const classification = classifyWebsiteStatus(probe.data);
    let site: ScrapedSite | null = null;
    let audit: TechnicalAudit | null = null;

    if (isAuditable(classification.status)) {
      const scraped = await ctx.providers.scraper.scrapeSite(domain, { maxPages: 4 });
      await track(ctx, 'competitor_scrape', scraped);
      if (scraped.ok && scraped.data) {
        site = scraped.data;
        audit = runTechnicalAudit(site, {
          mobile: null,
          desktop: null,
        });
      }
    }

    const signals: Record<string, boolean | null> = audit
      ? { ...auditSignalMap(audit), ...competitorExtraSignals(site, audit) }
      : {};

    const evidence: string[] = [
      `Website status: ${WEBSITE_STATUS_LABELS[classification.status]} — ${classification.reason}`,
      ...Object.entries(signals)
        .filter(([, v]) => v === true)
        .slice(0, 6)
        .map(([k]) => `${candidate.name}: ${k} present`),
    ];

    rows.push({
      candidate_id: candidate.id,
      name: candidate.name,
      website: candidate.website ?? `https://${domain}`,
      normalized_domain: domain,
      geography: candidate.geography,
      sub_sector: candidate.sub_sector,
      relevance_score: candidate.relevance_score,
      relevance_reason: candidate.relevance_reason,
      website_status: classification.status,
      usage_score: 0,
      signals: signals as Record<string, boolean>,
      evidence,
      source: 'discovered',
      created_at: new Date().toISOString(),
    });
  }

  await ctx.store.saveCompetitors(company.id, rows);
  return ok(`Analysed ${rows.length} competitor website(s).`);
}

// ---------------------------------------------------------------------------
// 9. calculate-scores
// ---------------------------------------------------------------------------

/**
 * The AI interpretation of structure and journey runs here rather than in an earlier
 * step because it needs the matched playbook (step 5) to judge whether the site fulfils
 * the role its sector expects. Scoring then consumes the interpretation immediately.
 */
async function calculateScoresStep(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const check = await ctx.store.getStatusCheck(company.id);
  if (!check) return skip('No website status check — nothing to score.');

  const auditRun = await ensureAuditRun(ctx);
  const audit = (auditRun.technical_audit as TechnicalAudit | null) ?? null;
  const playbook: SectorPlaybook | null = company.playbook_id ? await ctx.store.getPlaybook(company.playbook_id) : null;

  // --- AI interpretation ---------------------------------------------------
  let ai: AiWebsiteAssessment | null = null;
  let aiFindingRows: NewFinding[] = [];
  if (audit) {
    const signals = auditSignalMap(audit);
    const map: Record<string, string> = {
      'online booking': 'booking_link', booking: 'booking_link', 'appointment booking': 'booking_link',
      'contact form': 'contact_form', 'quote request': 'quote_request', 'demo request': 'demo_request',
      whatsapp: 'whatsapp_link', 'click-to-call': 'click_to_call', 'live chat': 'live_chat',
      checkout: 'checkout_or_cart', 'add to cart': 'checkout_or_cart', pricing: 'pricing',
      testimonials: 'testimonials', reviews: 'reviews', 'case studies': 'case_studies',
      'client logos': 'client_logos', certifications: 'certifications', 'contact details': 'contact_details',
    };
    const missing = (list: string[]) =>
      list.filter((item) => {
        const key = map[item.trim().toLowerCase()];
        return key ? signals[key] === false : false;
      });

    const pages = await ctx.store.listPages(company.id);
    const home = pages.find((p) => p.page_type === 'home') ?? pages[0] ?? null;

    const context: AssessmentContext = {
      status_label: WEBSITE_STATUS_LABELS[check.status],
      signals: { ...signals, mobile_viewport: audit.mobile_viewport.present },
      expected_role: company.expected_website_role,
      missing_conversion_actions: playbook ? missing(playbook.essential_conversion_actions) : [],
      missing_pages: playbook
        ? playbook.essential_pages.filter(
            (p) => !audit.found_page_types.includes(p.trim().toLowerCase().replace(/\s+/g, '')),
          )
        : [],
      missing_trust_signals: playbook ? missing(playbook.essential_trust_signals) : [],
      pagespeed_mobile: audit.pagespeed_mobile?.performance_score ?? null,
      homepage_title: home?.title ?? null,
      homepage_h1: home?.h1 ?? null,
      page_types: audit.found_page_types,
      final_url: check.final_url,
    };

    const result = await ctx.providers.ai.generate({
      operation: 'website_assessment',
      schemaName: 'website_assessment',
      schema: websiteAssessmentSchema,
      system:
        'You interpret a website audit for a website-opportunity analysis. You may ONLY reference measurements ' +
        'supplied in the evidence pack. Never claim a technical problem that is not in the evidence, never quote ' +
        'traffic or revenue numbers, and never state that a missing feature causes a specific loss. ' +
        'Score each dimension 0-100 where 100 is excellent.',
      user: JSON.stringify(context),
      context: context as unknown as Record<string, unknown>,
    });
    await track(ctx, 'website_assessment', result);

    if (result.ok && result.data) {
      ai = result.data;
      aiFindingRows = result.data.findings.map((f) => ({
        title: f.title,
        category: f.category,
        severity: f.severity,
        page_url: f.page_url,
        evidence: f.evidence,
        measurement_source: 'ai_interpretation',
        business_impact: f.business_impact,
        recommended_action: f.recommended_action,
        confidence: f.confidence,
        suitable_for_outreach: f.suitable_for_outreach,
        created_at: new Date().toISOString(),
      }));
    }
  }

  // Measured findings first, AI interpretation after — each tagged with its source so
  // the report can keep the two visually distinct.
  await ctx.store.saveFindings(company.id, [
    ...statusFindings(check.status, check.status_reason, check.evidence),
    ...(audit ? auditFindings(audit, playbook) : []),
    ...aiFindingRows,
  ]);

  // --- Competitor summary ---------------------------------------------------
  const competitors = await ctx.store.listCompetitors(company.id);
  const analyses: CompetitorAnalysis[] = competitors.map((c) => ({
    name: c.name,
    website: c.website,
    status: c.website_status,
    signals: c.signals,
    evidence: c.evidence,
  }));
  const companySignals = audit ? auditSignalMap(audit) : null;
  const summary: CompetitorUsageSummary = summarizeCompetitorUsage(
    analyses,
    companySignals,
    relevantCompetitorSignals(playbook),
  );

  const scores = calculateScores({
    status: check.status,
    audit,
    playbook,
    ai,
    competitors: summary,
    sector_confidence: company.sector_confidence,
    min_score_for_outreach: ctx.settings.min_score_for_outreach,
    unresolved_manual_review: company.needs_manual_review && company.review_status === 'unreviewed',
  });

  await ctx.store.saveScore({
    company_id: company.id,
    sector_website_importance: scores.sector_website_importance,
    website_transformation_need: scores.website_transformation_need,
    competitor_website_usage: scores.competitor_website_usage,
    competitor_measured: scores.competitor_measured,
    transformation_measured: scores.transformation_measured,
    potential_score: scores.potential_score,
    classification: scores.classification,
    recommended_action: scores.recommended_action,
    primary_reason: scores.primary_reason,
    supporting_evidence: scores.supporting_evidence,
    confidence: scores.confidence,
    limitations: scores.limitations,
    should_generate_outreach: scores.should_generate_outreach,
    requires_human_review: scores.requires_human_review,
    transformation_breakdown: scores.transformation_breakdown,
    competitor_breakdown: scores.competitor_breakdown,
    importance_breakdown: scores.importance_breakdown,
    competitor_summary: summary,
    created_at: new Date().toISOString(),
  });

  await ctx.store.patchAuditRun(company.id, { ai_assessment: ai, competitor_summary: summary });

  // Per-competitor usage scores, so the comparison table can rank them.
  if (competitors.length > 0) {
    await ctx.store.saveCompetitors(
      company.id,
      competitors.map(({ id: _id, company_id: _cid, ...rest }) => ({
        ...rest,
        usage_score:
          summarizeCompetitorUsage(
            [{ name: rest.name, website: rest.website, status: rest.website_status, signals: rest.signals, evidence: rest.evidence }],
            null,
          ).score ?? 0,
      })),
    );
  }

  return ok(
    `W=${scores.website_transformation_need}, S=${scores.sector_website_importance}, ` +
      `C=${scores.competitor_website_usage ?? 'not measured'} → potential ${scores.potential_score} (${scores.classification}).`,
  );
}

// ---------------------------------------------------------------------------
// 10. generate-outreach
// ---------------------------------------------------------------------------

async function generateOutreach(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const score = await ctx.store.getScore(company.id);
  if (!score) return skip('No score, so no outreach was generated.');

  const contacts = await ctx.store.listContacts(company.id);
  const contact = contacts[0] ?? null;

  if (!score.should_generate_outreach) {
    const reason =
      score.potential_score < ctx.settings.min_score_for_outreach
        ? `Potential score ${score.potential_score} is below the campaign threshold of ${ctx.settings.min_score_for_outreach}.`
        : score.requires_human_review
          ? 'The company requires manual review before outreach can be generated.'
          : 'There was not enough verified evidence to write outreach from.';

    await ctx.store.saveOutreach(
      {
        company_id: company.id,
        contact_id: contact?.id ?? null,
        language: ctx.settings.outreach_language,
        tone: ctx.settings.outreach_tone,
        status: 'skipped',
        skipped_reason: reason,
        whatsapp_drafts: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      [],
    );
    return skip(reason);
  }

  const findings = (await ctx.store.listFindings(company.id))
    .filter((f) => f.suitable_for_outreach)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    // Two strong findings per sequence — never the whole audit.
    .slice(0, 3);

  const summary = score.competitor_summary as CompetitorUsageSummary | null;
  const playbook = company.playbook_id ? await ctx.store.getPlaybook(company.playbook_id) : null;
  const competitors = await ctx.store.listCompetitors(company.id);

  const context: OutreachContext = {
    company_name: company.name,
    contact_first_name: contact?.first_name ?? null,
    language: ctx.settings.outreach_language,
    tone: ctx.settings.outreach_tone,
    sender_name: ctx.settings.sender_name,
    sender_role: ctx.settings.sender_role,
    sender_company: ctx.settings.sender_company,
    agency_service: ctx.settings.agency_service,
    agency_value_proposition: ctx.settings.agency_value_proposition,
    preferred_cta: ctx.settings.preferred_cta,
    recommended_action_label: ACTION_LABELS[score.recommended_action],
    findings: findings.map((f) => ({ title: f.title, evidence: f.evidence, business_impact: f.business_impact })),
    competitor_pattern: summary?.common_patterns?.[0] ?? null,
    competitor_name: competitors[0]?.name ?? null,
    competitor_gap: summary?.gaps_vs_company?.[0] ?? null,
    sub_sector: company.sub_sector,
  };

  const result = await ctx.providers.ai.generate({
    operation: 'outreach',
    schemaName: 'outreach_flow',
    schema: outreachFlowSchema,
    system:
      `You write cold outreach for ${ctx.settings.sender_company}, whose offer is: ${ctx.settings.agency_service}. ` +
      'Rules you must not break: only reference findings supplied in the evidence pack; never invent performance ' +
      'or revenue numbers; never claim a loss you cannot evidence; never write generic filler such as "your website ' +
      'needs improvement"; use at most two findings across the sequence; never recommend a service the agency has ' +
      `not configured. Write in ${ctx.settings.outreach_language === 'ar' ? 'Arabic' : 'English'}, ` +
      `in a ${ctx.settings.outreach_tone} tone. Return exactly four messages.`,
    user: JSON.stringify(context),
    context: context as unknown as Record<string, unknown>,
  });
  await track(ctx, 'outreach', result);

  if (!result.ok || !result.data) {
    await ctx.store.saveOutreach(
      {
        company_id: company.id,
        contact_id: contact?.id ?? null,
        language: ctx.settings.outreach_language,
        tone: ctx.settings.outreach_tone,
        status: 'skipped',
        skipped_reason: `Outreach generation did not run: ${result.error ?? 'provider error'}.`,
        whatsapp_drafts: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      [],
    );
    return skip(`Outreach generation unavailable: ${result.error ?? 'provider error'}.`);
  }

  const kinds = ['verified_observation', 'competitor_pattern', 'recommended_opportunity', 'breakup'] as const;

  await ctx.store.saveOutreach(
    {
      company_id: company.id,
      contact_id: contact?.id ?? null,
      language: ctx.settings.outreach_language,
      tone: ctx.settings.outreach_tone,
      status: 'generated',
      skipped_reason: null,
      // WhatsApp is draft-only in the MVP and is gated on recorded consent.
      whatsapp_drafts: (result.data.whatsapp_drafts ?? []).map((d) => ({
        step: d.step,
        body: d.body,
        consent_required: true as const,
        consent_on_file: contact?.whatsapp_consent === true,
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    result.data.messages.map((m) => ({
      step: m.step,
      kind: kinds[m.step - 1]!,
      subject: m.subject,
      body: m.body,
      personalized_hook: m.personalized_hook,
      evidence_used: m.evidence_used,
      competitor_referenced: m.competitor_referenced,
      cta: m.cta,
      confidence: m.confidence,
      editable_variables: m.editable_variables ?? {},
      edited_by_human: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  );

  return ok(
    `Generated a 4-email sequence` +
      (contact?.whatsapp_consent ? ' plus WhatsApp drafts (consent on file).' : '. WhatsApp drafts are marked consent-required.'),
  );
}

function severityRank(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s] ?? 0;
}

// ---------------------------------------------------------------------------
// 11. finalize-company-report
// ---------------------------------------------------------------------------

async function finalizeCompanyReport(ctx: StepContext): Promise<StepResult> {
  const company = await loadCompany(ctx);
  const score = await ctx.store.getScore(company.id);
  const jobs = await ctx.store.listJobRunsForCompany(company.id);

  const failed = jobs.filter((j) => j.status === 'failed');
  const needsReview = company.needs_manual_review || score?.requires_human_review === true || failed.length > 0;

  await ctx.store.updateCompany(company.id, {
    pipeline_status: failed.length > 0 ? 'failed' : needsReview ? 'needs_review' : 'completed',
    needs_manual_review: needsReview,
  });

  await ensureAuditRun(ctx);
  await ctx.store.patchAuditRun(company.id, {
    status: failed.length > 0 ? 'failed' : 'succeeded',
    finished_at: new Date().toISOString(),
    error_message: failed.length > 0 ? failed.map((f) => `${f.step}: ${f.error_message}`).join('; ') : null,
  });

  return ok(
    score
      ? `Report finalised: ${score.potential_score}/100 (${score.classification})${needsReview ? ', flagged for review' : ''}.`
      : 'Report finalised without a score.',
  );
}

// ---------------------------------------------------------------------------

export const STEP_HANDLERS: Record<PipelineStep, (ctx: StepContext) => Promise<StepResult>> = {
  'validate-company': validateCompany,
  'check-website-status': checkWebsiteStatus,
  'scrape-company-website': scrapeCompanyWebsite,
  'run-pagespeed-audit': runPageSpeedAudit,
  'detect-sector-and-business-model': detectSector,
  'discover-competitors': discoverCompetitors,
  'validate-competitors': validateCompetitors,
  'analyze-competitor-websites': analyzeCompetitorWebsites,
  'calculate-scores': calculateScoresStep,
  'generate-outreach': generateOutreach,
  'finalize-company-report': finalizeCompanyReport,
};

export { ensureAuditRun };
