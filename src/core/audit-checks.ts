/**
 * Deterministic website checks.
 *
 * Everything in this file is a *measurement*: it reports only what is present in the
 * HTML/headers we actually fetched. No inference, no scoring, no language about
 * business impact — that is the AI interpretation layer's job, and keeping the two
 * apart is what lets the UI label a claim "measured" and an outreach email cite it.
 *
 * When we did not fetch something, the detection is `null` with a reason. It is never
 * silently reported as absent.
 */

import type { MeasurementSource, NotMeasured } from './types';

export interface ScrapedPage {
  url: string;
  page_type: string;
  status_code: number | null;
  html: string;
  text: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
}

export interface ScrapedSite {
  final_url: string | null;
  pages: ScrapedPage[];
  robots_txt: string | null;
  sitemap_url: string | null;
  headers: Record<string, string>;
  screenshot_mobile_url: string | null;
  screenshot_desktop_url: string | null;
}

export interface PageSpeedResult {
  strategy: 'mobile' | 'desktop';
  performance_score: number | null;
  /**
   * Lighthouse returns accessibility, SEO and best-practices in the same response as
   * performance, at no extra quota cost. Asking only for performance threw away three
   * useful measurements on every call we were already paying for.
   */
  accessibility_score: number | null;
  seo_score: number | null;
  best_practices_score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  fetched: boolean;
  error?: string | null;
}

/**
 * What the site is built on, and how dated that stack looks.
 * Read straight from markup we already downloaded, so it costs nothing extra — and it
 * answers the first question any rebuild conversation runs into: what is this thing?
 */
export interface PlatformDetection {
  /** e.g. 'WordPress', 'Shopify', 'Wix'. Null when nothing identifiable was found. */
  platform: string | null;
  /** Site builders that cap what a rebuild can do. */
  is_website_builder: boolean;
  /** Markers of a stack that has not been touched in roughly a decade. */
  dated_markers: string[];
  evidence: string[];
}

/** How long the site has looked the way it looks now, via the Wayback Machine. */
export interface ArchiveHistory {
  fetched: boolean;
  first_seen: string | null;
  last_seen: string | null;
  /** Last capture whose content hash differed from the one before it. */
  last_content_change: string | null;
  /** Whole months since that change, or null when it could not be established. */
  months_since_change: number | null;
  snapshot_count: number;
  error?: string | null;
}

export interface Detection {
  present: boolean | null;
  /** Set only when `present` is null — explains why we could not measure. */
  not_measured?: NotMeasured;
  evidence: string[];
  source: MeasurementSource;
}

export interface TechnicalAudit {
  https: Detection;
  redirects_to_https: Detection;
  mobile_viewport: Detection;
  responsive_css: Detection;
  page_title: Detection;
  meta_description: Detection;
  h1: Detection;
  canonical: Detection;
  robots_txt: Detection;
  robots_blocks_indexing: Detection;
  sitemap: Detection;
  broken_internal_links: Detection;
  important_pages: Detection;
  contact_form: Detection;
  booking_link: Detection;
  quote_request: Detection;
  demo_request: Detection;
  whatsapp_link: Detection;
  click_to_call: Detection;
  live_chat: Detection;
  checkout_or_cart: Detection;
  pricing: Detection;
  testimonials: Detection;
  reviews: Detection;
  case_studies: Detection;
  client_logos: Detection;
  certifications: Detection;
  contact_details: Detection;
  ga4: Detection;
  gtm: Detection;
  meta_pixel: Detection;
  other_tracking: Detection;
  screenshot_mobile: Detection;
  screenshot_desktop: Detection;
  pagespeed_mobile: PageSpeedResult | null;
  pagespeed_desktop: PageSpeedResult | null;
  /** Pages we found but could not load, used for the broken-link measurement. */
  failed_pages: string[];
  /** Page types actually crawled, consumed by the essential-pages score item. */
  found_page_types: string[];
  platform: PlatformDetection;
  archive: ArchiveHistory | null;
}

const notMeasured = (reason: NotMeasured, why: string): Detection => ({
  present: null,
  not_measured: reason,
  evidence: [why],
  source: 'dom_parse',
});

const hit = (present: boolean, evidence: string[], source: MeasurementSource = 'dom_parse'): Detection => ({
  present,
  evidence: evidence.slice(0, 4),
  source,
});

/** Collect short, quotable proof snippets around each regex match. */
function findMatches(haystack: string, patterns: RegExp[], limit = 3): string[] {
  const out: string[] = [];
  for (const re of patterns) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = global.exec(haystack)) !== null && out.length < limit) {
      const start = Math.max(0, m.index - 30);
      out.push(haystack.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ').trim());
      if (m[0].length === 0) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

function detectAcrossSite(
  site: ScrapedSite,
  patterns: RegExp[],
  label: string,
  useText = false,
): Detection {
  const evidence: string[] = [];
  for (const page of site.pages) {
    const haystack = useText ? page.text : page.html;
    const matches = findMatches(haystack, patterns, 2);
    if (matches.length > 0) {
      evidence.push(`${page.url} — ${matches[0]}`);
      if (evidence.length >= 3) break;
    }
  }
  return hit(evidence.length > 0, evidence.length > 0 ? evidence : [`no ${label} markup found on ${site.pages.length} crawled page(s)`]);
}

const HOME_PAGE_TYPES = ['home', 'homepage'];

function homepage(site: ScrapedSite): ScrapedPage | null {
  return site.pages.find((p) => HOME_PAGE_TYPES.includes(p.page_type)) ?? site.pages[0] ?? null;
}

export const IMPORTANT_PAGE_TYPES = [
  'about',
  'contact',
  'services',
  'products',
  'pricing',
  'blog',
] as const;

/**
 * Platform fingerprints, ordered most specific first.
 * `builder` marks hosted site builders — worth flagging separately because they bound
 * what a rebuild can actually change.
 */
const PLATFORM_SIGNATURES: Array<{ name: string; builder: boolean; patterns: RegExp[] }> = [
  { name: 'Shopify', builder: false, patterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i, /shopify-section/i] },
  { name: 'Wix', builder: true, patterns: [/static\.parastorage\.com/i, /wix-?(code|bolt|site)/i, /X-Wix-/i] },
  { name: 'Squarespace', builder: true, patterns: [/static1\.squarespace\.com/i, /squarespace\.com\/universal/i, /Squarespace\.afterBodyLoad/i] },
  { name: 'Webflow', builder: true, patterns: [/assets(-global)?\.website-files\.com/i, /data-wf-(page|site)/i] },
  { name: 'GoDaddy Website Builder', builder: true, patterns: [/img1\.wsimg\.com/i, /data-ux=/i] },
  { name: 'Duda', builder: true, patterns: [/irp-cdn\.multiscreensite\.com/i, /d\.dudacdn\.com/i] },
  { name: 'WooCommerce', builder: false, patterns: [/woocommerce/i, /wc-ajax/i] },
  { name: 'WordPress', builder: false, patterns: [/wp-content\//i, /wp-includes\//i, /name=["']generator["'][^>]*WordPress/i] },
  { name: 'Magento', builder: false, patterns: [/\/static\/version\d+\/frontend\//i, /Magento_/i] },
  { name: 'OpenCart', builder: false, patterns: [/index\.php\?route=common/i, /catalog\/view\/theme/i] },
  { name: 'Drupal', builder: false, patterns: [/sites\/all\/(themes|modules)/i, /Drupal\.settings/i] },
  { name: 'Joomla', builder: false, patterns: [/\/media\/jui\//i, /name=["']generator["'][^>]*Joomla/i] },
  { name: 'Next.js', builder: false, patterns: [/\/_next\/static\//i, /__NEXT_DATA__/i] },
  { name: 'React (SPA)', builder: false, patterns: [/data-reactroot/i, /__REACT_DEVTOOLS/i] },
];

/** Markers of a stack nobody has touched in roughly a decade. */
const DATED_STACK_MARKERS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'jQuery 1.x', pattern: /jquery[.\-/]?1\.\d+(\.\d+)?(\.min)?\.js/i },
  { label: 'Bootstrap 2 or 3', pattern: /bootstrap[.\-/]?[23]\.\d+(\.\d+)?(\.min)?(\.css|\.js)/i },
  { label: 'Flash embed', pattern: /<(embed|object)[^>]+(shockwave-flash|\.swf)/i },
  { label: 'Table-based layout', pattern: /<table[^>]*(width=["']100%["'][^>]*)?>[\s\S]{0,400}?<table/i },
  { label: 'Inline font tag', pattern: /<font\s/i },
  { label: 'XHTML 1.0 doctype', pattern: /<!DOCTYPE[^>]+XHTML 1\.0/i },
  { label: 'Frameset', pattern: /<frameset|<iframe[^>]+name=["']main["']/i },
  { label: 'marquee or blink', pattern: /<(marquee|blink)[\s>]/i },
];

export function detectPlatform(site: ScrapedSite): PlatformDetection {
  const html = site.pages.map((p) => p.html).join('\n');
  const evidence: string[] = [];

  let platform: string | null = null;
  let isBuilder = false;

  for (const signature of PLATFORM_SIGNATURES) {
    const matches = findMatches(html, signature.patterns, 1);
    if (matches.length > 0) {
      platform = signature.name;
      isBuilder = signature.builder;
      evidence.push(`${signature.name}: ${matches[0]}`);
      break;
    }
  }

  const dated: string[] = [];
  for (const marker of DATED_STACK_MARKERS) {
    const matches = findMatches(html, [marker.pattern], 1);
    if (matches.length > 0) {
      dated.push(marker.label);
      evidence.push(`${marker.label}: ${matches[0]}`);
    }
  }

  if (!platform && dated.length === 0) {
    evidence.push('no recognisable platform fingerprint in the crawled markup');
  }

  return { platform, is_website_builder: isBuilder, dated_markers: dated, evidence: evidence.slice(0, 6) };
}

export function runTechnicalAudit(
  site: ScrapedSite,
  pagespeed: { mobile: PageSpeedResult | null; desktop: PageSpeedResult | null },
  archive?: ArchiveHistory | null,
): TechnicalAudit {
  const home = homepage(site);

  if (!home) {
    const unavailable = notMeasured('unavailable', 'no page content was retrieved for this site');
    const blank: TechnicalAudit = {
      https: unavailable,
      redirects_to_https: unavailable,
      mobile_viewport: unavailable,
      responsive_css: unavailable,
      page_title: unavailable,
      meta_description: unavailable,
      h1: unavailable,
      canonical: unavailable,
      robots_txt: unavailable,
      robots_blocks_indexing: unavailable,
      sitemap: unavailable,
      broken_internal_links: unavailable,
      important_pages: unavailable,
      contact_form: unavailable,
      booking_link: unavailable,
      quote_request: unavailable,
      demo_request: unavailable,
      whatsapp_link: unavailable,
      click_to_call: unavailable,
      live_chat: unavailable,
      checkout_or_cart: unavailable,
      pricing: unavailable,
      testimonials: unavailable,
      reviews: unavailable,
      case_studies: unavailable,
      client_logos: unavailable,
      certifications: unavailable,
      contact_details: unavailable,
      ga4: unavailable,
      gtm: unavailable,
      meta_pixel: unavailable,
      other_tracking: unavailable,
      screenshot_mobile: unavailable,
      screenshot_desktop: unavailable,
      pagespeed_mobile: pagespeed.mobile,
      pagespeed_desktop: pagespeed.desktop,
      failed_pages: [],
      found_page_types: [],
      platform: { platform: null, is_website_builder: false, dated_markers: [], evidence: ['no page content was retrieved'] },
      archive: null,
    };
    return blank;
  }

  const finalUrl = site.final_url ?? home.url;
  const isHttps = finalUrl.startsWith('https://');
  const html = home.html;

  // A page that 404s is not a page the site has, even though we found a link to it.
  const foundTypes = new Set(
    site.pages.filter((p) => p.status_code == null || p.status_code < 400).map((p) => p.page_type),
  );
  const missingImportant = IMPORTANT_PAGE_TYPES.filter((t) => !foundTypes.has(t));
  const failedPages = site.pages.filter((p) => p.status_code != null && p.status_code >= 400);

  return {
    https: hit(isHttps, [`final url: ${finalUrl}`], 'http_check'),
    redirects_to_https: hit(
      isHttps,
      [isHttps ? 'requests resolve over https' : 'site served over plain http'],
      'http_check',
    ),
    mobile_viewport: hit(
      /<meta[^>]+name=["']viewport["']/i.test(html),
      findMatches(html, [/<meta[^>]+name=["']viewport["'][^>]*>/i]).length
        ? findMatches(html, [/<meta[^>]+name=["']viewport["'][^>]*>/i])
        : ['no <meta name="viewport"> tag on the homepage'],
    ),
    responsive_css: hit(
      /@media[^{]*\(\s*(max|min)-width/i.test(html) || /class=["'][^"']*\b(sm|md|lg|col-|flex|grid)\b/i.test(html),
      ['responsive css media queries or a responsive layout framework detected on the homepage'],
    ),
    page_title: hit(
      !!home.title && home.title.trim().length > 0,
      home.title ? [`title: "${home.title}"`] : ['homepage has no <title>'],
    ),
    meta_description: hit(
      !!home.meta_description && home.meta_description.trim().length > 0,
      home.meta_description ? [`meta description: "${home.meta_description}"`] : ['homepage has no meta description'],
    ),
    h1: hit(!!home.h1 && home.h1.trim().length > 0, home.h1 ? [`h1: "${home.h1}"`] : ['homepage has no <h1>']),
    canonical: hit(
      /<link[^>]+rel=["']canonical["']/i.test(html),
      findMatches(html, [/<link[^>]+rel=["']canonical["'][^>]*>/i]).length
        ? findMatches(html, [/<link[^>]+rel=["']canonical["'][^>]*>/i])
        : ['no canonical link element on the homepage'],
    ),
    robots_txt:
      site.robots_txt == null
        ? notMeasured('not_run', 'robots.txt was not fetched')
        : hit(site.robots_txt.trim().length > 0, [`robots.txt: ${site.robots_txt.slice(0, 120)}`], 'http_check'),
    robots_blocks_indexing: hit(
      /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) ||
        (site.robots_txt != null && /disallow:\s*\/\s*$/im.test(site.robots_txt)),
      ['checked homepage robots meta tag and robots.txt Disallow rules'],
    ),
    sitemap:
      site.sitemap_url == null
        ? hit(false, ['no sitemap.xml found at the conventional location or referenced in robots.txt'], 'http_check')
        : hit(true, [`sitemap: ${site.sitemap_url}`], 'http_check'),
    broken_internal_links: hit(
      failedPages.length > 0,
      failedPages.length > 0
        ? failedPages.map((p) => `${p.url} returned ${p.status_code}`)
        : [`all ${site.pages.length} crawled internal page(s) responded successfully`],
      'http_check',
    ),
    important_pages: hit(
      missingImportant.length === 0,
      missingImportant.length === 0
        ? [`found all key page types: ${[...foundTypes].join(', ')}`]
        : [`missing page types: ${missingImportant.join(', ')}`, `found: ${[...foundTypes].join(', ')}`],
      'http_check',
    ),
    contact_form: detectAcrossSite(
      site,
      [/<form[\s>]/i, /type=["']email["']/i, /(typeform|jotform|hubspot|wpforms|contact-form|gravity_form)/i],
      'contact form',
    ),
    booking_link: detectAcrossSite(
      site,
      [
        /(calendly|acuityscheduling|setmore|simplybook|booksy|zocdoc|cal\.com|squareup\.com\/appointments)/i,
        /(book\s*(an\s*)?(appointment|now|online)|schedule\s*(a\s*)?(visit|appointment)|احجز|حجز\s*موعد)/i,
      ],
      'booking',
    ),
    quote_request: detectAcrossSite(
      site,
      [/(request\s*(a\s*)?quote|get\s*(a\s*)?quote|free\s*quote|rfq|اطلب\s*عرض\s*سعر|طلب\s*عرض)/i],
      'quote request',
    ),
    demo_request: detectAcrossSite(
      site,
      [/(request\s*(a\s*)?demo|book\s*(a\s*)?demo|get\s*(a\s*)?demo|start\s*(a\s*)?free\s*trial|احجز\s*عرض)/i],
      'demo request',
    ),
    whatsapp_link: detectAcrossSite(
      site,
      [/(wa\.me\/|api\.whatsapp\.com\/send|whatsapp:\/\/send)/i],
      'whatsapp link',
    ),
    click_to_call: detectAcrossSite(site, [/href=["']tel:/i], 'click-to-call link'),
    live_chat: detectAcrossSite(
      site,
      [/(tawk\.to|intercom|drift\.com|crisp\.chat|zendesk|livechatinc|tidio|hubspot-messages|zoho\s*salesiq)/i],
      'live chat widget',
    ),
    checkout_or_cart: detectAcrossSite(
      site,
      [
        /(add[-_\s]?to[-_\s]?cart|\/cart\b|\/checkout\b|woocommerce|shopify|magento|opencart|snipcart|أضف\s*إلى\s*السلة|سلة\s*التسوق)/i,
      ],
      'cart or checkout',
    ),
    pricing: detectAcrossSite(
      site,
      [/(\/pricing\b|>\s*pricing\s*<|price\s*list|starting\s*at|per\s*month|الأسعار|قائمة\s*الأسعار)/i],
      'pricing information',
    ),
    testimonials: detectAcrossSite(
      site,
      [/(testimonial|what\s*(our\s*)?clients\s*say|customer\s*stories|آراء\s*العملاء|شهادات)/i],
      'testimonials',
    ),
    reviews: detectAcrossSite(
      site,
      [/(google\s*review|trustpilot|yotpo|judge\.me|reviews?\.io|star-rating|aggregateRating)/i],
      'reviews',
    ),
    case_studies: detectAcrossSite(
      site,
      [/(case\s*stud(y|ies)|success\s*stor(y|ies)|portfolio|our\s*work|دراسة\s*حالة|أعمالنا)/i],
      'case studies',
    ),
    client_logos: detectAcrossSite(
      site,
      [/(trusted\s*by|our\s*clients|clients?[-_\s]?logo|partners?[-_\s]?logo|عملاؤنا|شركاؤنا)/i],
      'client logos',
    ),
    certifications: detectAcrossSite(
      site,
      [/(iso\s*\d{4,5}|certified|accredit|licen[cs]e\s*no|haccp|ce\s*mark|شهادة|معتمد)/i],
      'certifications',
    ),
    contact_details: detectAcrossSite(
      site,
      [/(href=["']tel:|href=["']mailto:|\+\d{6,}|<address[\s>])/i],
      'contact details',
    ),
    ga4: detectAcrossSite(site, [/(gtag\/js\?id=G-|gtag\(['"]config['"],\s*['"]G-)/i], 'GA4 tag'),
    gtm: detectAcrossSite(site, [/(googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,})/i], 'Google Tag Manager'),
    meta_pixel: detectAcrossSite(
      site,
      [/(connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init['"])/i],
      'Meta Pixel',
    ),
    other_tracking: detectAcrossSite(
      site,
      [
        /(analytics\.tiktok\.com|sc-static\.net\/scevent|snaptr\(|snap\.licdn\.com\/li\.lms-analytics|static\.hotjar\.com|clarity\.ms|plausible\.io\/js|posthog|matomo)/i,
      ],
      'other tracking tags',
    ),
    screenshot_mobile: site.screenshot_mobile_url
      ? hit(true, [site.screenshot_mobile_url], 'screenshot')
      : notMeasured('not_run', 'no mobile screenshot captured'),
    screenshot_desktop: site.screenshot_desktop_url
      ? hit(true, [site.screenshot_desktop_url], 'screenshot')
      : notMeasured('not_run', 'no desktop screenshot captured'),
    pagespeed_mobile: pagespeed.mobile,
    pagespeed_desktop: pagespeed.desktop,
    failed_pages: failedPages.map((p) => p.url),
    found_page_types: [...foundTypes],
    platform: detectPlatform(site),
    archive: archive ?? null,
  };
}

/** Signal keys shared by the company audit and the competitor comparison. */
export const CONVERSION_SIGNAL_KEYS = [
  'contact_form',
  'booking_link',
  'quote_request',
  'demo_request',
  'whatsapp_link',
  'click_to_call',
  'live_chat',
  'checkout_or_cart',
  'pricing',
] as const;

export const TRUST_SIGNAL_KEYS = [
  'testimonials',
  'reviews',
  'case_studies',
  'client_logos',
  'certifications',
  'contact_details',
] as const;

export const TRACKING_SIGNAL_KEYS = ['ga4', 'gtm', 'meta_pixel', 'other_tracking'] as const;

export type SignalKey =
  | (typeof CONVERSION_SIGNAL_KEYS)[number]
  | (typeof TRUST_SIGNAL_KEYS)[number]
  | (typeof TRACKING_SIGNAL_KEYS)[number];

export const SIGNAL_LABELS: Record<string, string> = {
  contact_form: 'Contact form',
  booking_link: 'Online booking',
  quote_request: 'Quote request',
  demo_request: 'Demo request',
  whatsapp_link: 'WhatsApp CTA',
  click_to_call: 'Click-to-call',
  live_chat: 'Live chat',
  checkout_or_cart: 'Checkout / cart',
  pricing: 'Pricing shown',
  testimonials: 'Testimonials',
  reviews: 'Reviews',
  case_studies: 'Case studies',
  client_logos: 'Client logos',
  certifications: 'Certifications',
  contact_details: 'Contact details',
  ga4: 'GA4',
  gtm: 'Google Tag Manager',
  meta_pixel: 'Meta Pixel',
  other_tracking: 'Other tracking',
  value_proposition: 'Clear value proposition',
  landing_pages: 'Service/product landing pages',
  lead_magnet: 'Lead magnet',
  updated_content: 'Recently updated content',
};

/** Flatten an audit into the boolean signal map used by scoring and competitor gaps. */
export function auditSignalMap(audit: TechnicalAudit): Record<string, boolean | null> {
  const keys = [...CONVERSION_SIGNAL_KEYS, ...TRUST_SIGNAL_KEYS, ...TRACKING_SIGNAL_KEYS];
  const out: Record<string, boolean | null> = {};
  for (const k of keys) {
    out[k] = (audit as unknown as Record<string, Detection>)[k]?.present ?? null;
  }
  return out;
}
