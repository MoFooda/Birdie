/**
 * Fixture website builder.
 *
 * Demo mode has to exercise the real detectors, not bypass them — so fixtures are
 * generated as actual HTML containing (or deliberately omitting) the markup the audit
 * looks for. The same `runTechnicalAudit` code path runs against a fixture site and a
 * live one, which is what makes the demo a genuine rehearsal of production behaviour.
 *
 * Everything produced here is clearly labelled as demo data at the UI layer.
 */

import type { ScrapedPage, ScrapedSite } from '@/core/audit-checks';
import type { StatusProbe } from '@/core/website-status';

export type SiteFeature =
  | 'contact_form'
  | 'booking_link'
  | 'quote_request'
  | 'demo_request'
  | 'whatsapp_link'
  | 'click_to_call'
  | 'live_chat'
  | 'checkout_or_cart'
  | 'pricing'
  | 'testimonials'
  | 'reviews'
  | 'case_studies'
  | 'client_logos'
  | 'certifications'
  | 'contact_details'
  | 'ga4'
  | 'gtm'
  | 'meta_pixel'
  | 'other_tracking'
  | 'viewport'
  | 'responsive'
  | 'canonical'
  | 'sitemap'
  | 'meta_description';

export type SiteKind =
  | 'live'
  | 'redirect'
  | 'parked'
  | 'for_sale'
  | 'construction'
  | 'bot_protection'
  | 'access_blocked'
  | 'timeout'
  | 'dns_failure'
  | 'ssl_failure'
  | 'broken_home';

export interface SiteSpec {
  domain: string;
  name: string;
  kind: SiteKind;
  /** Host the domain redirects to, for `kind: 'redirect'`. */
  redirect_to?: string;
  title?: string;
  meta_description?: string;
  h1?: string;
  tagline?: string;
  features: SiteFeature[];
  /** Page types beyond the homepage, e.g. ['about','contact','services']. */
  pages?: string[];
  /** Page types that are linked but return 404, producing a broken-link finding. */
  broken_pages?: string[];
  pagespeed_mobile?: number;
  pagespeed_desktop?: number;
  lang?: 'en' | 'ar';
}

const has = (spec: SiteSpec, f: SiteFeature) => spec.features.includes(f);

const FEATURE_SNIPPETS: Record<string, (spec: SiteSpec) => string> = {
  contact_form: () =>
    `<section id="enquiry"><h2>Send us a message</h2><form action="/submit" method="post">
      <input type="text" name="name" placeholder="Your name" />
      <input type="email" name="email" placeholder="Your email" />
      <textarea name="message"></textarea><button type="submit">Send</button></form></section>`,
  booking_link: (s) =>
    `<a class="cta" href="https://calendly.com/${s.domain.split('.')[0]}/consultation">Book an appointment online</a>`,
  quote_request: () => `<a class="cta" href="/request-a-quote">Request a quote</a>`,
  demo_request: () => `<a class="cta" href="/demo">Book a demo</a>`,
  whatsapp_link: () => `<a class="wa" href="https://wa.me/9715000000">Chat with us on WhatsApp</a>`,
  click_to_call: () => `<a class="tel" href="tel:+97145550000">+971 4 555 0000</a>`,
  live_chat: () => `<script src="https://embed.tawk.to/6512abcd/1h2i3j4k" async></script>`,
  checkout_or_cart: () =>
    `<div class="shop"><button class="add-to-cart">Add to cart</button><a href="/cart">View cart</a><a href="/checkout">Checkout</a></div>`,
  pricing: () => `<section id="plans"><h2>Pricing</h2><p>Starting at 499 per month.</p></section>`,
  testimonials: () =>
    `<section class="testimonial"><h2>Testimonials</h2><blockquote>They delivered exactly what they promised.</blockquote></section>`,
  reviews: () =>
    `<div class="reviews" itemprop="aggregateRating">Rated 4.8 on Trustpilot from 214 reviews</div>`,
  case_studies: () =>
    `<section><h2>Case studies</h2><a href="/case-studies/retail-rollout">How we cut delivery time by half</a></section>`,
  client_logos: () => `<section class="logos"><h2>Trusted by</h2><img src="/img/client-1.png" alt="client logo" /></section>`,
  certifications: () => `<p class="cert">ISO 9001 certified since 2016. Licence no. 1042-B.</p>`,
  contact_details: () =>
    `<address>Unit 12, Business Bay, Dubai</address><a href="mailto:hello@example.com">hello@example.com</a>`,
  ga4: () => `<script async src="https://www.googletagmanager.com/gtag/js?id=G-7QW2LMN4XZ"></script>`,
  gtm: () => `<script>(function(w,d){})(window,document);</script><script src="https://www.googletagmanager.com/gtm.js?id=GTM-K3P9QV"></script>`,
  meta_pixel: () =>
    `<script>!function(f,b,e){}(window,document);fbq('init','1029384756');</script><script src="https://connect.facebook.net/en_US/fbevents.js"></script>`,
  other_tracking: () => `<script src="https://static.hotjar.com/c/hotjar-3312445.js"></script>`,
};

const PAGE_TITLES: Record<string, string> = {
  home: 'Home',
  about: 'About us',
  contact: 'Contact',
  services: 'Services',
  products: 'Products',
  pricing: 'Pricing',
  blog: 'Insights',
};

function nav(spec: SiteSpec): string {
  const types = ['home', ...(spec.pages ?? [])];
  const links = types
    .map((t) => `<a href="/${t === 'home' ? '' : t}">${PAGE_TITLES[t] ?? t}</a>`)
    .join('');
  return `<nav role="navigation">${links}</nav>`;
}

function head(spec: SiteSpec, pageTitle: string): string {
  const parts: string[] = [`<title>${pageTitle} | ${spec.name}</title>`];
  if (has(spec, 'viewport')) parts.push(`<meta name="viewport" content="width=device-width, initial-scale=1" />`);
  if (has(spec, 'meta_description')) {
    parts.push(
      `<meta name="description" content="${spec.meta_description ?? `${spec.name} — ${spec.tagline ?? 'official website'}`}" />`,
    );
  }
  if (has(spec, 'canonical')) parts.push(`<link rel="canonical" href="https://${spec.domain}/" />`);
  if (has(spec, 'responsive')) {
    parts.push(`<style>@media (max-width: 768px){.container{width:100%}}</style>`);
  }
  return parts.join('');
}

const FILLER_EN = `We have served clients across the region since 2009. Our team combines specialist expertise with a
practical, delivery-focused approach, and we work with organisations of every size. This paragraph exists so the
homepage carries a realistic amount of body text for the content-density measurement.`;

const FILLER_AR = `نعمل مع عملائنا في جميع أنحاء المنطقة منذ عام ٢٠٠٩. يجمع فريقنا بين الخبرة المتخصصة والتنفيذ العملي،
ونتعامل مع المؤسسات بمختلف أحجامها. هذه الفقرة موجودة حتى تحتوي الصفحة الرئيسية على كمية واقعية من النص.`;

function buildPage(spec: SiteSpec, pageType: string): ScrapedPage {
  const pageTitle = PAGE_TITLES[pageType] ?? pageType;
  const isHome = pageType === 'home';
  const h1 = isHome ? (spec.h1 ?? spec.name) : pageTitle;
  const filler = spec.lang === 'ar' ? FILLER_AR : FILLER_EN;

  const featureHtml = isHome
    ? spec.features
        .map((f) => FEATURE_SNIPPETS[f]?.(spec) ?? '')
        .filter(Boolean)
        .join('\n')
    : '';

  const body = `
    <header>${nav(spec)}</header>
    <main>
      <h1>${h1}</h1>
      <p class="lede">${spec.tagline ?? ''}</p>
      <p>${filler}</p>
      ${featureHtml}
    </main>
    <footer><p>&copy; ${new Date().getFullYear()} ${spec.name}</p></footer>`;

  const html = `<!doctype html><html lang="${spec.lang ?? 'en'}"><head>${head(spec, pageTitle)}</head><body>${body}</body></html>`;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url: `https://${spec.domain}/${isHome ? '' : pageType}`,
    page_type: pageType,
    status_code: 200,
    html,
    text,
    title: `${pageTitle} | ${spec.name}`,
    meta_description: has(spec, 'meta_description')
      ? (spec.meta_description ?? `${spec.name} — ${spec.tagline ?? 'official website'}`)
      : null,
    h1,
  };
}

const PLACEHOLDER_BODIES: Partial<Record<SiteKind, string>> = {
  parked:
    `<!doctype html><html><head><title>${'Parked domain'}</title></head><body><h1>Welcome</h1>
     <p>This domain is parked free of charge by the registrar. ParkingCrew.</p></body></html>`,
  for_sale:
    `<!doctype html><html><head><title>Domain for sale</title></head><body><h1>This domain is for sale</h1>
     <p>Buy this domain — make an offer through HugeDomains.</p></body></html>`,
  construction:
    `<!doctype html><html><head><title>Coming soon</title></head><body><h1>Coming soon</h1>
     <p>Our new website is under construction. Launching soon.</p></body></html>`,
  bot_protection:
    `<!doctype html><html><head><title>Just a moment...</title></head><body>
     <h1>Just a moment...</h1><p>Checking your browser before accessing the site. Enable JavaScript and cookies to continue.</p></body></html>`,
};

export interface FixtureSite {
  probe: StatusProbe;
  site: ScrapedSite | null;
  pagespeed: { mobile: number | null; desktop: number | null };
}

export function buildFixtureSite(spec: SiteSpec): FixtureSite {
  const url = `https://${spec.domain}`;
  const pagespeed = {
    mobile: spec.pagespeed_mobile ?? null,
    desktop: spec.pagespeed_desktop ?? null,
  };

  const base = {
    submittedDomain: spec.domain,
    redirectChain: [] as string[],
    headers: { 'content-type': 'text/html; charset=utf-8' } as Record<string, string>,
  };

  switch (spec.kind) {
    case 'dns_failure':
      return {
        probe: { ...base, finalUrl: null, httpStatus: null, errorCode: 'dns', errorMessage: `getaddrinfo ENOTFOUND ${spec.domain}`, html: null, textContent: null, title: null },
        site: null,
        pagespeed,
      };
    case 'ssl_failure':
      return {
        probe: { ...base, finalUrl: null, httpStatus: null, errorCode: 'ssl', errorMessage: 'certificate has expired', html: null, textContent: null, title: null },
        site: null,
        pagespeed,
      };
    case 'timeout':
      return {
        probe: { ...base, finalUrl: null, httpStatus: null, errorCode: 'timeout', errorMessage: 'request timed out after 15000ms', html: null, textContent: null, title: null },
        site: null,
        pagespeed,
      };
    case 'access_blocked':
      return {
        probe: { ...base, finalUrl: url, httpStatus: 403, errorCode: null, html: '<html><body>Forbidden</body></html>', textContent: 'Forbidden', title: 'Forbidden' },
        site: null,
        pagespeed,
      };
    case 'bot_protection': {
      const html = PLACEHOLDER_BODIES.bot_protection!;
      return {
        probe: {
          ...base,
          headers: { ...base.headers, 'cf-mitigated': 'challenge' },
          finalUrl: url,
          httpStatus: 403,
          errorCode: null,
          html,
          textContent: 'Just a moment... Checking your browser before accessing the site.',
          title: 'Just a moment...',
        },
        site: null,
        pagespeed,
      };
    }
    case 'parked':
    case 'for_sale':
    case 'construction': {
      const html = PLACEHOLDER_BODIES[spec.kind]!;
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        probe: { ...base, finalUrl: url, httpStatus: 200, errorCode: null, html, textContent: text, title: spec.kind === 'for_sale' ? 'Domain for sale' : 'Coming soon' },
        site: null,
        pagespeed,
      };
    }
    case 'broken_home': {
      const html = '<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><p>The requested page does not exist on this server.</p></body></html>';
      const pages = ['home', ...(spec.pages ?? [])].map((t) => buildPage(spec, t));
      const homeIndex = pages.findIndex((p) => p.page_type === 'home');
      if (homeIndex >= 0) {
        pages[homeIndex] = { ...pages[homeIndex]!, status_code: 404, html, text: '404 Not Found', title: '404 Not Found', h1: '404 Not Found' };
      }
      return {
        probe: { ...base, finalUrl: url, httpStatus: 404, errorCode: null, html, textContent: '404 Not Found The requested page does not exist on this server.', title: '404 Not Found' },
        site: {
          final_url: url,
          pages,
          robots_txt: null,
          sitemap_url: null,
          headers: base.headers,
          screenshot_mobile_url: `/demo-screenshots/${spec.domain}-mobile.svg`,
          screenshot_desktop_url: `/demo-screenshots/${spec.domain}-desktop.svg`,
        },
        pagespeed,
      };
    }
    case 'redirect':
    case 'live':
    default: {
      const finalHost = spec.kind === 'redirect' && spec.redirect_to ? spec.redirect_to : spec.domain;
      const finalUrl = `https://${finalHost}`;
      const effective: SiteSpec = { ...spec, domain: finalHost };
      const pageTypes = ['home', ...(spec.pages ?? [])];
      const pages = pageTypes.map((t) => buildPage(effective, t));

      for (const brokenType of spec.broken_pages ?? []) {
        pages.push({
          url: `${finalUrl}/${brokenType}`,
          page_type: brokenType,
          status_code: 404,
          html: '<html><head><title>404</title></head><body><h1>Not found</h1></body></html>',
          text: 'Not found',
          title: '404',
          meta_description: null,
          h1: 'Not found',
        });
      }

      const home = pages[0]!;
      return {
        probe: {
          submittedDomain: spec.domain,
          finalUrl,
          httpStatus: 200,
          redirectChain: spec.kind === 'redirect' ? [`https://${spec.domain}`, finalUrl] : [],
          errorCode: null,
          html: home.html,
          textContent: home.text,
          title: home.title,
          headers: base.headers,
        },
        site: {
          final_url: finalUrl,
          pages,
          robots_txt: 'User-agent: *\nAllow: /',
          sitemap_url: has(spec, 'sitemap') ? `${finalUrl}/sitemap.xml` : null,
          headers: base.headers,
          screenshot_mobile_url: `/demo-screenshots/${finalHost}-mobile.svg`,
          screenshot_desktop_url: `/demo-screenshots/${finalHost}-desktop.svg`,
        },
        pagespeed,
      };
    }
  }
}
