/**
 * Turning measurements into findings.
 *
 * These findings are the *measured* half of the report: each one restates something the
 * deterministic audit observed, with the check that produced it as its source. The AI
 * layer contributes interpretation separately, and the two are never merged into an
 * undifferentiated list — the report labels each by `measurement_source`.
 */

import type { TechnicalAudit } from './audit-checks';
import type { SectorPlaybook, WebsiteFinding, WebsiteStatus } from './types';
import { DESIGN_ERA_LABELS, type VisualAssessment, type VisualComparison } from './visual-schemas';
import { WEBSITE_STATUS_LABELS, isMeasurementBlocked, isMissingWebsite } from './website-status';

export type NewFinding = Omit<WebsiteFinding, 'id' | 'company_id'>;

const nowIso = () => new Date().toISOString();

/** Findings derived from the website status alone, before any page is read. */
export function statusFindings(status: WebsiteStatus, reason: string, evidence: string[]): NewFinding[] {
  const label = WEBSITE_STATUS_LABELS[status];

  if (isMissingWebsite(status)) {
    return [
      {
        title: `No working website (${label})`,
        category: 'availability',
        severity: 'critical',
        page_url: null,
        evidence: evidence.join(' | ') || reason,
        measurement_source: 'http_check',
        business_impact:
          'Customers searching for this company find nothing they can evaluate, and every other channel loses the place it would normally send people.',
        recommended_action: 'Build a website covering the core journey expected in this sector.',
        confidence: 'high',
        suitable_for_outreach: true,
        created_at: nowIso(),
      },
    ];
  }

  if (isMeasurementBlocked(status)) {
    return [
      {
        title: `Website could not be read (${label})`,
        category: 'availability',
        severity: 'info',
        page_url: null,
        evidence: evidence.join(' | ') || reason,
        measurement_source: 'http_check',
        business_impact:
          'This is a limitation of our automated check, not a fault of the website. Nothing about the site quality can be concluded from it.',
        recommended_action: 'Open the site manually before deciding whether there is an opportunity here.',
        confidence: 'high',
        suitable_for_outreach: false,
        created_at: nowIso(),
      },
    ];
  }

  if (status === 'ssl_failure') {
    return [
      {
        title: 'HTTPS certificate is invalid or missing',
        category: 'technical',
        severity: 'critical',
        page_url: null,
        evidence: evidence.join(' | ') || reason,
        measurement_source: 'http_check',
        business_impact:
          'Browsers show a full-page security warning before the site loads, which stops the large majority of visitors.',
        recommended_action: 'Install and auto-renew a valid TLS certificate, then force HTTPS.',
        confidence: 'high',
        suitable_for_outreach: true,
        created_at: nowIso(),
      },
    ];
  }

  if (status === 'partially_broken') {
    return [
      {
        title: 'Homepage returns an error',
        category: 'availability',
        severity: 'critical',
        page_url: null,
        evidence: evidence.join(' | ') || reason,
        measurement_source: 'http_check',
        business_impact: 'Anyone typing the domain or clicking a search result lands on an error page.',
        recommended_action: 'Restore the homepage and verify the root URL responds with 200.',
        confidence: 'high',
        suitable_for_outreach: true,
        created_at: nowIso(),
      },
    ];
  }

  return [];
}

interface DetectionLike {
  present: boolean | null;
  evidence: string[];
}

/** Findings derived from the deterministic page audit. */
export function auditFindings(audit: TechnicalAudit, playbook: SectorPlaybook | null): NewFinding[] {
  const out: NewFinding[] = [];
  const det = (k: keyof TechnicalAudit) => audit[k] as DetectionLike;

  const add = (f: Omit<NewFinding, 'created_at'>) => out.push({ ...f, created_at: nowIso() });

  const viewport = det('mobile_viewport');
  if (viewport.present === false) {
    add({
      title: 'No mobile viewport tag',
      category: 'mobile',
      severity: 'high',
      page_url: null,
      evidence: viewport.evidence.join(' | '),
      measurement_source: 'dom_parse',
      business_impact:
        'Without a viewport tag phones render the desktop layout scaled down, so text and buttons are too small to use.',
      recommended_action: 'Add a responsive viewport meta tag and verify the layout on a phone.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  const ps = audit.pagespeed_mobile;
  if (ps?.fetched && ps.performance_score != null && ps.performance_score < 50) {
    add({
      title: `Mobile performance score of ${ps.performance_score}/100`,
      category: 'performance',
      severity: ps.performance_score < 30 ? 'critical' : 'high',
      page_url: null,
      evidence: `PageSpeed Insights mobile performance: ${ps.performance_score}/100${ps.lcp_ms != null ? `, largest contentful paint ${(ps.lcp_ms / 1000).toFixed(1)}s` : ''}.`,
      measurement_source: 'pagespeed',
      business_impact: 'Slow mobile pages lose a meaningful share of visitors before the content appears.',
      recommended_action: 'Compress and lazy-load images, and remove render-blocking scripts.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  const https = det('https');
  if (https.present === false) {
    add({
      title: 'Site is not served over HTTPS',
      category: 'technical',
      severity: 'high',
      page_url: null,
      evidence: https.evidence.join(' | '),
      measurement_source: 'http_check',
      business_impact: 'Browsers mark the site "not secure", which undermines trust and suppresses search visibility.',
      recommended_action: 'Install a certificate and redirect all HTTP traffic to HTTPS.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  const broken = det('broken_internal_links');
  if (broken.present === true) {
    add({
      title: 'Broken internal links',
      category: 'technical',
      severity: 'medium',
      page_url: null,
      evidence: broken.evidence.join(' | '),
      measurement_source: 'http_check',
      business_impact: 'Visitors following the site’s own navigation reach error pages.',
      recommended_action: 'Fix or redirect the broken URLs.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  const pages = det('important_pages');
  if (pages.present === false) {
    add({
      title: 'Key pages are missing',
      category: 'information_architecture',
      severity: 'medium',
      page_url: null,
      evidence: pages.evidence.join(' | '),
      measurement_source: 'http_check',
      business_impact: 'Visitors cannot find the information they came for, so they leave to look elsewhere.',
      recommended_action: 'Publish the missing pages and link them from the main navigation.',
      confidence: 'medium',
      suitable_for_outreach: true,
    });
  }

  const seoMissing: string[] = [];
  if (det('page_title').present === false) seoMissing.push('page title');
  if (det('meta_description').present === false) seoMissing.push('meta description');
  if (det('h1').present === false) seoMissing.push('H1 heading');
  if (det('canonical').present === false) seoMissing.push('canonical tag');
  if (det('sitemap').present === false) seoMissing.push('sitemap');
  if (seoMissing.length > 0) {
    add({
      title: `Missing SEO basics: ${seoMissing.join(', ')}`,
      category: 'seo',
      severity: seoMissing.length >= 3 ? 'medium' : 'low',
      page_url: null,
      evidence: `Homepage audit found no ${seoMissing.join(', no ')}.`,
      measurement_source: 'dom_parse',
      business_impact: 'Search engines cannot describe the pages accurately, which costs click-through on brand searches.',
      recommended_action: 'Add unique titles, descriptions, one H1 per page and a sitemap.',
      confidence: 'high',
      suitable_for_outreach: seoMissing.length >= 3,
    });
  }

  if (det('robots_blocks_indexing').present === true) {
    add({
      title: 'Site blocks search engine indexing',
      category: 'seo',
      severity: 'critical',
      page_url: null,
      evidence: det('robots_blocks_indexing').evidence.join(' | '),
      measurement_source: 'dom_parse',
      business_impact: 'The site is excluded from search results entirely.',
      recommended_action: 'Remove the noindex directive or the blanket Disallow rule.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  const trackingKeys: Array<keyof TechnicalAudit> = ['ga4', 'gtm', 'meta_pixel', 'other_tracking'];
  const trackingMeasured = trackingKeys.some((k) => det(k).present != null);
  const trackingPresent = trackingKeys.some((k) => det(k).present === true);
  if (trackingMeasured && !trackingPresent) {
    add({
      title: 'No analytics or advertising tag installed',
      category: 'tracking',
      severity: 'medium',
      page_url: null,
      evidence: 'No GA4, Google Tag Manager, Meta Pixel or comparable tag was found in the page source.',
      measurement_source: 'dom_parse',
      business_impact: 'Nothing on the site can be measured, so marketing spend cannot be attributed to enquiries.',
      recommended_action: 'Install GA4 with conversion events on every enquiry path.',
      confidence: 'high',
      suitable_for_outreach: false,
    });
  }

  // Accessibility comes free with the PageSpeed call and is a real commercial risk in
  // several of these markets, not just a nicety.
  const a11y = audit.pagespeed_mobile?.fetched ? audit.pagespeed_mobile.accessibility_score : null;
  if (a11y != null && a11y < 70) {
    add({
      title: `Accessibility score of ${a11y}/100`,
      category: 'technical',
      severity: a11y < 50 ? 'high' : 'medium',
      page_url: null,
      evidence: `Lighthouse accessibility audit scored ${a11y}/100 on the homepage.`,
      measurement_source: 'pagespeed',
      business_impact:
        'Visitors using a screen reader, keyboard navigation or larger text hit barriers, and the same faults usually make the page harder for everyone.',
      recommended_action: 'Fix colour contrast, form labels and focus order first — they carry most of the score.',
      confidence: 'high',
      suitable_for_outreach: a11y < 50,
    });
  }

  // A site that has not changed in years is a rebuild conversation regardless of how it
  // scores technically — and the prospect can verify the claim themselves.
  const archive = audit.archive;
  if (archive?.fetched && archive.months_since_change != null && archive.months_since_change >= 24) {
    const years = Math.floor(archive.months_since_change / 12);
    add({
      title: `Website has not changed in about ${years} year${years === 1 ? '' : 's'}`,
      category: 'content',
      severity: archive.months_since_change >= 60 ? 'high' : 'medium',
      page_url: null,
      evidence: `Wayback Machine captures show the homepage content last changed around ${archive.last_content_change?.slice(0, 7) ?? 'an unknown date'}, across ${archive.snapshot_count} archived snapshot(s).`,
      measurement_source: 'http_check',
      business_impact:
        'A site frozen for years signals to visitors that the business may be inactive, and it cannot reflect anything the company has done since.',
      recommended_action: 'Refresh the homepage message and the proof around it, then keep a light publishing rhythm.',
      confidence: 'medium',
      suitable_for_outreach: true,
    });
  }

  // The stack itself dates a site, sometimes more visibly than the design does.
  if (audit.platform.dated_markers.length > 0) {
    add({
      title: `Built on a dated front-end stack (${audit.platform.dated_markers.join(', ')})`,
      category: 'technical',
      severity: audit.platform.dated_markers.length >= 3 ? 'high' : 'medium',
      page_url: null,
      evidence: audit.platform.evidence.join(' | '),
      measurement_source: 'dom_parse',
      business_impact:
        'Libraries of this age stopped receiving security fixes long ago, and they constrain what can be built on top without a rebuild.',
      recommended_action: 'Rebuild the front end on a current stack rather than patching around these.',
      confidence: 'high',
      suitable_for_outreach: true,
    });
  }

  // Not a fault — context. A site builder bounds what any rebuild can achieve.
  if (audit.platform.is_website_builder && audit.platform.platform) {
    add({
      title: `Built on ${audit.platform.platform}`,
      category: 'technical',
      severity: 'info',
      page_url: null,
      evidence: audit.platform.evidence[0] ?? `${audit.platform.platform} fingerprint found in the page source.`,
      measurement_source: 'dom_parse',
      business_impact:
        'A hosted site builder caps how far the site can be taken — worth knowing before scoping any rebuild.',
      recommended_action: 'Confirm what the current plan allows before proposing structural work.',
      confidence: 'high',
      suitable_for_outreach: false,
    });
  }

  // Playbook-driven conversion gaps: what this specific sector expects and is missing.
  if (playbook) {
    const map: Record<string, keyof TechnicalAudit> = {
      'online booking': 'booking_link',
      booking: 'booking_link',
      'appointment booking': 'booking_link',
      'contact form': 'contact_form',
      'quote request': 'quote_request',
      'demo request': 'demo_request',
      whatsapp: 'whatsapp_link',
      'click-to-call': 'click_to_call',
      'live chat': 'live_chat',
      checkout: 'checkout_or_cart',
      'add to cart': 'checkout_or_cart',
      pricing: 'pricing',
    };
    for (const action of playbook.essential_conversion_actions) {
      const key = map[action.trim().toLowerCase()];
      if (!key) continue;
      const d = det(key);
      if (d.present !== false) continue;
      add({
        title: `No ${action.toLowerCase()} on the site`,
        category: 'conversion',
        severity: 'high',
        page_url: null,
        evidence: d.evidence.join(' | '),
        measurement_source: 'dom_parse',
        business_impact: `${action} is one of the actions ${playbook.sub_sector.toLowerCase()} customers expect to complete on the website; without it the visit cannot convert.`,
        recommended_action: `Add ${action.toLowerCase()} to the homepage and to each service or product page.`,
        confidence: 'high',
        suitable_for_outreach: true,
      });
    }
  }

  return out;
}

/**
 * Findings from the visual pass.
 *
 * Every one of these is an opinion about a picture, so they all carry
 * `measurement_source: 'ai_interpretation'` and the evidence text says what was seen on
 * screen. The report keeps them in the interpretation column, next to the screenshot they
 * were drawn from, so a reviewer can disagree by looking.
 */
export function visualFindings(assessment: VisualAssessment): NewFinding[] {
  const out: NewFinding[] = [];
  const add = (f: Omit<NewFinding, 'created_at'>) => out.push({ ...f, created_at: nowIso() });

  for (const f of assessment.findings) {
    add({
      title: f.title,
      category: 'visual_design',
      severity: f.severity,
      page_url: null,
      evidence: `Seen in the rendered screenshot: ${f.observed}`,
      measurement_source: 'ai_interpretation',
      business_impact: f.business_impact,
      recommended_action: f.recommended_action,
      confidence: assessment.confidence,
      suitable_for_outreach: f.suitable_for_outreach,
    });
  }

  // A dated look is the single most quotable thing in this whole pass, and the only one
  // the prospect can verify in two seconds — but only when the model was willing to call
  // it, and only as a range.
  const dated = ['dated_2015_2019', 'dated_2010_2014', 'pre_2010'].includes(assessment.design_era);
  if (dated && assessment.design_era_confidence !== 'low') {
    add({
      title: `The design looks dated — ${DESIGN_ERA_LABELS[assessment.design_era].toLowerCase()}`,
      category: 'visual_design',
      severity: assessment.design_era === 'pre_2010' ? 'high' : 'medium',
      page_url: null,
      evidence: `Visual cues in the screenshot: ${assessment.design_era_evidence.join('; ')}.`,
      measurement_source: 'ai_interpretation',
      business_impact:
        'A visitor forms a view of the business in the first seconds, and a site that looks a decade old reads as a business that has stopped investing.',
      recommended_action:
        'Rebuild the front end on a current visual system rather than restyling the existing one piece by piece.',
      confidence: assessment.design_era_confidence,
      suitable_for_outreach: true,
    });
  }

  if (!assessment.purpose_clear_above_fold) {
    add({
      title: 'The first screen does not say what the business does',
      category: 'visual_design',
      severity: 'high',
      page_url: null,
      evidence: `Above the fold, nothing states the offer plainly. ${assessment.summary}`,
      measurement_source: 'ai_interpretation',
      business_impact:
        'Visitors arriving from search or an ad decide whether to stay before they scroll; if the first screen does not answer "what is this", most leave.',
      recommended_action: 'Put a plain one-line statement of the offer, and who it is for, at the top of the homepage.',
      confidence: assessment.confidence,
      suitable_for_outreach: true,
    });
  }

  if (!assessment.primary_action_visible) {
    add({
      title: 'No clear next step on the first screen',
      category: 'visual_design',
      severity: 'high',
      page_url: null,
      evidence: 'No primary call to action is visible in the above-the-fold screenshot.',
      measurement_source: 'ai_interpretation',
      business_impact:
        'A visitor who is ready to act has to hunt for how, and a proportion of them simply will not.',
      recommended_action: 'Give the page one obvious primary action, visible without scrolling on a phone.',
      confidence: assessment.confidence,
      suitable_for_outreach: true,
    });
  }

  return out;
}

/**
 * The side-by-side verdict, as a finding.
 *
 * Only raised when the company comes off worse: "you look the same as your competitors"
 * is not something to open a conversation with, and "you look better" is not our news to
 * deliver. A `cannot_tell` produces nothing at all.
 */
export function visualComparisonFindings(comparison: VisualComparison, competitorNames: string[]): NewFinding[] {
  if (comparison.company_stands_out_as !== 'clearly_worse') return [];

  return [
    {
      title: 'The site looks dated next to its competitors',
      category: 'visual_design',
      severity: 'high',
      page_url: null,
      evidence:
        `Compared side by side with ${competitorNames.join(', ')}: ${comparison.gap_summary}` +
        (comparison.visible_differences.length > 0
          ? ` Visible differences: ${comparison.visible_differences.join('; ')}.`
          : ''),
      measurement_source: 'ai_interpretation',
      business_impact:
        'Buyers in this market compare two or three sites in the same session, and the one that looks least current loses the enquiry before anyone reads the copy.',
      recommended_action:
        'Rebuild the front end to at least the standard the competitors already hold, starting with the first screen.',
      confidence: comparison.confidence,
      suitable_for_outreach: true,
      created_at: nowIso(),
    },
  ];
}
