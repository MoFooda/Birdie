/**
 * Integration test for the self-hosted renderer.
 *
 * Serves a page whose content only exists after JavaScript runs, then checks that the
 * Playwright renderer sees it and the plain HTTP scraper does not. That difference is the
 * entire reason the renderer exists: a client-rendered site read without a browser looks
 * empty, and an empty read would score as a broken website.
 *
 * Skips cleanly when no browser binary is installed, since Playwright is opt-in.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createPlaywrightScraper, closeBrowser, playwrightAvailable, renderPage } from '@/providers/playwright';
import { runTechnicalAudit } from '@/core/audit-checks';

const PORT = 4123;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** A page that renders its real content — including a booking CTA — only via script. */
const PAGE = `<!doctype html><html><head>
<title>Clinic</title><meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><div id="app"></div>
<script>
  document.getElementById('app').innerHTML =
    '<h1>Riverside Clinic</h1>' +
    '<a href="https://calendly.com/riverside/visit">Book an appointment online</a>' +
    '<a href="tel:+441234567890">Call us</a>' +
    '<p>' + 'Rendered only after JavaScript runs. '.repeat(20) + '</p>' +
    '<nav><a href="/about">About</a><a href="/contact">Contact</a></nav>';
</script></body></html>`;

let server: Server;
let available = false;

describe('playwright renderer', () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(req.url === '/about' || req.url === '/contact' ? '<html><body><h1>Page</h1></body></html>' : PAGE);
    });
    await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
    available = (await playwrightAvailable()).ok;
  }, 60_000);

  afterAll(async () => {
    await closeBrowser();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('sees content that only exists after JavaScript runs', async ({ skip }) => {
    if (!available) skip();
    const result = await renderPage(ORIGIN);

    expect(result.status).toBe(200);
    expect(result.html).toContain('Riverside Clinic');
    expect(result.html).toContain('calendly.com');
  }, 60_000);

  it('shows what the HTTP scraper misses on the same page', async ({ skip }) => {
    if (!available) skip();
    const rendered = await renderPage(ORIGIN);
    const raw = await fetch(ORIGIN).then((r) => r.text());

    // Served HTML has an empty mount point; the heading exists only inside a script
    // string, which no amount of DOM parsing will turn into a booking link.
    expect(raw).toContain('<div id="app"></div>');
    expect(rendered.html).toMatch(/<div id="app"><h1>Riverside Clinic<\/h1>/);
  }, 60_000);

  it('captures real screenshots as compressed data URIs', async ({ skip }) => {
    if (!available) skip();
    const result = await renderPage(ORIGIN, 'mobile', { screenshots: true });

    const aboveFold = result.screenshots?.above_fold ?? '';
    const fullPage = result.screenshots?.full_page ?? '';

    expect(aboveFold.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(fullPage.startsWith('data:image/jpeg;base64,')).toBe(true);
    // Small enough to store inline and to send to a vision model.
    expect(aboveFold.length).toBeLessThan(400_000);
  }, 90_000);

  it('lets the audit detect conversion features that only render client-side', async ({ skip }) => {
    if (!available) skip();
    const rendered = await renderPage(ORIGIN);
    const site = {
      final_url: rendered.final_url,
      pages: [
        {
          url: rendered.final_url,
          page_type: 'home',
          status_code: rendered.status,
          html: rendered.html,
          text: rendered.html.replace(/<[^>]+>/g, ' '),
          title: rendered.title,
          meta_description: null,
          h1: 'Riverside Clinic',
        },
      ],
      robots_txt: null,
      sitemap_url: null,
      headers: rendered.headers,
      screenshot_mobile_url: null,
      screenshot_desktop_url: null,
    };
    const audit = runTechnicalAudit(site, { mobile: null, desktop: null }, null);

    // Read without a browser, this clinic would have scored as having no booking path
    // and no phone number — a false negative that drives the whole score.
    expect(audit.booking_link.present).toBe(true);
    expect(audit.click_to_call.present).toBe(true);
    expect(audit.mobile_viewport.present).toBe(true);
  }, 90_000);

  it('reports an unreachable host as a transport failure rather than throwing', async ({ skip }) => {
    if (!available) skip();
    const result = await createPlaywrightScraper().probe('this-host-does-not-exist-9f3a2b.invalid');

    // The contract is that a dead host is measured, not thrown: the probe still succeeds
    // and carries an error code the status classifier can act on.
    //
    // The exact code depends on where name resolution happens. Connecting directly,
    // Chromium reports ERR_NAME_NOT_RESOLVED and this is 'dns'. Behind an HTTP proxy —
    // as in CI here — the proxy resolves the name and Chromium only sees the tunnel
    // fail, so it is 'connection'. Either way it is never mistaken for a live site.
    expect(result.ok).toBe(true);
    expect(['dns', 'connection', 'timeout']).toContain(result.data?.errorCode);
    expect(result.data?.errorMessage).toBeTruthy();
    expect(result.data?.html).toBeNull();
  }, 60_000);
});
