import { describe, expect, it } from 'vitest';
import { summarizeCompetitorUsage, type CompetitorAnalysis } from '@/core/competitor-scoring';

const strong = (name: string): CompetitorAnalysis => ({
  name,
  website: `https://${name}.com`,
  status: 'live',
  signals: {
    contact_form: true,
    booking_link: true,
    quote_request: true,
    demo_request: true,
    checkout_or_cart: true,
    pricing: true,
    landing_pages: true,
    lead_magnet: true,
    whatsapp_link: true,
    click_to_call: true,
    live_chat: true,
    value_proposition: true,
    case_studies: true,
    testimonials: true,
    reviews: true,
    client_logos: true,
    updated_content: true,
  },
  evidence: [`${name}: booking present`],
});

const bare = (name: string): CompetitorAnalysis => ({
  name,
  website: `https://${name}.com`,
  status: 'live',
  signals: Object.fromEntries(Object.keys(strong('x').signals).map((k) => [k, false])),
  evidence: [],
});

describe('summarizeCompetitorUsage', () => {
  it('returns an unmeasured summary when there are no competitors', () => {
    const result = summarizeCompetitorUsage([], null);
    expect(result.score).toBeNull();
    expect(result.measured).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.limitations[0]).toMatch(/no competitor/i);
  });

  it('scores competitors that work their websites hard near the top', () => {
    const result = summarizeCompetitorUsage([strong('a'), strong('b'), strong('c')], null);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.measured).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.active_website_adoption_rate).toBe(1);
  });

  it('scores competitors that merely own a website near the bottom', () => {
    const result = summarizeCompetitorUsage([bare('a'), bare('b'), bare('c')], null);
    // Every site is live, so adoption is full — but nothing else is, which is the
    // distinction the product cares about.
    expect(result.active_website_adoption_rate).toBe(1);
    expect(result.conversion_feature_adoption_rate).toBe(0);
    expect(result.score).toBeLessThan(35);
  });

  it('excludes unreadable competitors from the rates and reports the limitation', () => {
    const blocked: CompetitorAnalysis = {
      name: 'blocked',
      website: 'https://blocked.com',
      status: 'bot_protection',
      signals: {},
      evidence: [],
    };
    const result = summarizeCompetitorUsage([strong('a'), strong('b'), blocked], null);
    expect(result.readable_count).toBe(2);
    expect(result.limitations.join(' ')).toMatch(/could not be read/i);
    // Two strong readable competitors still produce a high score.
    expect(result.score).toBeGreaterThan(80);
  });

  it('counts a competitor with no website against adoption, not against the feature rates', () => {
    const dead: CompetitorAnalysis = {
      name: 'dead',
      website: 'https://dead.com',
      status: 'parked_domain',
      signals: {},
      evidence: [],
    };
    const result = summarizeCompetitorUsage([strong('a'), strong('b'), dead], null);
    expect(result.active_website_adoption_rate).toBeCloseTo(2 / 3, 5);
    expect(result.conversion_feature_adoption_rate).toBe(1);
  });

  it('lowers confidence and states the limitation with fewer than three competitors', () => {
    const result = summarizeCompetitorUsage([strong('a')], null);
    expect(result.confidence).toBe('low');
    expect(result.limitations.join(' ')).toMatch(/Only 1 valid competitor/i);
  });

  it('reports gaps only where competitors share the pattern and the company lacks it', () => {
    const companySignals = { booking_link: false, checkout_or_cart: true, live_chat: false };
    const result = summarizeCompetitorUsage([strong('a'), strong('b'), strong('c')], companySignals);
    expect(result.gaps_vs_company.join(' ')).toMatch(/booking/i);
    expect(result.gaps_vs_company.join(' ')).not.toMatch(/checkout/i);
  });

  it('narrows the comparison to sector-relevant signals when a playbook supplies them', () => {
    // A clinic's competitors should not be judged on shopping carts.
    const clinicCompetitor: CompetitorAnalysis = {
      name: 'clinic',
      website: 'https://clinic.com',
      status: 'live',
      signals: {
        booking_link: true,
        contact_form: true,
        landing_pages: true,
        checkout_or_cart: false,
        quote_request: false,
        demo_request: false,
        pricing: false,
        lead_magnet: false,
        value_proposition: true,
        reviews: true,
        testimonials: true,
      },
      evidence: [],
    };
    const competitors = [clinicCompetitor, { ...clinicCompetitor, name: 'clinic2' }, { ...clinicCompetitor, name: 'clinic3' }];

    const universal = summarizeCompetitorUsage(competitors, null);
    const sectorAware = summarizeCompetitorUsage(competitors, null, {
      conversion: ['booking_link', 'contact_form', 'landing_pages'],
      content: ['value_proposition', 'reviews', 'testimonials'],
    });

    expect(sectorAware.score!).toBeGreaterThan(universal.score!);
    expect(sectorAware.conversion_feature_adoption_rate).toBe(1);
  });

  it('keeps every rate inside 0–1 and the score inside 0–100', () => {
    const result = summarizeCompetitorUsage([strong('a'), bare('b')], null);
    for (const rate of [
      result.active_website_adoption_rate,
      result.conversion_feature_adoption_rate,
      result.communication_feature_rate,
      result.content_trust_rate,
    ]) {
      if (rate != null) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
  });
});
