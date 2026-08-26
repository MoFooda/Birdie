import { describe, expect, it } from 'vitest';
import {
  classifyWebsiteStatus,
  isAuditable,
  isMeasurementBlocked,
  isMissingWebsite,
  type StatusProbe,
} from '@/core/website-status';

function probe(overrides: Partial<StatusProbe> = {}): StatusProbe {
  return {
    submittedDomain: 'example.com',
    finalUrl: 'https://example.com',
    httpStatus: 200,
    redirectChain: [],
    errorCode: null,
    html: '<html><body><nav><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav><p>' + 'x'.repeat(400) + '</p></body></html>',
    textContent: 'x'.repeat(400),
    title: 'Example',
    ...overrides,
  };
}

describe('classifyWebsiteStatus', () => {
  it('classifies a healthy site as live', () => {
    const result = classifyWebsiteStatus(probe());
    expect(result.status).toBe('live');
    expect(result.confidence).toBe('high');
  });

  it('reports no_website when nothing was submitted', () => {
    expect(classifyWebsiteStatus(probe({ submittedDomain: null })).status).toBe('no_website');
    expect(classifyWebsiteStatus(probe({ submittedDomain: '   ' })).status).toBe('no_website');
  });

  it('reports invalid_domain for unparseable input, with the rejection reason as evidence', () => {
    const result = classifyWebsiteStatus(probe({ submittedDomain: 'not a domain' }));
    expect(result.status).toBe('invalid_domain');
    expect(result.evidence.join(' ')).toContain('invalid_characters');
  });

  it.each([
    ['dns', 'dns_failure'],
    ['ssl', 'ssl_failure'],
    ['timeout', 'timeout'],
  ] as const)('maps a %s transport error to %s', (errorCode, expected) => {
    const result = classifyWebsiteStatus(probe({ errorCode, httpStatus: null, html: null, textContent: null }));
    expect(result.status).toBe(expected);
  });

  it('sends an unattributable connection error to review rather than guessing', () => {
    const result = classifyWebsiteStatus(probe({ errorCode: 'connection', httpStatus: null, html: null }));
    expect(result.status).toBe('unknown_needs_review');
    expect(result.confidence).toBe('low');
  });

  it('detects a Cloudflare challenge as bot protection, not as offline', () => {
    const result = classifyWebsiteStatus(
      probe({
        httpStatus: 403,
        title: 'Just a moment...',
        textContent: 'Just a moment... Checking your browser before accessing the site.',
        html: '<html><body>Just a moment...</body></html>',
      }),
    );
    expect(result.status).toBe('bot_protection');
    expect(isMissingWebsite(result.status)).toBe(false);
    expect(isMeasurementBlocked(result.status)).toBe(true);
    expect(result.reason).toMatch(/may well be healthy/i);
  });

  it('detects bot protection from a response header alone', () => {
    const result = classifyWebsiteStatus(probe({ headers: { 'CF-Mitigated': 'challenge' } }));
    expect(result.status).toBe('bot_protection');
  });

  // Regression: eleven working Shopify stores were classified bot_protection in a live
  // batch, purely because reCAPTCHA ships with the contact form. The word is in the
  // markup of a page that loaded perfectly, and matching it there stopped the analysis.
  it('does not call a full page bot-protected because its markup mentions a captcha', () => {
    const html =
      '<html><body><nav>' +
      Array.from({ length: 12 }, (_, i) => `<a href="/p${i}">Product ${i}</a>`).join('') +
      '</nav><p>' +
      'shop copy '.repeat(300) +
      '</p><script src="https://www.google.com/recaptcha/api.js"></script>' +
      '<form id="contact">protected by reCAPTCHA</form></body></html>';
    const result = classifyWebsiteStatus(
      probe({ html, textContent: 'shop copy '.repeat(300), title: 'Lernitoys.ae' }),
    );
    expect(result.status).toBe('live');
  });

  it('still calls a near-empty captcha page bot-protected', () => {
    const result = classifyWebsiteStatus(
      probe({
        httpStatus: 403,
        html: '<html><body><div id="captcha-box">Please solve the captcha</div></body></html>',
        textContent: 'Please solve the captcha',
        title: 'Access denied',
      }),
    );
    expect(result.status).toBe('bot_protection');
    expect(result.confidence).toBe('medium');
  });

  it('does not call a trading shop under construction over a "coming soon" product badge', () => {
    const html =
      '<html><body><nav>' +
      Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">Product ${i}</a>`).join('') +
      '</nav><span class="badge">Coming soon</span><p>' +
      'catalogue copy '.repeat(300) +
      '</p></body></html>';
    const result = classifyWebsiteStatus(
      probe({ html, textContent: 'Coming soon ' + 'catalogue copy '.repeat(300) }),
    );
    expect(result.status).toBe('live');
  });

  it('does not read a link to jordan.com as a domain-for-sale listing', () => {
    const result = classifyWebsiteStatus(
      probe({
        html:
          '<html><body><nav><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav>' +
          '<p>' +
          'partner copy '.repeat(300) +
          '</p><a href="https://jordan.com">Our Jordan office</a></body></html>',
        textContent: 'partner copy '.repeat(300) + ' Our Jordan office',
      }),
    );
    expect(result.status).toBe('live');
  });

  it.each([401, 403, 429, 451])('treats HTTP %i as access blocked rather than offline', (code) => {
    const result = classifyWebsiteStatus(probe({ httpStatus: code, html: '<html><body>Forbidden</body></html>', textContent: 'Forbidden' }));
    expect(result.status).toBe('access_blocked');
    expect(isMissingWebsite(result.status)).toBe(false);
  });

  it('treats a 404 homepage as partially broken', () => {
    const result = classifyWebsiteStatus(probe({ httpStatus: 404, textContent: 'Not found', html: '<html>404</html>' }));
    expect(result.status).toBe('partially_broken');
    expect(isAuditable(result.status)).toBe(true);
  });

  it('sends a 5xx to review instead of declaring the site dead', () => {
    const result = classifyWebsiteStatus(probe({ httpStatus: 503, textContent: 'Server error', html: '<html>error</html>' }));
    expect(result.status).toBe('unknown_needs_review');
  });

  it('detects a parked domain', () => {
    const html = '<html><body><h1>Welcome</h1><p>This domain is parked free of charge. ParkingCrew.</p></body></html>';
    const result = classifyWebsiteStatus(probe({ html, textContent: 'This domain is parked free of charge.' }));
    expect(result.status).toBe('parked_domain');
    expect(isMissingWebsite(result.status)).toBe(true);
  });

  it('detects a domain for sale', () => {
    const result = classifyWebsiteStatus(
      probe({ html: '<html>Buy this domain from HugeDomains</html>', textContent: 'Buy this domain' }),
    );
    expect(result.status).toBe('domain_for_sale');
  });

  it('detects an under-construction placeholder in English and Arabic', () => {
    expect(
      classifyWebsiteStatus(probe({ html: '<html>Coming soon</html>', textContent: 'coming soon' })).status,
    ).toBe('under_construction');
    expect(
      classifyWebsiteStatus(probe({ html: '<html>الموقع قيد الإنشاء</html>', textContent: 'الموقع قيد الإنشاء' })).status,
    ).toBe('under_construction');
  });

  it('treats an almost-empty page as a placeholder, with low confidence', () => {
    const result = classifyWebsiteStatus(
      probe({ html: '<html><body><p>hi</p></body></html>', textContent: 'hi' }),
    );
    expect(result.status).toBe('under_construction');
    expect(result.confidence).toBe('low');
  });

  it('detects a cross-host redirect', () => {
    const result = classifyWebsiteStatus(
      probe({
        submittedDomain: 'oldbrand.io',
        finalUrl: 'https://newbrand.com',
        redirectChain: ['https://oldbrand.io', 'https://newbrand.com'],
      }),
    );
    expect(result.status).toBe('live_after_redirect');
  });

  it('does not call a same-host redirect a cross-host one', () => {
    const result = classifyWebsiteStatus(
      probe({ redirectChain: ['http://example.com', 'https://www.example.com'], finalUrl: 'https://www.example.com' }),
    );
    expect(result.status).toBe('live');
  });
});

describe('status predicates', () => {
  it('separates missing websites from blocked measurements', () => {
    expect(isMissingWebsite('parked_domain')).toBe(true);
    expect(isMissingWebsite('bot_protection')).toBe(false);
    expect(isMeasurementBlocked('bot_protection')).toBe(true);
    expect(isMeasurementBlocked('parked_domain')).toBe(false);
  });

  it('only marks reachable statuses auditable', () => {
    expect(isAuditable('live')).toBe(true);
    expect(isAuditable('live_after_redirect')).toBe(true);
    expect(isAuditable('partially_broken')).toBe(true);
    expect(isAuditable('dns_failure')).toBe(false);
    expect(isAuditable('bot_protection')).toBe(false);
  });
});
