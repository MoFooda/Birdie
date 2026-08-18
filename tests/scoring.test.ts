import { describe, expect, it } from 'vitest';
import {
  calculateScores,
  classifyOpportunity,
  potentialScore,
  potentialScoreWithoutCompetitors,
  recommendAction,
  type AiWebsiteAssessment,
  type ScoringInput,
} from '@/core/scoring';
import { summarizeCompetitorUsage } from '@/core/competitor-scoring';
import { SEED_PLAYBOOKS } from '@/core/playbooks';
import { runTechnicalAudit } from '@/core/audit-checks';
import { buildFixtureSite } from '@/fixtures/site-builder';
import type { SectorPlaybook } from '@/core/types';

const clinicPlaybook: SectorPlaybook = {
  ...SEED_PLAYBOOKS.find((p) => p.sub_sector === 'Appointment-driven clinic')!,
  id: 'pb-clinic',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ai: AiWebsiteAssessment = {
  value_proposition_clarity: 50,
  customer_journey_clarity: 50,
  conversion_path_quality: 50,
  trust_and_credibility: 50,
  information_architecture: 50,
  fulfills_expected_role: false,
  problems_are_structural: false,
  rebuild_justified: false,
  targeted_improvements_sufficient: true,
  summary: 'Half the expected journey is present.',
  confidence: 'medium',
};

function auditFor(features: Parameters<typeof buildFixtureSite>[0]['features'], pagespeed = 80) {
  const built = buildFixtureSite({
    domain: 'test-site.com',
    name: 'Test',
    kind: 'live',
    features,
    pages: ['about', 'services', 'contact'],
    pagespeed_mobile: pagespeed,
  });
  return runTechnicalAudit(built.site!, {
    mobile: { strategy: 'mobile', performance_score: pagespeed, accessibility_score: 80, seo_score: 85, best_practices_score: 80, lcp_ms: 2000, cls: 0.1, tbt_ms: 100, fetched: true },
    desktop: null,
  });
}

function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    status: 'live',
    audit: auditFor(['viewport', 'responsive', 'meta_description', 'canonical', 'sitemap']),
    playbook: clinicPlaybook,
    ai,
    visual: null,
    competitors: summarizeCompetitorUsage([], null),
    sector_confidence: 'high',
    min_score_for_outreach: 40,
    ...overrides,
  };
}

describe('the published formula', () => {
  it('is round(W × ((0.65 × S + 0.35 × C) / 100))', () => {
    expect(potentialScore(80, 90, 70)).toBe(Math.round(80 * ((0.65 * 90 + 0.35 * 70) / 100)));
    expect(potentialScore(80, 90, 70)).toBe(66);
    expect(potentialScore(100, 100, 100)).toBe(100);
    expect(potentialScore(0, 100, 100)).toBe(0);
    expect(potentialScore(50, 0, 0)).toBe(0);
  });

  it('drops the C term rather than assuming a value when competitors are unmeasured', () => {
    expect(potentialScoreWithoutCompetitors(80, 90)).toBe(72);
    expect(potentialScoreWithoutCompetitors(95, 88)).toBe(Math.round(95 * 0.88));
  });

  it('never exceeds the transformation need', () => {
    for (const w of [0, 17, 42, 63, 88, 100]) {
      for (const s of [0, 55, 100]) {
        for (const c of [0, 55, 100]) {
          expect(potentialScore(w, s, c)).toBeLessThanOrEqual(w);
        }
      }
    }
  });
});

describe('classification thresholds', () => {
  it.each([
    [100, 'very_high'],
    [80, 'very_high'],
    [79, 'high'],
    [60, 'high'],
    [59, 'medium_manual_review'],
    [40, 'medium_manual_review'],
    [39, 'low'],
    [20, 'low'],
    [19, 'skip'],
    [0, 'skip'],
  ] as const)('classifies %i as %s', (score, expected) => {
    expect(classifyOpportunity(score)).toBe(expected);
  });
});

describe('recommended action thresholds', () => {
  it.each([
    [100, 'live', 'complete_rebuild'],
    [85, 'live', 'complete_rebuild'],
    [95, 'no_website', 'new_website'],
    [95, 'parked_domain', 'new_website'],
    [95, 'under_construction', 'new_website'],
    [84, 'live', 'major_redesign'],
    [60, 'live', 'major_redesign'],
    [59, 'live', 'targeted_improvements'],
    [35, 'live', 'targeted_improvements'],
    [34, 'live', 'minor_optimization'],
    [15, 'live', 'minor_optimization'],
    [14, 'live', 'no_action'],
    [0, 'live', 'no_action'],
  ] as const)('maps W=%i on a %s site to %s', (need, status, expected) => {
    expect(recommendAction(need, status, true)).toBe(expected);
  });

  it('refuses to recommend anything when the need could not be measured', () => {
    expect(recommendAction(50, 'bot_protection', false)).toBe('needs_review');
  });
});

describe('calculateScores', () => {
  it('scores a company with no website at the top of the range', () => {
    const result = calculateScores(baseInput({ status: 'no_website', audit: null }));
    expect(result.website_transformation_need).toBe(95);
    expect(result.recommended_action).toBe('new_website');
    expect(result.transformation_measured).toBe(true);
  });

  it('scores a strong site in a website-critical sector as a low opportunity', () => {
    const result = calculateScores(
      baseInput({
        audit: auditFor(
          [
            'viewport', 'responsive', 'canonical', 'sitemap', 'meta_description',
            'booking_link', 'contact_form', 'whatsapp_link', 'click_to_call',
            'testimonials', 'reviews', 'certifications', 'contact_details', 'ga4', 'gtm',
          ],
          92,
        ),
        ai: { ...ai, value_proposition_clarity: 90, customer_journey_clarity: 90, conversion_path_quality: 90, trust_and_credibility: 90, information_architecture: 90 },
      }),
    );
    expect(result.website_transformation_need).toBeLessThan(20);
    expect(['low', 'skip']).toContain(result.classification);
    expect(result.should_generate_outreach).toBe(false);
  });

  it('scores a weak site in a website-critical sector as a high need', () => {
    const result = calculateScores(baseInput({ audit: auditFor(['responsive'], 28) }));
    expect(result.website_transformation_need).toBeGreaterThan(55);
  });

  it('scores a weak site in a website-unimportant sector lower than the same site in a critical one', () => {
    const weakAudit = auditFor(['responsive'], 28);
    const critical = calculateScores(baseInput({ audit: weakAudit }));
    const unimportant = calculateScores(
      baseInput({
        audit: weakAudit,
        playbook: { ...clinicPlaybook, website_importance_score: 25 },
      }),
    );
    expect(unimportant.potential_score).toBeLessThan(critical.potential_score);
  });

  it('never counts an unmeasured check as a failed check', () => {
    const features = ['viewport', 'responsive', 'meta_description', 'canonical', 'sitemap'] as const;

    const unmeasured = calculateScores(
      baseInput({
        audit: {
          ...auditFor([...features]),
          pagespeed_mobile: { strategy: 'mobile', performance_score: null, accessibility_score: null, seo_score: null, best_practices_score: null, lcp_ms: null, cls: null, tbt_ms: null, fetched: false, error: 'no API key' },
        },
      }),
    );
    // The same site where performance was measured and genuinely failed.
    const failed = calculateScores(baseInput({ audit: auditFor([...features], 20) }));

    expect(unmeasured.website_transformation_need).toBeLessThan(failed.website_transformation_need);

    // The item contributes nothing to either side of the ratio, and says so.
    const item = unmeasured.transformation_breakdown.find((b) => b.key === 'pagespeed_mobile');
    expect(item?.points).toBe(0);
    expect(item?.detail).toMatch(/not measured/);
    expect(unmeasured.limitations.join(' ')).toMatch(/PageSpeed/i);
  });

  it('flags for review and refuses outreach when the site could not be read', () => {
    const result = calculateScores(baseInput({ status: 'bot_protection', audit: null }));
    expect(result.transformation_measured).toBe(false);
    expect(result.requires_human_review).toBe(true);
    expect(result.recommended_action).toBe('needs_review');
    expect(result.should_generate_outreach).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.transformation_breakdown[0]?.detail).toMatch(/indeterminate placeholder/i);
  });

  it('marks sector importance unmeasured when no playbook matched', () => {
    const result = calculateScores(baseInput({ playbook: null }));
    expect(result.sector_website_importance).toBe(50);
    expect(result.requires_human_review).toBe(true);
    expect(result.limitations.join(' ')).toMatch(/no approved playbook/i);
  });

  it('keeps the playbook as the primary driver of S, capping company evidence at ±8', () => {
    const strongMarket = calculateScores(
      baseInput({
        competitors: summarizeCompetitorUsage(
          [
            { name: 'A', website: 'https://a.com', status: 'live', signals: { contact_form: true, booking_link: true }, evidence: [] },
            { name: 'B', website: 'https://b.com', status: 'live', signals: { contact_form: true, booking_link: true }, evidence: [] },
            { name: 'C', website: 'https://c.com', status: 'live', signals: { contact_form: true, booking_link: true }, evidence: [] },
          ],
          null,
        ),
      }),
    );
    expect(Math.abs(strongMarket.sector_website_importance - clinicPlaybook.website_importance_score)).toBeLessThanOrEqual(8);
  });

  it('withholds outreach below the campaign threshold', () => {
    const result = calculateScores(baseInput({ min_score_for_outreach: 99 }));
    expect(result.should_generate_outreach).toBe(false);
  });

  it('withholds outreach while a manual review is unresolved', () => {
    const result = calculateScores(
      baseInput({ audit: auditFor(['responsive'], 28), min_score_for_outreach: 0, unresolved_manual_review: true }),
    );
    expect(result.should_generate_outreach).toBe(false);
    expect(result.requires_human_review).toBe(true);
  });

  it('produces a breakdown that adds up to the published components', () => {
    const result = calculateScores(baseInput({ audit: auditFor(['responsive'], 28) }));
    for (const item of result.transformation_breakdown) {
      expect(item.points).toBeGreaterThanOrEqual(0);
      expect(item.points).toBeLessThanOrEqual(item.max_points);
      expect(item.detail.length).toBeGreaterThan(0);
      expect(item.source).toBeTruthy();
    }
    expect(result.transformation_breakdown.length).toBeGreaterThan(5);
  });

  it('always returns scores inside 0–100', () => {
    for (const status of ['live', 'no_website', 'bot_protection', 'ssl_failure', 'under_construction'] as const) {
      const result = calculateScores(baseInput({ status, audit: status === 'live' ? auditFor(['responsive']) : null }));
      for (const value of [result.potential_score, result.website_transformation_need, result.sector_website_importance]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
