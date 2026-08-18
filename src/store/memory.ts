/**
 * In-memory data store.
 *
 * Backs demo mode and the test suite. State is optionally mirrored to a JSON file so a
 * local `next dev` session survives a reload; set `DEMO_PERSIST=false` (tests do) to keep
 * it purely in-process.
 *
 * This is not a production store: it holds everything in one process. Running demo mode
 * on a multi-instance host will give each instance its own state — documented in the
 * README under known limitations.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  AuditRun,
  UserRecord,
  Campaign,
  CampaignSettings,
  Company,
  CompanyReport,
  Competitor,
  CompetitorCandidate,
  Contact,
  JobRun,
  OutreachFlow,
  OutreachMessage,
  ProviderUsage,
  ScoreResult,
  SectorPlaybook,
  WebsiteFinding,
  WebsitePage,
  WebsiteStatusCheck,
} from '@/core/types';
import { SEED_PLAYBOOKS } from '@/core/playbooks';
import type { DataStore, NewCampaign, NewCompany, NewContact, NewPlaybook } from './types';

interface Db {
  users: UserRecord[];
  campaigns: Campaign[];
  settings: CampaignSettings[];
  companies: Company[];
  contacts: Contact[];
  playbooks: SectorPlaybook[];
  statusChecks: WebsiteStatusCheck[];
  pages: WebsitePage[];
  findings: WebsiteFinding[];
  candidates: CompetitorCandidate[];
  competitors: Competitor[];
  scores: ScoreResult[];
  flows: OutreachFlow[];
  messages: OutreachMessage[];
  auditRuns: AuditRun[];
  jobRuns: JobRun[];
  usage: ProviderUsage[];
}

const now = () => new Date().toISOString();

function emptyDb(): Db {
  return {
    users: [],
    campaigns: [],
    settings: [],
    companies: [],
    contacts: [],
    playbooks: SEED_PLAYBOOKS.map((p) => ({ ...p, id: randomUUID(), created_at: now(), updated_at: now() })),
    statusChecks: [],
    pages: [],
    findings: [],
    candidates: [],
    competitors: [],
    scores: [],
    flows: [],
    messages: [],
    auditRuns: [],
    jobRuns: [],
    usage: [],
  };
}

export class MemoryStore implements DataStore {
  readonly kind = 'memory' as const;
  private db: Db;
  private readonly file: string | null;
  /** Serialises writes so concurrent per-company jobs cannot interleave a flush. */
  private queue: Promise<void> = Promise.resolve();

  constructor(options: { file?: string | null } = {}) {
    this.file = options.file === undefined ? defaultFile() : options.file;
    this.db = this.load();
  }

  private load(): Db {
    if (this.file && existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Db>;
        return { ...emptyDb(), ...parsed };
      } catch {
        // A corrupt demo file should not brick the app; start clean instead.
      }
    }
    return emptyDb();
  }

  private flush(): void {
    if (!this.file) return;
    this.queue = this.queue.then(async () => {
      try {
        mkdirSync(dirname(this.file!), { recursive: true });
        writeFileSync(this.file!, JSON.stringify(this.db), 'utf8');
      } catch {
        // Persistence is a convenience; losing it must not fail a request.
      }
    });
  }

  /** Test helper: drop everything and re-seed playbooks. */
  reset(): void {
    this.db = emptyDb();
    this.flush();
  }

  async ensureUser(id: string, email: string, fullName: string | null = null): Promise<void> {
    if (this.db.users.some((u) => u.id === id)) return;
    this.db.users.push({ id, email, full_name: fullName, role: 'member', created_at: now() });
    this.flush();
  }

  // -- Campaigns -------------------------------------------------------------
  async listCampaigns(ownerId: string): Promise<Campaign[]> {
    return this.db.campaigns
      .filter((c) => c.owner_id === ownerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return this.db.campaigns.find((c) => c.id === id) ?? null;
  }

  async createCampaign(input: NewCampaign): Promise<Campaign> {
    const campaign: Campaign = { ...input, id: randomUUID(), created_at: now(), updated_at: now() };
    this.db.campaigns.push(campaign);
    this.flush();
    return campaign;
  }

  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
    const idx = this.db.campaigns.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error(`campaign ${id} not found`);
    const updated = { ...this.db.campaigns[idx]!, ...patch, updated_at: now() };
    this.db.campaigns[idx] = updated;
    this.flush();
    return updated;
  }

  async getSettings(campaignId: string): Promise<CampaignSettings | null> {
    return this.db.settings.find((s) => s.campaign_id === campaignId) ?? null;
  }

  async upsertSettings(settings: CampaignSettings): Promise<CampaignSettings> {
    const idx = this.db.settings.findIndex((s) => s.campaign_id === settings.campaign_id);
    const row = { ...settings, updated_at: now() };
    if (idx >= 0) this.db.settings[idx] = row;
    else this.db.settings.push(row);
    this.flush();
    return row;
  }

  // -- Companies -------------------------------------------------------------
  async listCompanies(campaignId: string): Promise<Company[]> {
    return this.db.companies
      .filter((c) => c.campaign_id === campaignId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getCompany(id: string): Promise<Company | null> {
    return this.db.companies.find((c) => c.id === id) ?? null;
  }

  async createCompanies(rows: NewCompany[]): Promise<Company[]> {
    const created = rows.map((r) => ({ ...r, id: randomUUID(), created_at: now(), updated_at: now() }));
    this.db.companies.push(...created);
    this.flush();
    return created;
  }

  async updateCompany(id: string, patch: Partial<Company>): Promise<Company> {
    const idx = this.db.companies.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error(`company ${id} not found`);
    const updated = { ...this.db.companies[idx]!, ...patch, updated_at: now() };
    this.db.companies[idx] = updated;
    this.flush();
    return updated;
  }

  async listContacts(companyId: string): Promise<Contact[]> {
    return this.db.contacts.filter((c) => c.company_id === companyId);
  }

  async createContacts(rows: NewContact[]): Promise<Contact[]> {
    const created = rows.map((r) => ({ ...r, id: randomUUID(), created_at: now() }));
    this.db.contacts.push(...created);
    this.flush();
    return created;
  }

  // -- Playbooks -------------------------------------------------------------
  async listPlaybooks(): Promise<SectorPlaybook[]> {
    return [...this.db.playbooks].sort((a, b) => a.sector.localeCompare(b.sector));
  }

  async getPlaybook(id: string): Promise<SectorPlaybook | null> {
    return this.db.playbooks.find((p) => p.id === id) ?? null;
  }

  async createPlaybook(input: NewPlaybook): Promise<SectorPlaybook> {
    const row: SectorPlaybook = { ...input, id: randomUUID(), created_at: now(), updated_at: now() };
    this.db.playbooks.push(row);
    this.flush();
    return row;
  }

  async updatePlaybook(id: string, patch: Partial<SectorPlaybook>): Promise<SectorPlaybook> {
    const idx = this.db.playbooks.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`playbook ${id} not found`);
    // Any content change bumps the version so a scored company can be traced to the
    // exact playbook revision that produced its sector importance.
    const previous = this.db.playbooks[idx]!;
    const contentChanged = Object.keys(patch).some(
      (k) => !['approval_status', 'version', 'updated_at'].includes(k),
    );
    const updated: SectorPlaybook = {
      ...previous,
      ...patch,
      version: contentChanged ? previous.version + 1 : previous.version,
      updated_at: now(),
    };
    this.db.playbooks[idx] = updated;
    this.flush();
    return updated;
  }

  // -- Per-company analysis --------------------------------------------------
  async saveStatusCheck(check: Omit<WebsiteStatusCheck, 'id'>): Promise<WebsiteStatusCheck> {
    this.db.statusChecks = this.db.statusChecks.filter((c) => c.company_id !== check.company_id);
    const row = { ...check, id: randomUUID() };
    this.db.statusChecks.push(row);
    this.flush();
    return row;
  }

  async getStatusCheck(companyId: string): Promise<WebsiteStatusCheck | null> {
    return this.db.statusChecks.find((c) => c.company_id === companyId) ?? null;
  }

  async savePages(companyId: string, pages: Omit<WebsitePage, 'id' | 'company_id'>[]): Promise<WebsitePage[]> {
    this.db.pages = this.db.pages.filter((p) => p.company_id !== companyId);
    const rows = pages.map((p) => ({ ...p, id: randomUUID(), company_id: companyId }));
    this.db.pages.push(...rows);
    this.flush();
    return rows;
  }

  async listPages(companyId: string): Promise<WebsitePage[]> {
    return this.db.pages.filter((p) => p.company_id === companyId);
  }

  async saveFindings(
    companyId: string,
    findings: Omit<WebsiteFinding, 'id' | 'company_id'>[],
  ): Promise<WebsiteFinding[]> {
    this.db.findings = this.db.findings.filter((f) => f.company_id !== companyId);
    const rows = findings.map((f) => ({ ...f, id: randomUUID(), company_id: companyId }));
    this.db.findings.push(...rows);
    this.flush();
    return rows;
  }

  async listFindings(companyId: string): Promise<WebsiteFinding[]> {
    return this.db.findings.filter((f) => f.company_id === companyId);
  }

  async saveCandidates(
    companyId: string,
    rows: Omit<CompetitorCandidate, 'id' | 'company_id'>[],
  ): Promise<CompetitorCandidate[]> {
    this.db.candidates = this.db.candidates.filter((c) => c.company_id !== companyId);
    const created = rows.map((r) => ({ ...r, id: randomUUID(), company_id: companyId }));
    this.db.candidates.push(...created);
    this.flush();
    return created;
  }

  async listCandidates(companyId: string): Promise<CompetitorCandidate[]> {
    return this.db.candidates.filter((c) => c.company_id === companyId);
  }

  async saveCompetitors(
    companyId: string,
    rows: Omit<Competitor, 'id' | 'company_id'>[],
  ): Promise<Competitor[]> {
    // Manually added competitors survive a re-run of the discovery step.
    const manual = this.db.competitors.filter((c) => c.company_id === companyId && c.source === 'manual');
    this.db.competitors = this.db.competitors.filter((c) => c.company_id !== companyId);
    const created = rows.map((r) => ({ ...r, id: randomUUID(), company_id: companyId }));
    this.db.competitors.push(...manual, ...created);
    this.flush();
    return created;
  }

  async addCompetitor(companyId: string, row: Omit<Competitor, 'id' | 'company_id'>): Promise<Competitor> {
    const created = { ...row, id: randomUUID(), company_id: companyId };
    this.db.competitors.push(created);
    this.flush();
    return created;
  }

  async listCompetitors(companyId: string): Promise<Competitor[]> {
    return this.db.competitors.filter((c) => c.company_id === companyId);
  }

  async saveScore(score: Omit<ScoreResult, 'id'>): Promise<ScoreResult> {
    this.db.scores = this.db.scores.filter((s) => s.company_id !== score.company_id);
    const row = { ...score, id: randomUUID() };
    this.db.scores.push(row);
    this.flush();
    return row;
  }

  async getScore(companyId: string): Promise<ScoreResult | null> {
    return this.db.scores.find((s) => s.company_id === companyId) ?? null;
  }

  async saveOutreach(
    flow: Omit<OutreachFlow, 'id'>,
    messages: Omit<OutreachMessage, 'id' | 'flow_id'>[],
  ): Promise<{ flow: OutreachFlow; messages: OutreachMessage[] }> {
    const existing = this.db.flows.filter((f) => f.company_id === flow.company_id);
    // A human edit is never overwritten by a re-run of the generation step.
    const edited = existing.some((f) => f.status === 'edited' || f.status === 'approved');
    if (edited) {
      const current = existing[0]!;
      return { flow: current, messages: this.db.messages.filter((m) => m.flow_id === current.id) };
    }

    const flowIds = new Set(existing.map((f) => f.id));
    this.db.flows = this.db.flows.filter((f) => f.company_id !== flow.company_id);
    this.db.messages = this.db.messages.filter((m) => !flowIds.has(m.flow_id));

    const flowRow: OutreachFlow = { ...flow, id: randomUUID() };
    const messageRows = messages.map((m) => ({ ...m, id: randomUUID(), flow_id: flowRow.id }));
    this.db.flows.push(flowRow);
    this.db.messages.push(...messageRows);
    this.flush();
    return { flow: flowRow, messages: messageRows };
  }

  async getOutreach(companyId: string): Promise<{ flow: OutreachFlow | null; messages: OutreachMessage[] }> {
    const flow = this.db.flows.find((f) => f.company_id === companyId) ?? null;
    return {
      flow,
      messages: flow
        ? this.db.messages.filter((m) => m.flow_id === flow.id).sort((a, b) => a.step - b.step)
        : [],
    };
  }

  async updateOutreachMessage(id: string, patch: Partial<OutreachMessage>): Promise<OutreachMessage> {
    const idx = this.db.messages.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error(`outreach message ${id} not found`);
    const updated = { ...this.db.messages[idx]!, ...patch, updated_at: now() };
    this.db.messages[idx] = updated;
    this.flush();
    return updated;
  }

  async updateOutreachFlow(id: string, patch: Partial<OutreachFlow>): Promise<OutreachFlow> {
    const idx = this.db.flows.findIndex((f) => f.id === id);
    if (idx < 0) throw new Error(`outreach flow ${id} not found`);
    const updated = { ...this.db.flows[idx]!, ...patch, updated_at: now() };
    this.db.flows[idx] = updated;
    this.flush();
    return updated;
  }

  // -- Jobs ------------------------------------------------------------------
  async upsertAuditRun(run: Omit<AuditRun, 'id'> & { id?: string }): Promise<AuditRun> {
    const idx = this.db.auditRuns.findIndex(
      (r) => (run.id && r.id === run.id) || (r.company_id === run.company_id && r.campaign_id === run.campaign_id),
    );
    const row: AuditRun = { ...run, id: run.id ?? (idx >= 0 ? this.db.auditRuns[idx]!.id : randomUUID()) };
    if (idx >= 0) this.db.auditRuns[idx] = row;
    else this.db.auditRuns.push(row);
    this.flush();
    return row;
  }

  async getAuditRun(companyId: string): Promise<AuditRun | null> {
    return this.db.auditRuns.find((r) => r.company_id === companyId) ?? null;
  }

  async patchAuditRun(companyId: string, patch: Partial<AuditRun>): Promise<AuditRun> {
    const idx = this.db.auditRuns.findIndex((r) => r.company_id === companyId);
    if (idx < 0) throw new Error(`audit run for company ${companyId} not found`);
    const updated = { ...this.db.auditRuns[idx]!, ...patch };
    this.db.auditRuns[idx] = updated;
    this.flush();
    return updated;
  }

  async upsertJobRun(run: Omit<JobRun, 'id'> & { id?: string }): Promise<JobRun> {
    // The idempotency key is (company, step): retries update the same row.
    const idx = this.db.jobRuns.findIndex((r) => r.idempotency_key === run.idempotency_key);
    const row: JobRun = { ...run, id: run.id ?? (idx >= 0 ? this.db.jobRuns[idx]!.id : randomUUID()) };
    if (idx >= 0) this.db.jobRuns[idx] = row;
    else this.db.jobRuns.push(row);
    this.flush();
    return row;
  }

  async listJobRuns(campaignId: string): Promise<JobRun[]> {
    return this.db.jobRuns.filter((r) => r.campaign_id === campaignId);
  }

  async listJobRunsForCompany(companyId: string): Promise<JobRun[]> {
    return this.db.jobRuns.filter((r) => r.company_id === companyId);
  }

  async recordProviderUsage(usage: Omit<ProviderUsage, 'id' | 'created_at'>): Promise<void> {
    this.db.usage.push({ ...usage, id: randomUUID(), created_at: now() });
    // Provider telemetry is unbounded by nature; keep the demo file from growing forever.
    if (this.db.usage.length > 2000) this.db.usage = this.db.usage.slice(-1000);
    this.flush();
  }

  async listProviderUsage(campaignId: string): Promise<ProviderUsage[]> {
    return this.db.usage.filter((u) => u.campaign_id === campaignId);
  }

  // -- Aggregates ------------------------------------------------------------
  async getReport(companyId: string): Promise<CompanyReport | null> {
    const company = await this.getCompany(companyId);
    if (!company) return null;
    const { flow, messages } = await this.getOutreach(companyId);
    return {
      company,
      contacts: await this.listContacts(companyId),
      status_check: await this.getStatusCheck(companyId),
      pages: await this.listPages(companyId),
      findings: await this.listFindings(companyId),
      candidates: await this.listCandidates(companyId),
      competitors: await this.listCompetitors(companyId),
      score: await this.getScore(companyId),
      flow,
      messages,
      jobs: await this.listJobRunsForCompany(companyId),
      playbook: company.playbook_id ? await this.getPlaybook(company.playbook_id) : null,
      audit_run: await this.getAuditRun(companyId),
    };
  }

  async listReports(campaignId: string): Promise<CompanyReport[]> {
    const companies = await this.listCompanies(campaignId);
    const reports: CompanyReport[] = [];
    for (const c of companies) {
      const report = await this.getReport(c.id);
      if (report) reports.push(report);
    }
    return reports;
  }
}

function defaultFile(): string | null {
  if (process.env.DEMO_PERSIST === 'false') return null;
  return resolve(process.env.DEMO_DATA_DIR ?? '.data', 'demo-store.json');
}
