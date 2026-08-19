/**
 * End-to-end happy path.
 *
 * Boots the real production server and drives the whole workflow over HTTP: sign in →
 * create campaign → upload and map a CSV → validate → run the batch → watch progress →
 * read the report pages → export the CSV.
 *
 * Requires a production build (`npm run build`), which is why `npm run verify` builds
 * before it tests.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_CSV_HEADERS, demoCsvRows } from '@/demo/seed';
import { suggestMapping } from '@/core/csv-mapping';
import { PIPELINE_STEPS } from '@/core/types';

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess;
let cookie = '';

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start on ${BASE} within ${timeoutMs}ms`);
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { ...(init.headers ?? {}), cookie, 'content-type': 'application/json' },
  });
}

describe('end-to-end happy path', () => {
  beforeAll(async () => {
    const buildId = resolve(process.cwd(), '.next/BUILD_ID');
    if (!existsSync(buildId)) {
      throw new Error('No production build found. Run `npm run build` before `npm run test` (or use `npm run verify`).');
    }

    server = spawn('npx', ['next', 'start', '--port', String(PORT), '--hostname', '127.0.0.1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DEMO_MODE: 'true',
        // Keep the run self-contained: no demo store file is written to disk.
        DEMO_PERSIST: 'false',
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    });

    await waitForServer();
  }, 120_000);

  afterAll(() => {
    server?.kill('SIGTERM');
  });

  it('signs in and issues a session cookie', async () => {
    const res = await api('/api/auth', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    cookie = setCookie!.split(';')[0]!;

    const session = await (await api('/api/auth')).json();
    expect(session.session).toMatchObject({ demo: true });
  });

  it('refuses API access without a session', async () => {
    const res = await fetch(`${BASE}/api/campaigns`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });

  let campaignId = '';

  it('creates a campaign with settings', async () => {
    const res = await api('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E campaign',
        target_geography: 'United Arab Emirates',
        target_sectors: ['Healthcare', 'Retail'],
        agency_service: 'Website rebuild',
        agency_value_proposition: 'We rebuild sites around the one action that matters.',
        sender_name: 'Nadia Sami',
        sender_role: 'Founder',
        sender_company: 'Birdie MENA',
        outreach_language: 'en',
        outreach_tone: 'consultative',
        preferred_cta: 'Worth a 15-minute call?',
        competitors_to_analyze: 3,
        min_score_for_outreach: 40,
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    campaignId = json.campaign.id;
    expect(campaignId).toBeTruthy();
  });

  it('rejects invalid campaign settings with field-level errors', async () => {
    const res = await api('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', target_sectors: [] }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeTruthy();
  });

  it('previews the CSV import without writing anything', async () => {
    const res = await api(`/api/campaigns/${campaignId}/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: demoCsvRows(), mapping: suggestMapping(DEMO_CSV_HEADERS), commit: false }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preview).toBe(true);
    expect(json.summary.total).toBe(demoCsvRows().length);
    expect(json.rows).toHaveLength(demoCsvRows().length);

    const companies = await (await api(`/api/campaigns/${campaignId}`)).json();
    expect(companies.company_count).toBe(0);
  });

  it('refuses to import until the required columns are mapped', async () => {
    const res = await api(`/api/campaigns/${campaignId}/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: demoCsvRows(), mapping: { company_name: 'Company' }, commit: true }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/required columns/i);
  });

  it('commits the import', async () => {
    const res = await api(`/api/campaigns/${campaignId}/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: demoCsvRows(), mapping: suggestMapping(DEMO_CSV_HEADERS), commit: true }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.imported).toBeGreaterThanOrEqual(10);
  });

  it('runs the batch and completes every company', async () => {
    const res = await api(`/api/campaigns/${campaignId}/run`, {
      method: 'POST',
      body: JSON.stringify({ wait: true }),
    });
    expect(res.status).toBe(202);

    const progress = await (await api(`/api/campaigns/${campaignId}/progress`)).json();
    expect(progress.percent).toBe(100);
    expect(progress.total_companies).toBeGreaterThanOrEqual(10);
    expect(progress.per_company[0].steps).toHaveLength(PIPELINE_STEPS.length);
    expect(progress.campaign_status).toBe('completed');
  }, 180_000);

  let companyId = '';

  it('produces a scored, evidenced report for each company', async () => {
    const progress = await (await api(`/api/campaigns/${campaignId}/progress`)).json();
    companyId = progress.per_company[0].company_id;

    const { report } = await (await api(`/api/companies/${companyId}`)).json();
    expect(report.score).toBeTruthy();
    expect(report.status_check).toBeTruthy();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.score.supporting_evidence.length).toBeGreaterThan(0);
  });

  it('renders the campaign, results and report pages', async () => {
    for (const path of [
      '/campaigns',
      `/campaigns/${campaignId}`,
      `/campaigns/${campaignId}/companies`,
      `/campaigns/${campaignId}/companies/${companyId}`,
      '/playbooks',
      '/settings',
    ]) {
      const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' });
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, path).toContain('Website Opportunity Engine');
    }
  }, 60_000);

  it('lets a reviewer approve a company', async () => {
    const res = await api(`/api/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: 'approved' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).company.review_status).toBe('approved');
  });

  it('lets a reviewer edit an outreach email, and marks it human-edited', async () => {
    const progress = await (await api(`/api/campaigns/${campaignId}/progress`)).json();

    let edited = false;
    for (const entry of progress.per_company) {
      const { report } = await (await api(`/api/companies/${entry.company_id}`)).json();
      if (report.messages.length === 0) continue;

      const message = report.messages[0];
      const res = await api(`/api/outreach/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ company_id: entry.company_id, subject: 'Edited by a human' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message.subject).toBe('Edited by a human');
      expect(json.message.edited_by_human).toBe(true);
      edited = true;
      break;
    }
    expect(edited, 'at least one company should have generated outreach').toBe(true);
  }, 60_000);

  it('exports a CSV with one row per company and intact multiline bodies', async () => {
    const res = await fetch(`${BASE}/api/campaigns/${campaignId}/export`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    // Read raw bytes: `Response.text()` strips a leading BOM, and the BOM is exactly
    // what makes Excel open the Arabic outreach columns correctly.
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const csv = await res.text();
    expect(csv).toContain('final_potential_score');
    expect(csv).toContain('Al Noor Dental Clinic');

    // Multiline email bodies must be quoted, not flattened.
    expect(csv).toMatch(/"[^"]*\n[^"]*"/);

    // Header row plus one row per company, counting only unquoted line breaks.
    const dataRows = splitCsvRows(csv).length - 1;
    const progress = await (await api(`/api/campaigns/${campaignId}/progress`)).json();
    expect(dataRows).toBe(progress.total_companies);
  }, 60_000);

  it('rejects access to a campaign the session does not own', async () => {
    const res = await api('/api/campaigns/00000000-0000-0000-0000-000000000000');
    expect([403, 404]).toContain(res.status);
  });
});

/** Split CSV into records, respecting quoted fields that contain newlines. */
function splitCsvRows(csv: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i]!;
    if (char === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && char === '\n') {
      rows.push(current.replace(/\r$/, ''));
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') rows.push(current);
  return rows.filter((r) => r.trim() !== '');
}
