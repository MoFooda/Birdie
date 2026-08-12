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
