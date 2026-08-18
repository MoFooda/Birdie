/**
 * The visual pass: looking at the site rather than reading it.
 *
 * The rule these tests defend is the same one that governs every other provider here,
 * applied to the claim that is easiest to fake: a verdict about how a page *looks* may
 * only exist when something actually looked at a picture of it. With no screenshot, the
 * step must report why it did not run, the scoring engine must leave its items out of
 * both sides of the ratio, and no finding may appear describing a page nobody saw.
 */

import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@/store/memory';
import { seedDemoCampaign } from '@/demo/seed';
import { runCompanyPipeline } from '@/pipeline/runner';
import { createFixtureScraper } from '@/providers/scraper';
import { createFixtureSearch } from '@/providers/search';
import { createFixturePageSpeed } from '@/providers/pagespeed';
import { createFixtureAi } from '@/providers/ai';
import { createFixtureScreenshot } from '@/providers/screenshot';
import { createFixtureArchive } from '@/providers/archive';
import { createFixtureVision } from '@/providers/vision';
import type { Providers, VisionProvider } from '@/providers/types';
import { calculateScores, type AiWebsiteAssessment, type ScoringInput } from '@/core/scoring';
import { summarizeCompetitorUsage } from '@/core/competitor-scoring';
import { SEED_PLAYBOOKS } from '@/core/playbooks';
import { runTechnicalAudit } from '@/core/audit-checks';
import { buildFixtureSite } from '@/fixtures/site-builder';
import { visualComparisonFindings, visualFindings } from '@/core/findings';
import { safeParseAi } from '@/core/schemas';
import { visualAssessmentSchema, type VisualAssessment, type VisualComparison } from '@/core/visual-schemas';
import type { SectorPlaybook } from '@/core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const playbook: SectorPlaybook = {
  ...SEED_PLAYBOOKS.find((p) => p.sub_sector === 'Appointment-driven clinic')!,
  id: 'pb-clinic',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ai: AiWebsiteAssessment = {
  value_proposition_clarity: 60,
  customer_journey_clarity: 60,
  conversion_path_quality: 60,
  trust_and_credibility: 60,
  information_architecture: 60,
  fulfills_expected_role: true,
  problems_are_structural: false,
  rebuild_justified: false,
  targeted_improvements_sufficient: true,
  summary: 'Most of the journey is present.',
  confidence: 'medium',
};

function assessment(overrides: Partial<VisualAssessment> = {}): VisualAssessment {
  return {
    visual_hierarchy: 30,
    above_fold_clarity: 25,
    imagery_quality: 35,
    brand_consistency: 40,
    readability: 45,
    visual_clutter: 30,
    mobile_layout_quality: 20,
    design_era: 'dated_2010_2014',
    design_era_confidence: 'high',
    design_era_evidence: ['Gradient buttons with bevelled edges', 'Small body text with tight line height'],
    purpose_clear_above_fold: false,
    primary_action_visible: false,
    primary_action_described: null,
    summary: 'The first screen is a stock photograph with no statement of what the clinic does.',
    confidence: 'high',
    findings: [
      {
        title: 'Text sits directly on a busy photograph',
        severity: 'medium',
        observed: 'White headline over a high-contrast photo, unreadable in the middle third.',
        business_impact: 'The one line meant to explain the business is the hardest thing on the page to read.',
        recommended_action: 'Put the headline on a solid panel, or darken the image behind it.',
        suitable_for_outreach: true,
      },
    ],
    ...overrides,
  };
}

function scoringInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  const built = buildFixtureSite({
    domain: 'clinic-test.com',
    name: 'Clinic',
    kind: 'live',
    features: ['viewport', 'responsive', 'meta_description', 'canonical', 'sitemap', 'booking_link'],
    pages: ['about', 'services', 'contact'],
    pagespeed_mobile: 70,
  });
  return {
    status: 'live',
    audit: runTechnicalAudit(built.site!, { mobile: null, desktop: null }),
    playbook,
    ai,
    visual: null,
    competitors: summarizeCompetitorUsage([], null),
    sector_confidence: 'high',
    min_score_for_outreach: 40,
    ...overrides,
  };
}

const item = (input: ScoringInput, key: string) =>
  calculateScores(input).transformation_breakdown.find((b) => b.key === key)!;

// ---------------------------------------------------------------------------

describe('visual scoring', () => {
  it('leaves the visual items out of both sides of the ratio when nothing was looked at', () => {
    const blind = calculateScores(scoringInput());
    const quality = blind.transformation_breakdown.find((b) => b.key === 'visual_quality')!;
    const era = blind.transformation_breakdown.find((b) => b.key === 'design_era')!;

    expect(quality.detail).toContain('not measured');
    expect(era.detail).toContain('not measured');

    // The proof that they were excluded rather than counted as zero: a site that scores
    // perfectly on everything else still cannot be dragged up by two absent items.
    // Adding a *perfect* visual assessment must therefore lower the need score, and
    // adding a terrible one must raise it — an item counted as zero could do neither.
    const perfect = calculateScores(
      scoringInput({
        visual: assessment({
          visual_hierarchy: 100,
          above_fold_clarity: 100,
          imagery_quality: 100,
          brand_consistency: 100,
          readability: 100,
          visual_clutter: 100,
          mobile_layout_quality: 100,
          design_era: 'current',
          purpose_clear_above_fold: true,
          primary_action_visible: true,
          findings: [],
        }),
      }),
    );
    const terrible = calculateScores(scoringInput({ visual: assessment() }));

    expect(perfect.website_transformation_need).toBeLessThan(blind.website_transformation_need);
    expect(terrible.website_transformation_need).toBeGreaterThan(blind.website_transformation_need);
  });

  it('says so in the limitations when the site was never looked at', () => {
    const blind = calculateScores(scoringInput());
    expect(blind.limitations.some((l) => l.includes('not looked at visually'))).toBe(true);

    const seen = calculateScores(scoringInput({ visual: assessment() }));
    expect(seen.limitations.some((l) => l.includes('not looked at visually'))).toBe(false);
  });

  it('scores an older-looking design as needing more work than a current one', () => {
    const dated = item(scoringInput({ visual: assessment({ design_era: 'pre_2010' }) }), 'design_era');
    const recent = item(scoringInput({ visual: assessment({ design_era: 'current' }) }), 'design_era');

    expect(dated.points).toBeGreaterThan(recent.points);
    expect(recent.points).toBe(0);
  });

  it('refuses to score a design era the model was not confident about', () => {
    const unsure = item(
      scoringInput({ visual: assessment({ design_era: 'dated_2010_2014', design_era_confidence: 'low' }) }),
      'design_era',
    );
    const cannotTell = item(scoringInput({ visual: assessment({ design_era: 'cannot_tell' }) }), 'design_era');

    // Both are unmeasured — a hedged guess about a decade is not evidence to sell against.
    expect(unsure.detail).toContain('not measured');
    expect(cannotTell.detail).toContain('not measured');
  });

  it('never lets a low-confidence look raise the overall confidence', () => {
    const result = calculateScores(scoringInput({ visual: assessment({ confidence: 'low' }) }));
    expect(result.confidence).toBe('low');
  });
});

describe('visual findings', () => {
  it('attributes every visual claim to the screenshot and marks it interpretation', () => {
    const findings = visualFindings(assessment());
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.measurement_source).toBe('ai_interpretation');
      expect(f.category).toBe('visual_design');
      expect(f.evidence.length).toBeGreaterThan(0);
    }
    expect(findings.some((f) => f.evidence.includes('Seen in the rendered screenshot'))).toBe(true);
  });

  it('raises the dated-design finding only when the era call was confident', () => {
    const confident = visualFindings(assessment({ design_era: 'dated_2010_2014', design_era_confidence: 'high' }));
    const hedged = visualFindings(assessment({ design_era: 'dated_2010_2014', design_era_confidence: 'low' }));

    expect(confident.some((f) => f.title.includes('dated'))).toBe(true);
    expect(hedged.some((f) => f.title.includes('dated'))).toBe(false);
  });

  it('does not invent an above-the-fold problem on a page that has none', () => {
    const findings = visualFindings(
      assessment({
        design_era: 'current',
        purpose_clear_above_fold: true,
        primary_action_visible: true,
        primary_action_described: 'Book an appointment',
        findings: [],
      }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('visual comparison', () => {
  const comparison = (overrides: Partial<VisualComparison> = {}): VisualComparison => ({
    company_stands_out_as: 'clearly_worse',
    gap_summary: 'Both competitors lead with a booking panel; this one leads with a stock photo.',
    visible_differences: ['Competitors show prices above the fold'],
    confidence: 'medium',
    ...overrides,
  });

  it('raises a finding only when the company comes off worse', () => {
    expect(visualComparisonFindings(comparison(), ['A', 'B'])).toHaveLength(1);
    expect(visualComparisonFindings(comparison({ company_stands_out_as: 'comparable' }), ['A'])).toHaveLength(0);
    expect(visualComparisonFindings(comparison({ company_stands_out_as: 'clearly_better' }), ['A'])).toHaveLength(0);
    expect(visualComparisonFindings(comparison({ company_stands_out_as: 'cannot_tell' }), ['A'])).toHaveLength(0);
  });

  it('names the competitors it was compared against, so the claim is checkable', () => {
    const [finding] = visualComparisonFindings(comparison(), ['Smile Studio', 'City Dental']);
    expect(finding!.evidence).toContain('Smile Studio');
    expect(finding!.evidence).toContain('City Dental');
  });
});

describe('the vision schema gate', () => {
  it('discards a response that omits the evidence behind its era call', () => {
    const { design_era_evidence: _dropped, ...withoutEvidence } = assessment();
    expect(safeParseAi(visualAssessmentSchema, withoutEvidence).ok).toBe(false);
  });

  it('discards a response that invents a score outside the scale', () => {
    expect(safeParseAi(visualAssessmentSchema, assessment({ readability: 140 })).ok).toBe(false);
  });

  it('discards a finding with no observation to back it', () => {
    const bad = assessment({
      findings: [
        {
          title: 'Looks bad',
          severity: 'high',
          observed: '',
          business_impact: 'x',
          recommended_action: 'y',
          suitable_for_outreach: true,
        },
      ],
    });
    expect(safeParseAi(visualAssessmentSchema, bad).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End to end through the pipeline
// ---------------------------------------------------------------------------

function providers(vision: VisionProvider): Providers {
  return {
    scraper: createFixtureScraper(),
    search: createFixtureSearch(),
    pagespeed: createFixturePageSpeed(),
    ai: createFixtureAi(),
    screenshot: createFixtureScreenshot(),
    archive: createFixtureArchive(),
    vision,
  };
}

/** A vision provider that can see. Deterministic, so the pipeline stays idempotent. */
function stubVision(data = assessment()): VisionProvider {
  return {
    name: 'stub-vision',
    live: true,
    async assess() {
      return { ok: true, data, error: null, provider: 'stub-vision', live: true, duration_ms: 1 };
    },
    async compare() {
      return {
        ok: true,
        data: {
          company_stands_out_as: 'clearly_worse',
          gap_summary: 'The competitors both lead with a booking panel.',
          visible_differences: ['Competitors show a booking button above the fold'],
          confidence: 'medium',
        },
        error: null,
        provider: 'stub-vision',
        live: true,
        duration_ms: 1,
      };
    },
  };
}

/** Seed the demo campaign and return one company that has a live fixture website. */
async function seedLiveCompany(store: MemoryStore) {
  const { campaignId } = await seedDemoCampaign(store);
  const companies = await store.listCompanies(campaignId);
  const company = companies.find((c) => (c.submitted_website ?? '').includes('alnoordental'))!;
  return { campaignId, company };
}

async function runOne(vision: VisionProvider) {
  const store = new MemoryStore();
  const { campaignId, company } = await seedLiveCompany(store);
  await runCompanyPipeline({
    store,
    providers: providers(vision),
    campaignId,
    companyId: company.id,
    demo: true,
  });
  return { store, companyId: company.id };
}

describe('the visual step in the pipeline', () => {
  it('records why it did not run rather than describing a page it never saw', async () => {
    const { store, companyId } = await runOne(createFixtureVision());

    const run = await store.getAuditRun(companyId);
    expect(run?.visual_assessment).toBeNull();
    expect(run?.visual_unavailable_reason).toBeTruthy();

    const findings = await store.listFindings(companyId);
    expect(findings.some((f) => f.category === 'visual_design')).toBe(false);

    const score = await store.getScore(companyId);
    expect(score!.limitations.some((l) => l.includes('not looked at visually'))).toBe(true);

    // And the step is reported as skipped, not silently succeeded.
    const jobs = await store.listJobRunsForCompany(companyId);
    expect(jobs.find((j) => j.step === 'analyze-visual-design')?.status).toBe('skipped');
  });

  it('stores the assessment and its findings when something did look', async () => {
    const { store, companyId } = await runOne(stubVision());

    const run = await store.getAuditRun(companyId);
    expect((run?.visual_assessment as VisualAssessment).design_era).toBe('dated_2010_2014');
    expect(run?.visual_unavailable_reason).toBeNull();

    const findings = await store.listFindings(companyId);
    const visualOnes = findings.filter((f) => f.category === 'visual_design');
    expect(visualOnes.length).toBeGreaterThan(0);
    expect(visualOnes.every((f) => f.measurement_source === 'ai_interpretation')).toBe(true);

    const score = await store.getScore(companyId);
    expect(score!.transformation_breakdown.find((b) => b.key === 'design_era')!.detail).not.toContain('not measured');
  });

  it('produces the same findings on a re-run', async () => {
    const store = new MemoryStore();
    const { campaignId, company } = await seedLiveCompany(store);
    const options = {
      store,
      providers: providers(stubVision()),
      campaignId,
      companyId: company.id,
      demo: true,
    };

    await runCompanyPipeline(options);
    const first = (await store.listFindings(company.id)).map((f) => f.title).sort();
    await runCompanyPipeline(options);
    const second = (await store.listFindings(company.id)).map((f) => f.title).sort();

    expect(second).toEqual(first);
  });
});
