/**
 * Competitor website-usage scoring.
 *
 * The question is not "do competitors own a website" — almost everyone does. It is
 * whether competitors actively use their websites to communicate with, capture and
 * convert customers. That is what makes a company's weak site a commercial liability
 * rather than a cosmetic one.
 *
 * Every rate here is computed from signals we actually probed on each competitor site.
 * Competitors we could not read are excluded from the denominators and reported as a
 * limitation instead of being counted as absent.
 */

import type { ConfidenceLevel, ScoreComponentBreakdown, WebsiteStatus } from './types';
import { SIGNAL_LABELS } from './audit-checks';
import { isAuditable, isMissingWebsite } from './website-status';

export interface CompetitorAnalysis {
  name: string;
  website: string;
  status: WebsiteStatus;
  /** null = we could not measure this signal on this competitor. */
  signals: Record<string, boolean | null>;
  evidence: string[];
}

export interface CompetitorUsageSummary {
  /** null when no competitor could be analysed — never substituted with a guess. */
  score: number | null;
  measured: boolean;
  analyzed_count: number;
  readable_count: number;
  active_website_adoption_rate: number | null;
  conversion_feature_adoption_rate: number | null;
  communication_feature_rate: number | null;
  content_trust_rate: number | null;
  common_patterns: string[];
  strongest_practices: string[];
  gaps_vs_company: string[];
  evidence: string[];
  confidence: ConfidenceLevel;
  limitations: string[];
  breakdown: ScoreComponentBreakdown[];
}

/** Default conversion signals, used when no sector playbook narrows them. */
const DEFAULT_CONVERSION_SIGNALS = [
  'contact_form',
  'booking_link',
  'quote_request',
  'demo_request',
  'checkout_or_cart',
  'pricing',
  'landing_pages',
  'lead_magnet',
];

/** Signals that show a competitor opens a direct communication channel. */
const COMMUNICATION_SIGNALS = ['whatsapp_link', 'click_to_call', 'live_chat', 'contact_form'];

/** Default credibility and content signals. */
const DEFAULT_CONTENT_TRUST_SIGNALS = [
  'value_proposition',
  'case_studies',
  'testimonials',
  'reviews',
  'client_logos',
  'updated_content',
];

/**
 * Which signals actually matter in this sector.
 *
 * Measuring every competitor against a universal checklist is misleading: a dental
 * clinic that has no shopping cart is not "under-using" its website. When a playbook is
 * available the caller narrows these lists to what the sector's customer journey needs,
 * so the rate reflects real adoption rather than checklist coverage.
 */
export interface RelevantSignals {
  conversion?: string[];
  content?: string[];
}

const WEIGHTS = {
  adoption: 30,
  conversion: 35,
  communication: 20,
  content: 15,
} as const;

/** Fraction of `keys` present across `analyses`, ignoring signals we could not measure. */
function rate(analyses: CompetitorAnalysis[], keys: readonly string[]): number | null {
  let present = 0;
  let measured = 0;
  for (const a of analyses) {
    for (const k of keys) {
      const v = a.signals[k];
      if (v === null || v === undefined) continue;
      measured += 1;
      if (v) present += 1;
    }
  }
  if (measured === 0) return null;
  return present / measured;
}

function pct(v: number | null): string {
  return v == null ? 'not measured' : `${Math.round(v * 100)}%`;
}

export function summarizeCompetitorUsage(
  competitors: CompetitorAnalysis[],
  companySignals: Record<string, boolean | null> | null,
  relevant: RelevantSignals = {},
): CompetitorUsageSummary {
  const limitations: string[] = [];
  const evidence: string[] = [];

  const CONVERSION_SIGNALS =
    relevant.conversion && relevant.conversion.length > 0 ? relevant.conversion : DEFAULT_CONVERSION_SIGNALS;
  const CONTENT_TRUST_SIGNALS =
    relevant.content && relevant.content.length > 0 ? relevant.content : DEFAULT_CONTENT_TRUST_SIGNALS;

  if (competitors.length === 0) {
    return {
      score: null,
      measured: false,
      analyzed_count: 0,
      readable_count: 0,
      active_website_adoption_rate: null,
      conversion_feature_adoption_rate: null,
      communication_feature_rate: null,
      content_trust_rate: null,
      common_patterns: [],
      strongest_practices: [],
      gaps_vs_company: [],
      evidence: [],
      confidence: 'low',
      limitations: [
        'No competitor could be discovered and validated for this company, so the competitor component was not measured.',
      ],
      breakdown: [],
    };
  }

  const readable = competitors.filter((c) => isAuditable(c.status));
  const activeCount = competitors.filter((c) => isAuditable(c.status)).length;
  const definitelyInactive = competitors.filter((c) => isMissingWebsite(c.status)).length;
  const unreadable = competitors.length - activeCount - definitelyInactive;

  // Adoption is only meaningful over competitors whose status we could establish either way.
  const adoptionDenominator = activeCount + definitelyInactive;
  const adoption = adoptionDenominator > 0 ? activeCount / adoptionDenominator : null;

  if (unreadable > 0) {
    limitations.push(
      `${unreadable} of ${competitors.length} competitor site(s) could not be read (bot protection, timeout or blocked access) and were excluded from the rates.`,
    );
  }
  if (competitors.length < 3) {
    limitations.push(
      `Only ${competitors.length} valid competitor(s) were found; the target is 3. Treat the competitor component as indicative rather than conclusive.`,
    );
  }

  const conversion = rate(readable, CONVERSION_SIGNALS);
  const communication = rate(readable, COMMUNICATION_SIGNALS);
  const content = rate(readable, CONTENT_TRUST_SIGNALS);

  const parts: ScoreComponentBreakdown[] = [];
  let total = 0;
  let availableWeight = 0;

  const push = (key: string, label: string, value: number | null, weight: number, detail: string) => {
    if (value == null) {
      parts.push({ key, label, points: 0, max_points: weight, detail: `${detail} — not measured`, source: 'dom_parse' });
      return;
    }
    const points = value * weight;
    total += points;
    availableWeight += weight;
    parts.push({ key, label, points: Math.round(points), max_points: weight, detail, source: 'dom_parse' });
  };

  push(
    'adoption',
    'Active website adoption',
    adoption,
    WEIGHTS.adoption,
    `${activeCount} of ${adoptionDenominator} competitor(s) with an established status serve a working website (${pct(adoption)})`,
  );
  push(
    'conversion',
    'Conversion feature adoption',
    conversion,
    WEIGHTS.conversion,
    `${pct(conversion)} of measured conversion signals (forms, booking, quotes, checkout, pricing, landing pages) are present across readable competitors`,
  );
  push(
    'communication',
    'Customer communication features',
    communication,
    WEIGHTS.communication,
    `${pct(communication)} of measured direct-contact signals (WhatsApp, click-to-call, live chat, forms) are present`,
  );
  push(
    'content',
    'Content and credibility depth',
    content,
    WEIGHTS.content,
    `${pct(content)} of measured trust and content signals (value proposition, case studies, testimonials, reviews, logos, freshness) are present`,
  );

  // Re-base onto 0–100 over the weight we could actually measure, so an unmeasurable
  // dimension lowers confidence rather than silently dragging the score to zero.
  const score = availableWeight === 0 ? null : Math.round((total / availableWeight) * 100);

  if (availableWeight === 0) {
    limitations.push('No competitor signal could be measured; the competitor component is unavailable.');
  }

  // --- Patterns and gaps ---------------------------------------------------------
  const allKeys = [...new Set([...CONVERSION_SIGNALS, ...COMMUNICATION_SIGNALS, ...CONTENT_TRUST_SIGNALS])];
  const common_patterns: string[] = [];
  const strongest_practices: string[] = [];
  const gaps_vs_company: string[] = [];

  for (const key of allKeys) {
    const withSignal = readable.filter((c) => c.signals[key] === true);
    const measuredOn = readable.filter((c) => c.signals[key] === true || c.signals[key] === false);
    if (measuredOn.length === 0) continue;
    const label = SIGNAL_LABELS[key] ?? key;
    const ratio = withSignal.length / measuredOn.length;

    if (ratio >= 0.6) {
      common_patterns.push(`${label}: present on ${withSignal.length} of ${measuredOn.length} competitor sites`);
    }
    if (ratio >= 0.5 && companySignals && companySignals[key] === false) {
      gaps_vs_company.push(
        `${withSignal.length} of ${measuredOn.length} competitors offer ${label.toLowerCase()}; this company's site does not.`,
      );
    }
  }

  for (const c of readable) {
    const presentCount = allKeys.filter((k) => c.signals[k] === true).length;
    if (presentCount >= Math.max(4, Math.ceil(allKeys.length * 0.5))) {
      strongest_practices.push(
        `${c.name} (${c.website}) uses ${presentCount} of the ${allKeys.length} tracked conversion, communication and trust signals.`,
      );
    }
    evidence.push(...c.evidence.slice(0, 2));
  }

  const confidence: ConfidenceLevel =
    readable.length >= 3 && unreadable === 0 ? 'high' : readable.length >= 2 ? 'medium' : 'low';

  return {
    score,
    measured: score != null,
    analyzed_count: competitors.length,
    readable_count: readable.length,
    active_website_adoption_rate: adoption,
    conversion_feature_adoption_rate: conversion,
    communication_feature_rate: communication,
    content_trust_rate: content,
    common_patterns,
    strongest_practices,
    gaps_vs_company,
    evidence: evidence.slice(0, 12),
    confidence,
    limitations,
    breakdown: parts,
  };
}
