/**
 * Sector playbooks.
 *
 * The sector website-importance score is a business judgement about a market, not a
 * per-company opinion — so it lives in an approved, versioned playbook rather than
 * being re-invented by the model for every row. The AI may propose a new playbook, but
 * it lands as `ai_suggested_unapproved` and does not influence scoring until a human
 * approves it.
 */

import type { BusinessModel, SectorPlaybook } from './types';

export type SeedPlaybook = Omit<SectorPlaybook, 'id' | 'created_at' | 'updated_at'>;

export const SEED_PLAYBOOKS: SeedPlaybook[] = [
  {
    sector: 'Healthcare',
    sub_sector: 'Appointment-driven clinic',
    business_model: 'b2c_appointment',
    website_importance_score: 88,
    expected_website_role: 'appointment_booking',
    essential_pages: ['Home', 'About', 'Services', 'Contact'],
    essential_conversion_actions: ['Online booking', 'Click-to-call', 'WhatsApp', 'Contact form'],
    essential_trust_signals: ['Reviews', 'Testimonials', 'Certifications', 'Contact details'],
    common_customer_journey:
      'A patient searches for a treatment or a nearby clinic on a phone, compares two or three clinics on credentials and reviews, then books the one that makes booking immediate — a call button, a WhatsApp thread or an online slot picker.',
    weak_website_signals: [
      'No way to book without phoning during office hours',
      'No practitioner credentials or licence numbers shown',
      'Contact details buried below the fold or in an image',
      'Service pages that describe procedures but never invite a booking',
    ],
    rebuild_conditions: [
      'No mobile layout at all, or a desktop-only site on a mobile-first patient journey',
      'No booking or contact path anywhere on the site',
      'Information architecture that hides services behind a generic "our clinic" page',
    ],
    targeted_improvement_conditions: [
      'The site is sound but booking is missing on service pages',
      'Reviews and credentials exist but are not visible on the pages patients land on',
    ],
    competitor_signals: ['Online booking', 'WhatsApp', 'Click-to-call', 'Reviews', 'Practitioner bios'],
    outreach_angles: [
      'Patients who cannot book in the moment book somewhere else',
      'Competitors in the same city let patients book without a phone call',
      'Credentials and reviews are the deciding factor and are currently invisible',
    ],
    version: 1,
    approval_status: 'approved',
  },
  {
    sector: 'Retail',
    sub_sector: 'E-commerce brand',
    business_model: 'b2c_ecommerce',
    website_importance_score: 96,
    expected_website_role: 'ecommerce_transaction',
    essential_pages: ['Home', 'Products', 'About', 'Contact'],
    essential_conversion_actions: ['Checkout', 'Add to cart', 'Pricing', 'Contact form'],
    essential_trust_signals: ['Reviews', 'Testimonials', 'Contact details', 'Certifications'],
    common_customer_journey:
      'A shopper arrives from search, social or an ad, browses a category, checks price, delivery and returns, reads reviews, and completes the purchase in the same session — almost always on a phone.',
    weak_website_signals: [
      'Products displayed as a catalogue with no way to buy',
      'No prices shown',
      'No reviews or ratings on product pages',
      'Checkout that requires account creation before the cart is visible',
      'No analytics or advertising pixel, so no campaign can be measured',
    ],
    rebuild_conditions: [
      'The site is a brochure rather than a store: no cart, no checkout',
      'The catalogue cannot be browsed on a phone',
      'The platform cannot support payment or delivery options the market expects',
    ],
    targeted_improvement_conditions: [
      'Checkout works but product pages lack reviews, delivery terms or clear pricing',
      'Tracking is missing so paid campaigns cannot be attributed',
    ],
    competitor_signals: ['Checkout', 'Pricing', 'Reviews', 'Delivery terms', 'Meta Pixel', 'GA4'],
    outreach_angles: [
      'Catalogue without checkout sends buyers to competitors who sell online',
      'Competitors show prices and reviews at the point of decision',
      'Untracked traffic means ad spend cannot be judged',
    ],
    version: 1,
    approval_status: 'approved',
  },
  {
    sector: 'Professional Services',
    sub_sector: 'B2B professional service',
    business_model: 'b2b_services',
    website_importance_score: 74,
    expected_website_role: 'lead_generation',
    essential_pages: ['Home', 'Services', 'About', 'Contact'],
    essential_conversion_actions: ['Contact form', 'Quote request', 'Click-to-call'],
    essential_trust_signals: ['Case studies', 'Client logos', 'Testimonials', 'Certifications', 'Contact details'],
    common_customer_journey:
      'A buyer is referred or finds the firm in search, then uses the website to verify that the firm is real, credible and has handled comparable work, before making contact through a form, a call or email.',
    weak_website_signals: [
      'No description of what the firm actually does, only abstract language',
      'No proof of past work: no case studies, clients or named results',
      'A single generic contact form as the only path',
      'Content that has obviously not been updated in years',
    ],
    rebuild_conditions: [
      'Services cannot be understood from the site',
      'No credibility evidence exists anywhere on the site',
      'The structure forces every visitor through one undifferentiated page',
    ],
    targeted_improvement_conditions: [
      'Positioning is clear but proof is thin',
      'Service pages exist but do not invite a next step',
    ],
    competitor_signals: ['Case studies', 'Client logos', 'Service landing pages', 'Contact form', 'Team page'],
    outreach_angles: [
      'Buyers use the site to verify credibility before they call',
      'Competitors publish case studies that answer "have you done this before"',
      'Service pages that do not ask for a next step lose warm referral traffic',
    ],
    version: 1,
    approval_status: 'approved',
  },
  {
    sector: 'Manufacturing',
    sub_sector: 'Building materials manufacturer',
    business_model: 'b2b_manufacturing',
    website_importance_score: 68,
    expected_website_role: 'request_for_quotation',
    essential_pages: ['Home', 'Products', 'About', 'Contact'],
    essential_conversion_actions: ['Quote request', 'Contact form', 'WhatsApp', 'Click-to-call'],
    essential_trust_signals: ['Certifications', 'Case studies', 'Client logos', 'Contact details'],
    common_customer_journey:
      'A contractor, architect or distributor shortlists suppliers by browsing product ranges and finished projects, checks certifications and capacity, then requests a quotation for a specific specification.',
    weak_website_signals: [
      'Product range shown as a few photos with no specifications',
      'No quotation path — only a generic email address',
      'No finished project references',
      'No certifications or capacity information',
    ],
    rebuild_conditions: [
      'The product range cannot be browsed at all',
      'No quotation or enquiry mechanism exists',
      'The site does not work on mobile, where site visits are specified',
    ],
    targeted_improvement_conditions: [
      'Products are catalogued but the quote request is missing or hidden',
      'Projects exist but are not presented as references',
    ],
    competitor_signals: ['Quote request', 'Product specifications', 'Project gallery', 'Certifications', 'WhatsApp'],
    outreach_angles: [
      'Specifiers shortlist from the website before they contact anyone',
      'Competitors let buyers request a quotation against a specific product',
      'Certifications decide tender eligibility and are currently absent',
    ],
    version: 1,
    approval_status: 'approved',
  },
  {
    sector: 'Hospitality',
    sub_sector: 'Restaurant and local dining',
    business_model: 'b2c_services',
    website_importance_score: 62,
    expected_website_role: 'local_footfall_support',
    essential_pages: ['Home', 'Contact'],
    essential_conversion_actions: ['Click-to-call', 'WhatsApp', 'Online booking'],
    essential_trust_signals: ['Reviews', 'Contact details'],
    common_customer_journey:
      'A diner discovers the venue on a map or social feed and uses the website mainly to confirm location, opening hours, menu and price level, then calls, books or simply walks in.',
    weak_website_signals: [
      'No menu or an out-of-date menu',
      'No opening hours or address',
      'Menu published only as a heavy PDF',
      'No phone number that can be tapped on a phone',
    ],
    rebuild_conditions: [
      'The site gives none of the four things a diner needs: location, hours, menu, contact',
      'The site is unusable on a phone',
    ],
    targeted_improvement_conditions: [
      'Basics are present but the menu is a PDF or the phone number is not tappable',
    ],
    competitor_signals: ['Menu', 'Click-to-call', 'Reviews', 'Online booking', 'Delivery links'],
    outreach_angles: [
      'Diners check the menu and hours on a phone minutes before deciding',
      'Competitors make the phone number tappable and the menu readable on mobile',
    ],
    version: 1,
    approval_status: 'approved',
  },
  {
    sector: 'Technology',
    sub_sector: 'B2B SaaS',
    business_model: 'b2b_saas',
    website_importance_score: 92,
    expected_website_role: 'demo_request',
    essential_pages: ['Home', 'Products', 'Pricing', 'About', 'Contact'],
    essential_conversion_actions: ['Demo request', 'Pricing', 'Contact form'],
    essential_trust_signals: ['Case studies', 'Client logos', 'Testimonials'],
    common_customer_journey:
      'A buyer evaluating tools compares three or four vendors entirely on their websites — what the product does, who else uses it, what it costs — and only speaks to a vendor after the site has qualified it.',
    weak_website_signals: [
      'What the product does cannot be understood in one screen',
      'No pricing or pricing guidance of any kind',
      'No customer proof',
      'No demo or trial path',
    ],
    rebuild_conditions: [
      'The product proposition is not communicated at all',
      'No conversion path to a demo or trial exists',
    ],
    targeted_improvement_conditions: [
      'The proposition is clear but pricing guidance and proof are missing',
    ],
    competitor_signals: ['Demo request', 'Pricing', 'Case studies', 'Product pages', 'Free trial'],
    outreach_angles: [
      'Buyers shortlist vendors from the website before any sales contact',
      'Competitors publish pricing guidance and customer proof',
    ],
    version: 1,
    approval_status: 'approved',
  },
];

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Match a detected sector/sub-sector/business model to an approved playbook.
 * Returns null rather than a near-miss: an unmatched company is flagged for review.
 */
export function matchPlaybook(
  playbooks: SectorPlaybook[],
  detected: { sector: string | null; sub_sector: string | null; business_model: BusinessModel | null },
): SectorPlaybook | null {
  const approved = playbooks.filter((p) => p.approval_status === 'approved');
  if (approved.length === 0) return null;

  const sub = detected.sub_sector ? norm(detected.sub_sector) : null;
  const sector = detected.sector ? norm(detected.sector) : null;
  const model = detected.business_model;

  // 1. Exact sub-sector + business model.
  const exact = approved.find((p) => sub && norm(p.sub_sector) === sub && p.business_model === model);
  if (exact) return exact;

  // 2. Sub-sector match on its own.
  const bySub = approved.find((p) => sub && norm(p.sub_sector) === sub);
  if (bySub) return bySub;

  // 3. Business model plus sector.
  const byModelSector = approved.find((p) => sector && norm(p.sector) === sector && p.business_model === model);
  if (byModelSector) return byModelSector;

  // 4. Business model alone — the strongest remaining structural signal.
  const byModel = approved.find((p) => model && p.business_model === model);
  if (byModel) return byModel;

  return null;
}
