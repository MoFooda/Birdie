/**
 * The scoring engine.
 *
 *   potential_score = round(W × ((0.65 × S + 0.35 × C) / 100))
 *
 *   W = website_transformation_need   — how much website work this company needs
 *   S = sector_website_importance     — how much a website matters in this sector
 *   C = competitor_website_usage      — how hard competitors work their websites
 *
 * Three rules shape the implementation:
 *
 * 1. Every point is attributable. Each component returns a breakdown of the individual
 *    items that produced it, with the measurement source for each.
 * 2. Anything we could not measure is excluded from both the numerator and the
 *    denominator rather than counted as zero. A check we never ran must not look like
 *    a check the site failed.
 * 3. When a component cannot be measured at all, the score is flagged for human review
 *    and the formula degrades explicitly — it never substitutes an invented value.
 */

import type {
  ConfidenceLevel,
  OpportunityClassification,
  RecommendedAction,
  ScoreComponentBreakdown,
  SectorPlaybook,
  WebsiteStatus,
} from './types';
import type { PageSpeedResult, TechnicalAudit } from './audit-checks';
import { auditSignalMap } from './audit-checks';
import type { CompetitorUsageSummary } from './competitor-scoring';
import { isAuditable, isMeasurementBlocked, isMissingWebsite, WEBSITE_STATUS_LABELS } from './website-status';

// ---------------------------------------------------------------------------
// AI interpretation input
// ---------------------------------------------------------------------------

export interface AiWebsiteAssessment {
  /** All five dimensions are 0–100, where 100 is excellent. */
  value_proposition_clarity: number;
  customer_journey_clarity: number;
  conversion_path_quality: number;
  trust_and_credibility: number;
  information_architecture: number;
  fulfills_expected_role: boolean;
  problems_are_structural: boolean;
  rebuild_justified: boolean;
  targeted_improvements_sufficient: boolean;
  summary: string;
  confidence: ConfidenceLevel;
}

export interface ScoringInput {
  status: WebsiteStatus;
  audit: TechnicalAudit | null;
  playbook: SectorPlaybook | null;
  ai: AiWebsiteAssessment | null;
  competitors: CompetitorUsageSummary | null;
  sector_confidence: ConfidenceLevel | null;
  /** Campaign threshold; outreach is only generated at or above this score. */
  min_score_for_outreach: number;
  /** Set when a reviewer has flagged the row and not yet resolved it. */
  unresolved_manual_review?: boolean;
}

export interface ScoringOutput {
  sector_website_importance: number;
  website_transformation_need: number;
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
  importance_breakdown: ScoreComponentBreakdown[];
  transformation_breakdown: ScoreComponentBreakdown[];
  competitor_breakdown: ScoreComponentBreakdown[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Weighted item; `points === null` means "not measured" and is excluded from both sides. */
interface Item {
  key: string;
  label: string;
  max: number;
  points: number | null;
  detail: string;
  source: ScoreComponentBreakdown['source'];
}

function normalize(items: Item[]): { score: number | null; breakdown: ScoreComponentBreakdown[] } {
  let earned = 0;
  let available = 0;
  const breakdown: ScoreComponentBreakdown[] = items.map((i) => {
    if (i.points != null) {
      earned += i.points;
      available += i.max;
    }
    return {
      key: i.key,
      label: i.label,
      points: i.points == null ? 0 : Math.round(i.points),
      max_points: i.max,
      detail: i.points == null ? `${i.detail} — not measured` : i.detail,
      source: i.source,
    };
  });
  if (available === 0) return { score: null, breakdown };
  return { score: Math.round(clamp((earned / available) * 100)), breakdown };
}

// ---------------------------------------------------------------------------
// W — website transformation need
// ---------------------------------------------------------------------------

/** Proportion of a playbook's required list that is missing from the measured site. */
function missingRatio(
  required: string[],
  present: (item: string) => boolean | null,
): { ratio: number | null; missing: string[]; measured: number } {
  const missing: string[] = [];
  let measured = 0;
  for (const item of required) {
    const p = present(item);
    if (p == null) continue;
    measured += 1;
    if (!p) missing.push(item);
  }
  if (measured === 0) return { ratio: null, missing, measured: 0 };
  return { ratio: missing.length / measured, missing, measured };
}

/**
 * Playbook requirement strings are human-authored ("Online booking", "WhatsApp CTA").
 * Map them onto measured signal keys; anything we do not measure stays unmeasured.
 */
const REQUIREMENT_SIGNAL_MAP: Record<string, string> = {
  'online booking': 'booking_link',
  booking: 'booking_link',
  'appointment booking': 'booking_link',
  'contact form': 'contact_form',
  'lead capture form': 'contact_form',
  'quote request': 'quote_request',
  'request a quote': 'quote_request',
  'demo request': 'demo_request',
  'book a demo': 'demo_request',
  whatsapp: 'whatsapp_link',
  'whatsapp cta': 'whatsapp_link',
  'click-to-call': 'click_to_call',
  'click to call': 'click_to_call',
  'phone number': 'click_to_call',
  'live chat': 'live_chat',
  checkout: 'checkout_or_cart',
  'add to cart': 'checkout_or_cart',
  'online checkout': 'checkout_or_cart',
  pricing: 'pricing',
  'transparent pricing': 'pricing',
  testimonials: 'testimonials',
  reviews: 'reviews',
  'case studies': 'case_studies',
  'client logos': 'client_logos',
  certifications: 'certifications',
  'contact details': 'contact_details',
};

const PAGE_TYPE_MAP: Record<string, string> = {
  home: 'home',
  homepage: 'home',
  about: 'about',
  'about us': 'about',
  contact: 'contact',
  'contact us': 'contact',
  services: 'services',
  'service pages': 'services',
  products: 'products',
  'product pages': 'products',
  pricing: 'pricing',
  blog: 'blog',
};

function computeTransformationNeed(
  input: ScoringInput,
): {
  score: number;
  measured: boolean;
  breakdown: ScoreComponentBreakdown[];
  evidence: string[];
  limitations: string[];
  confidence: ConfidenceLevel;
  primary_reason: string;
} {
  const { status, audit, playbook, ai, competitors } = input;
  const label = WEBSITE_STATUS_LABELS[status];

  // --- No usable website at all -------------------------------------------------
  if (isMissingWebsite(status)) {
    return {
      score: 95,
      measured: true,
      breakdown: [
        {
          key: 'no_website',
          label: 'No usable website',
          points: 95,
          max_points: 100,
          detail: `Website status is "${label}", so there is no working website for customers to reach.`,
          source: 'http_check',
        },
      ],
      evidence: [`Website status: ${label}`],
      limitations: [],
      confidence: 'high',
      primary_reason: `The company has no working website (${label}), so any web presence would be built from scratch.`,
    };
  }

  if (status === 'under_construction') {
    return {
      score: 88,
      measured: true,
      breakdown: [
        {
          key: 'under_construction',
          label: 'Placeholder site only',
          points: 88,
          max_points: 100,
          detail: 'The domain serves a placeholder or "coming soon" page rather than a working website.',
          source: 'http_check',
        },
      ],
      evidence: [`Website status: ${label}`],
      limitations: [],
      confidence: 'high',
      primary_reason: 'The domain currently serves only a placeholder page, so the site still has to be built.',
    };
  }

  if (status === 'ssl_failure') {
    return {
      score: 72,
      measured: true,
      breakdown: [
        {
          key: 'ssl_failure',
          label: 'Site unreachable over HTTPS',
          points: 72,
          max_points: 100,
          detail:
            'The certificate is invalid or missing, so mainstream browsers show a security warning before the site loads.',
          source: 'http_check',
        },
      ],
      evidence: [`Website status: ${label}`],
      limitations: [
        'The site content could not be read because of the TLS failure, so the need score reflects availability only.',
      ],
      confidence: 'medium',
      primary_reason:
        'Visitors hit a browser security warning before the site loads, which blocks essentially all organic traffic.',
    };
  }

  // --- We were prevented from measuring -----------------------------------------
  if (isMeasurementBlocked(status) || !isAuditable(status) || !audit) {
    return {
      score: 50,
      measured: false,
      breakdown: [
        {
          key: 'not_measured',
          label: 'Website could not be assessed',
          points: 0,
          max_points: 100,
          detail: `Website status is "${label}". No content was retrieved, so no transformation need could be measured. 50 is an indeterminate placeholder, not a measurement.`,
          source: 'http_check',
        },
      ],
      evidence: [`Website status: ${label}`],
      limitations: [
        `The website could not be read (${label}). The transformation need is a placeholder and this company requires manual review before any outreach.`,
      ],
      confidence: 'low',
      primary_reason: `The website could not be assessed automatically (${label}) and needs a manual look.`,
    };
  }

  // --- Full measured assessment ---------------------------------------------------
  const items: Item[] = [];
  const evidence: string[] = [];
  const limitations: string[] = [];
  const signals = auditSignalMap(audit);

  const det = (key: keyof TechnicalAudit) => audit[key] as { present: boolean | null; evidence: string[] };

  // Availability and integrity
  items.push({
    key: 'root_availability',
    label: 'Homepage loads correctly',
    max: 8,
    points: status === 'partially_broken' ? 8 : 0,
    detail:
      status === 'partially_broken'
        ? 'The homepage itself returns an error, so visitors landing on the root URL see a broken page.'
        : 'The homepage responds successfully.',
    source: 'http_check',
  });

  const broken = det('broken_internal_links');
  items.push({
    key: 'broken_links',
    label: 'Internal links resolve',
    max: 4,
    points: broken.present == null ? null : broken.present ? 4 : 0,
    detail: broken.evidence[0] ?? 'internal link check',
    source: 'http_check',
  });

  const https = det('https');
  items.push({
    key: 'https',
    label: 'Served over HTTPS',
    max: 4,
    points: https.present == null ? null : https.present ? 0 : 4,
    detail: https.evidence[0] ?? 'https check',
    source: 'http_check',
  });

  // Mobile experience
  const viewport = det('mobile_viewport');
  items.push({
    key: 'mobile_viewport',
    label: 'Mobile viewport configured',
    max: 8,
    points: viewport.present == null ? null : viewport.present ? 0 : 8,
    detail: viewport.evidence[0] ?? 'viewport check',
    source: 'dom_parse',
  });

  const responsive = det('responsive_css');
  items.push({
    key: 'responsive_css',
    label: 'Responsive layout',
    max: 3,
    points: responsive.present == null ? null : responsive.present ? 0 : 3,
    detail: responsive.evidence[0] ?? 'responsive css check',
    source: 'dom_parse',
  });

  const psMobile = audit.pagespeed_mobile;
  if (psMobile?.fetched && psMobile.performance_score != null) {
    const s = psMobile.performance_score;
    const pts = s < 40 ? 8 : s < 50 ? 6.5 : s < 70 ? 4 : s < 90 ? 1.5 : 0;
    items.push({
      key: 'pagespeed_mobile',
      label: 'Mobile performance',
      max: 8,
      points: pts,
      detail: `PageSpeed Insights mobile performance score ${s}/100${psMobile.lcp_ms != null ? `, LCP ${(psMobile.lcp_ms / 1000).toFixed(1)}s` : ''}.`,
      source: 'pagespeed',
    });
    evidence.push(`PageSpeed mobile performance: ${s}/100`);
  } else {
    items.push({
      key: 'pagespeed_mobile',
      label: 'Mobile performance',
      max: 8,
      points: null,
      detail: psMobile?.error ? `PageSpeed unavailable: ${psMobile.error}` : 'PageSpeed was not run',
      source: 'pagespeed',
    });
    limitations.push('Mobile PageSpeed data was unavailable, so performance did not contribute to the score.');
  }

  // Sector expectations from the approved playbook
  if (playbook) {
    const conv = missingRatio(playbook.essential_conversion_actions, (item) => {
      const key = REQUIREMENT_SIGNAL_MAP[item.trim().toLowerCase()];
      if (!key) return null;
      return signals[key] ?? null;
    });
    items.push({
      key: 'conversion_actions',
      label: 'Sector conversion actions present',
      max: 28,
      points: conv.ratio == null ? null : conv.ratio * 28,
      detail:
        conv.ratio == null
          ? `None of the playbook's conversion actions map to a signal we measured.`
          : conv.missing.length === 0
            ? `All ${conv.measured} measurable conversion actions expected in this sector are present.`
            : `Missing ${conv.missing.length} of ${conv.measured} expected conversion actions: ${conv.missing.join(', ')}.`,
      source: 'dom_parse',
    });
    if (conv.missing.length > 0) {
      evidence.push(`Missing sector conversion actions: ${conv.missing.join(', ')}`);
    }

    const foundPageTypes = new Set(audit.found_page_types);
    const pages = missingRatio(playbook.essential_pages, (item) => {
      const key = PAGE_TYPE_MAP[item.trim().toLowerCase()];
      if (!key) return null;
      return foundPageTypes.has(key);
    });
    items.push({
      key: 'essential_pages',
      label: 'Essential pages present',
      max: 10,
      points: pages.ratio == null ? null : pages.ratio * 10,
      detail:
        pages.ratio == null
          ? 'Playbook page requirements could not be matched to crawled pages.'
          : pages.missing.length === 0
            ? `All ${pages.measured} essential pages for this sector were found.`
            : `Missing essential pages: ${pages.missing.join(', ')}.`,
      source: 'http_check',
    });
    if (pages.missing.length > 0) evidence.push(`Missing essential pages: ${pages.missing.join(', ')}`);

    const trust = missingRatio(playbook.essential_trust_signals, (item) => {
      const key = REQUIREMENT_SIGNAL_MAP[item.trim().toLowerCase()];
      if (!key) return null;
      return signals[key] ?? null;
    });
    items.push({
      key: 'trust_signals',
      label: 'Trust signals present',
      max: 10,
      points: trust.ratio == null ? null : trust.ratio * 10,
      detail:
        trust.ratio == null
          ? 'Playbook trust requirements could not be matched to measured signals.'
          : trust.missing.length === 0
            ? `All ${trust.measured} expected trust signals are present.`
            : `Missing trust signals: ${trust.missing.join(', ')}.`,
      source: 'dom_parse',
    });
    if (trust.missing.length > 0) evidence.push(`Missing trust signals: ${trust.missing.join(', ')}`);
  } else {
    limitations.push(
      'No approved sector playbook matched this company, so sector-specific expectations were not scored.',
    );
  }

  // SEO / technical hygiene
  const hygiene: Array<[keyof TechnicalAudit, number, string]> = [
    ['page_title', 2, 'page title'],
    ['meta_description', 2, 'meta description'],
    ['h1', 2, 'H1 heading'],
    ['canonical', 1, 'canonical tag'],
    ['sitemap', 1, 'sitemap'],
  ];
  let hygienePoints = 0;
  let hygieneMax = 0;
  const hygieneMissing: string[] = [];
  for (const [key, weight, name] of hygiene) {
    const d = det(key);
    if (d.present == null) continue;
    hygieneMax += weight;
    if (!d.present) {
      hygienePoints += weight;
      hygieneMissing.push(name);
    }
  }
  items.push({
    key: 'seo_hygiene',
    label: 'Basic SEO hygiene',
    max: 6,
    points: hygieneMax === 0 ? null : (hygienePoints / hygieneMax) * 6,
    detail:
      hygieneMax === 0
        ? 'No SEO hygiene element could be checked.'
        : hygieneMissing.length === 0
          ? 'Title, meta description, H1, canonical tag and sitemap are all in place.'
          : `Missing: ${hygieneMissing.join(', ')}.`,
    source: 'dom_parse',
  });

  // Accessibility, SEO and best-practices come free with the PageSpeed call.
  const lighthouseExtras: Array<{ key: string; label: string; weight: number; read: (r: PageSpeedResult) => number | null }> = [
    { key: 'accessibility', label: 'Accessibility', weight: 4, read: (r) => r.accessibility_score },
    { key: 'best_practices', label: 'Best practices', weight: 3, read: (r) => r.best_practices_score },
  ];
  for (const { key, label, weight, read } of lighthouseExtras) {
    const score = psMobile?.fetched ? read(psMobile) : null;
    items.push({
      key: `lighthouse_${key}`,
      label: `${label} (Lighthouse)`,
      max: weight,
      points: score == null ? null : ((100 - clamp(score)) / 100) * weight,
      detail:
        score == null
          ? `Lighthouse ${label.toLowerCase()} was not measured.`
          : `Lighthouse ${label.toLowerCase()} score ${score}/100.`,
      source: 'pagespeed',
    });
    if (score != null && score < 60) evidence.push(`Lighthouse ${label.toLowerCase()}: ${score}/100`);
  }

  // How long the site has looked the way it looks now.
  const archive = audit.archive;
  const months = archive?.fetched ? archive.months_since_change : null;
  items.push({
    key: 'content_freshness',
    label: 'Site has changed recently',
    max: 8,
    points:
      months == null
        ? null
        : months >= 60
          ? 8
          : months >= 36
            ? 6
            : months >= 24
              ? 4
              : months >= 12
                ? 2
                : 0,
    detail:
      months == null
        ? (archive?.error ?? 'Archive history was not fetched.')
        : `The archived page last changed about ${months} month(s) ago${archive?.last_content_change ? ` (${archive.last_content_change.slice(0, 7)})` : ''}.`,
    source: 'http_check',
  });
  if (months != null && months >= 36) {
    evidence.push(`Site content has not changed in about ${Math.round(months / 12)} years`);
  }

  // A dated stack is a rebuild signal in its own right.
  const dated = audit.platform.dated_markers;
  items.push({
    key: 'dated_stack',
    label: 'Modern front-end stack',
    max: 6,
    points: Math.min(6, dated.length * 3),
    detail:
      dated.length === 0
        ? `No dated front-end markers found${audit.platform.platform ? ` (platform: ${audit.platform.platform})` : ''}.`
        : `Dated markers present: ${dated.join(', ')}.`,
    source: 'dom_parse',
  });
  if (dated.length > 0) evidence.push(`Dated front-end stack: ${dated.join(', ')}`);

  // Measurement / tracking
  const trackingPresent = ['ga4', 'gtm', 'meta_pixel', 'other_tracking'].filter((k) => signals[k] === true);
  const trackingMeasured = ['ga4', 'gtm', 'meta_pixel', 'other_tracking'].some((k) => signals[k] != null);
  items.push({
    key: 'tracking',
    label: 'Analytics and tracking installed',
    max: 4,
    points: !trackingMeasured ? null : trackingPresent.length === 0 ? 4 : trackingPresent.length === 1 ? 2 : 0,
    detail:
      trackingPresent.length === 0
        ? 'No analytics or advertising tag was detected, so the site cannot measure its own conversions.'
        : `Detected: ${trackingPresent.join(', ')}.`,
    source: 'dom_parse',
  });
  if (trackingPresent.length === 0 && trackingMeasured) {
    evidence.push('No analytics or advertising tracking tag detected on the site');
  }

  // Gap versus competitors
  if (competitors && competitors.measured && competitors.gaps_vs_company.length >= 0 && competitors.readable_count > 0) {
    const gapCount = competitors.gaps_vs_company.length;
    // Normalised against the number of patterns competitors commonly share.
    const denominator = Math.max(competitors.common_patterns.length, 1);
    const ratio = Math.min(1, gapCount / denominator);
    items.push({
      key: 'competitor_gap',
      label: 'Gap versus competitors',
      max: 12,
      points: ratio * 12,
      detail:
        gapCount === 0
          ? 'The site matches the conversion and trust patterns common among its competitors.'
          : `The site lacks ${gapCount} of the ${denominator} feature(s) most competitors offer: ${competitors.gaps_vs_company.slice(0, 3).join(' ')}`,
      source: 'dom_parse',
    });
    if (gapCount > 0) evidence.push(...competitors.gaps_vs_company.slice(0, 3));
  } else {
    items.push({
      key: 'competitor_gap',
      label: 'Gap versus competitors',
      max: 12,
      points: null,
      detail: 'No readable competitor was available to compare against.',
      source: 'dom_parse',
    });
  }

  // AI interpretation of structure and journey
  if (ai) {
    const dims = [
      ai.value_proposition_clarity,
      ai.customer_journey_clarity,
      ai.conversion_path_quality,
      ai.trust_and_credibility,
      ai.information_architecture,
    ];
    const avg = dims.reduce((a, b) => a + b, 0) / dims.length;
    let pts = ((100 - clamp(avg)) / 100) * 14;
    if (ai.problems_are_structural) pts = Math.max(pts, 14 * 0.6);
    items.push({
      key: 'ai_structure',
      label: 'Structure, journey and conversion path (AI interpretation)',
      max: 14,
      points: pts,
      detail: `Average of five interpreted dimensions: ${Math.round(avg)}/100. ${ai.summary}`,
      source: 'ai_interpretation',
    });
    evidence.push(ai.summary);
  } else {
    items.push({
      key: 'ai_structure',
      label: 'Structure, journey and conversion path (AI interpretation)',
      max: 14,
      points: null,
      detail: 'AI interpretation was not available for this company.',
      source: 'ai_interpretation',
    });
    limitations.push('AI interpretation of the site structure was unavailable; the score is based on measured checks only.');
  }

  const { score, breakdown } = normalize(items);

  if (score == null) {
    return {
      score: 50,
      measured: false,
      breakdown,
      evidence,
      limitations: [...limitations, 'No transformation-need item could be measured for this company.'],
      confidence: 'low',
      primary_reason: 'Nothing could be measured on this website, so it needs manual review.',
    };
  }

  const worst = [...breakdown]
    .filter((b) => b.max_points > 0)
    .sort((a, b) => b.points / b.max_points - a.points / a.max_points)[0];

  const measuredItems = items.filter((i) => i.points != null).length;
  const confidence: ConfidenceLevel =
    measuredItems >= 9 && ai ? 'high' : measuredItems >= 6 ? 'medium' : 'low';

  return {
    score,
    measured: true,
    breakdown,
    evidence,
    limitations,
    confidence,
    primary_reason:
      worst && worst.points > 0
        ? `${worst.label}: ${worst.detail}`
        : 'The website already covers the essentials expected in its sector.',
  };
}

// ---------------------------------------------------------------------------
// S — sector website importance
// ---------------------------------------------------------------------------

function computeSectorImportance(input: ScoringInput): {
  score: number;
  measured: boolean;
  breakdown: ScoreComponentBreakdown[];
  limitations: string[];
} {
  const { playbook, competitors } = input;
  const breakdown: ScoreComponentBreakdown[] = [];
  const limitations: string[] = [];

  if (!playbook) {
    return {
      score: 50,
      measured: false,
      breakdown: [
        {
          key: 'playbook',
          label: 'Sector playbook baseline',
          points: 0,
          max_points: 100,
          detail:
            'No approved sector playbook matched this company. 50 is an indeterminate placeholder, not a measurement.',
          source: 'human',
        },
      ],
      limitations: [
        'Sector website importance could not be established because no approved playbook matched this company.',
      ],
    };
  }

  const base = clamp(playbook.website_importance_score);
  breakdown.push({
    key: 'playbook_base',
    label: 'Sector playbook baseline',
    points: base,
    max_points: 100,
    detail: `${playbook.sector} › ${playbook.sub_sector} (${playbook.business_model}), playbook v${playbook.version}: ${base}/100. Expected website role: ${playbook.expected_website_role}.`,
    source: 'human',
  });

  // Company- and market-specific evidence adjusts the baseline, capped at ±8 so the
  // approved playbook stays the primary driver.
  let modifier = 0;
  const adoption = competitors?.active_website_adoption_rate ?? null;
  if (adoption != null && (competitors?.readable_count ?? 0) >= 2) {
    if (adoption >= 0.8) {
      modifier += 4;
      breakdown.push({
        key: 'competitor_adoption_up',
        label: 'Market evidence: competitors rely on websites',
        points: 4,
        max_points: 8,
        detail: `${Math.round(adoption * 100)}% of validated competitors serve a working website, confirming the website is central in this market.`,
        source: 'dom_parse',
      });
    } else if (adoption <= 0.34 && competitors!.analyzed_count >= 3) {
      modifier -= 6;
      breakdown.push({
        key: 'competitor_adoption_down',
        label: 'Market evidence: competitors barely use websites',
        points: -6,
        max_points: 8,
        detail: `Only ${Math.round(adoption * 100)}% of validated competitors serve a working website, which lowers how much a website matters in this specific market.`,
        source: 'dom_parse',
      });
    }
  }

  if (input.sector_confidence === 'low') {
    limitations.push(
      'Sector and business model were detected with low confidence, so the playbook match may be wrong.',
    );
  }

  const score = clamp(base + Math.max(-8, Math.min(8, modifier)));
  return { score, measured: true, breakdown, limitations };
}

// ---------------------------------------------------------------------------
// Final score
// ---------------------------------------------------------------------------

export function classifyOpportunity(score: number): OpportunityClassification {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium_manual_review';
  if (score >= 20) return 'low';
  return 'skip';
}

export const CLASSIFICATION_LABELS: Record<OpportunityClassification, string> = {
  very_high: 'Very High Website Opportunity',
  high: 'High Website Opportunity',
  medium_manual_review: 'Medium Opportunity — Manual Review',
  low: 'Low Opportunity',
  skip: 'Skip',
};

export const ACTION_LABELS: Record<RecommendedAction, string> = {
  new_website: 'Build a new website',
  complete_rebuild: 'Complete rebuild',
  major_redesign: 'Major redesign',
  targeted_improvements: 'Targeted improvements',
  minor_optimization: 'Minor optimization',
  no_action: 'No meaningful website work required',
  needs_review: 'Needs manual review before recommending',
};

/** Recommended action follows the transformation need, not the final priority score. */
export function recommendAction(
  transformationNeed: number,
  status: WebsiteStatus,
  measured: boolean,
): RecommendedAction {
  if (!measured) return 'needs_review';
  if (transformationNeed >= 85) return isMissingWebsite(status) || status === 'under_construction' ? 'new_website' : 'complete_rebuild';
  if (transformationNeed >= 60) return 'major_redesign';
  if (transformationNeed >= 35) return 'targeted_improvements';
  if (transformationNeed >= 15) return 'minor_optimization';
  return 'no_action';
}

/** The published formula. Exported so tests can pin it independently of the pipeline. */
export function potentialScore(W: number, S: number, C: number): number {
  return Math.round(W * ((0.65 * S + 0.35 * C) / 100));
}

/** Degraded form used when no competitor could be analysed: the C term is dropped, not faked. */
export function potentialScoreWithoutCompetitors(W: number, S: number): number {
  return Math.round(W * (S / 100));
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

function lowest(...levels: Array<ConfidenceLevel | null | undefined>): ConfidenceLevel {
  let out: ConfidenceLevel = 'high';
  for (const l of levels) {
    if (!l) continue;
    if (CONFIDENCE_RANK[l] < CONFIDENCE_RANK[out]) out = l;
  }
  return out;
}

export function calculateScores(input: ScoringInput): ScoringOutput {
  const w = computeTransformationNeed(input);
  const s = computeSectorImportance(input);
  const c = input.competitors;

  const W = w.score;
  const S = s.score;
  const C = c?.score ?? null;
  const competitorMeasured = c?.measured === true && C != null;

  const potential = competitorMeasured
    ? potentialScore(W, S, C!)
    : potentialScoreWithoutCompetitors(W, S);

  const limitations = [...w.limitations, ...s.limitations, ...(c?.limitations ?? [])];
  if (!competitorMeasured) {
    limitations.push(
      'Competitor website usage could not be measured, so the final score was computed as W × (S / 100) with the competitor term dropped rather than assumed.',
    );
  }
  if (!c) {
    limitations.push('Competitor discovery did not run for this company.');
  }

  const requiresReview =
    !w.measured ||
    !s.measured ||
    !competitorMeasured ||
    input.sector_confidence === 'low' ||
    input.unresolved_manual_review === true ||
    classifyOpportunity(potential) === 'medium_manual_review';

  const confidence = lowest(
    w.confidence,
    c?.confidence,
    input.sector_confidence,
    s.measured ? 'high' : 'low',
    input.ai?.confidence,
  );

  const recommended = recommendAction(W, input.status, w.measured);

  const supporting_evidence = [...w.evidence, ...(c?.evidence ?? []).slice(0, 3)].filter(Boolean).slice(0, 10);

  const hasEvidence = supporting_evidence.length > 0 || isMissingWebsite(input.status);

  const should_generate_outreach =
    potential >= input.min_score_for_outreach &&
    w.measured &&
    hasEvidence &&
    input.unresolved_manual_review !== true &&
    recommended !== 'needs_review' &&
    recommended !== 'no_action';

  return {
    sector_website_importance: S,
    website_transformation_need: W,
    competitor_website_usage: C,
    competitor_measured: competitorMeasured,
    transformation_measured: w.measured,
    potential_score: potential,
    classification: classifyOpportunity(potential),
    recommended_action: recommended,
    primary_reason: w.primary_reason,
    supporting_evidence,
    confidence,
    limitations: [...new Set(limitations)],
    should_generate_outreach,
    requires_human_review: requiresReview,
    importance_breakdown: s.breakdown,
    transformation_breakdown: w.breakdown,
    competitor_breakdown: c?.breakdown ?? [],
  };
}
