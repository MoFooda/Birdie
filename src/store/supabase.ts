/**
 * Supabase-backed data store.
 *
 * Uses the service-role client and therefore only ever runs on the server. Row Level
 * Security in the migration protects the anon/authenticated path used by the browser;
 * this client deliberately bypasses RLS because the pipeline writes on behalf of jobs,
 * and every entry point above it has already checked campaign ownership.
 */

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditRun,
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
import type { DataStore, NewCampaign, NewCompany, NewContact, NewPlaybook } from './types';

export class SupabaseStore implements DataStore {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private table(name: string) {
    return this.client.from(name);
  }

  private static unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
    if (result.error) throw new Error(`${context}: ${result.error.message}`);
    if (result.data == null) throw new Error(`${context}: no data returned`);
    return result.data;
  }

  private static unwrapMaybe<T>(result: { data: T | null; error: { message: string } | null }, context: string): T | null {
    if (result.error && result.error.message !== 'JSON object requested, multiple (or no) rows returned') {
      throw new Error(`${context}: ${result.error.message}`);
    }
    return result.data;
  }

  // -- Campaigns -------------------------------------------------------------
  async listCampaigns(ownerId: string): Promise<Campaign[]> {
    const res = await this.table('campaigns').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
    return SupabaseStore.unwrap(res, 'listCampaigns') as Campaign[];
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const res = await this.table('campaigns').select('*').eq('id', id).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getCampaign') as Campaign | null;
  }

  async createCampaign(input: NewCampaign): Promise<Campaign> {
    const res = await this.table('campaigns').insert(input).select().single();
    return SupabaseStore.unwrap(res, 'createCampaign') as Campaign;
  }

  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
    const res = await this.table('campaigns')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'updateCampaign') as Campaign;
  }

  async getSettings(campaignId: string): Promise<CampaignSettings | null> {
    const res = await this.table('campaign_settings').select('*').eq('campaign_id', campaignId).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getSettings') as CampaignSettings | null;
  }

  async upsertSettings(settings: CampaignSettings): Promise<CampaignSettings> {
    const res = await this.table('campaign_settings')
      .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'campaign_id' })
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'upsertSettings') as CampaignSettings;
  }

  // -- Companies -------------------------------------------------------------
  async listCompanies(campaignId: string): Promise<Company[]> {
    const res = await this.table('companies').select('*').eq('campaign_id', campaignId).order('created_at');
    return SupabaseStore.unwrap(res, 'listCompanies') as Company[];
  }

  async getCompany(id: string): Promise<Company | null> {
    const res = await this.table('companies').select('*').eq('id', id).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getCompany') as Company | null;
  }

  async createCompanies(rows: NewCompany[]): Promise<Company[]> {
    if (rows.length === 0) return [];
    const res = await this.table('companies').insert(rows).select();
    return SupabaseStore.unwrap(res, 'createCompanies') as Company[];
  }

  async updateCompany(id: string, patch: Partial<Company>): Promise<Company> {
    const res = await this.table('companies')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'updateCompany') as Company;
  }

  async listContacts(companyId: string): Promise<Contact[]> {
    const res = await this.table('contacts').select('*').eq('company_id', companyId);
    return SupabaseStore.unwrap(res, 'listContacts') as Contact[];
  }

  async createContacts(rows: NewContact[]): Promise<Contact[]> {
    if (rows.length === 0) return [];
    const res = await this.table('contacts').insert(rows).select();
    return SupabaseStore.unwrap(res, 'createContacts') as Contact[];
  }

  // -- Playbooks -------------------------------------------------------------
  async listPlaybooks(): Promise<SectorPlaybook[]> {
    const res = await this.table('sector_playbooks').select('*').order('sector');
    return SupabaseStore.unwrap(res, 'listPlaybooks') as SectorPlaybook[];
  }

  async getPlaybook(id: string): Promise<SectorPlaybook | null> {
    const res = await this.table('sector_playbooks').select('*').eq('id', id).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getPlaybook') as SectorPlaybook | null;
  }

  async createPlaybook(input: NewPlaybook): Promise<SectorPlaybook> {
    const res = await this.table('sector_playbooks').insert(input).select().single();
    return SupabaseStore.unwrap(res, 'createPlaybook') as SectorPlaybook;
  }

  async updatePlaybook(id: string, patch: Partial<SectorPlaybook>): Promise<SectorPlaybook> {
    const current = await this.getPlaybook(id);
    if (!current) throw new Error(`playbook ${id} not found`);
    const contentChanged = Object.keys(patch).some((k) => !['approval_status', 'version', 'updated_at'].includes(k));
    const res = await this.table('sector_playbooks')
      .update({
        ...patch,
        version: contentChanged ? current.version + 1 : current.version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'updatePlaybook') as SectorPlaybook;
  }

  // -- Per-company analysis (replace-by-company keeps retries idempotent) -----
  private async replace<T extends object>(table: string, companyId: string, rows: T[]): Promise<unknown[]> {
    await this.table(table).delete().eq('company_id', companyId);
    if (rows.length === 0) return [];
    const res = await this.table(table).insert(rows).select();
    return SupabaseStore.unwrap(res, `replace ${table}`) as unknown[];
  }

  async saveStatusCheck(check: Omit<WebsiteStatusCheck, 'id'>): Promise<WebsiteStatusCheck> {
    const rows = (await this.replace('website_status_checks', check.company_id, [check])) as WebsiteStatusCheck[];
    return rows[0]!;
  }

  async getStatusCheck(companyId: string): Promise<WebsiteStatusCheck | null> {
    const res = await this.table('website_status_checks').select('*').eq('company_id', companyId).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getStatusCheck') as WebsiteStatusCheck | null;
  }

  async savePages(companyId: string, pages: Omit<WebsitePage, 'id' | 'company_id'>[]): Promise<WebsitePage[]> {
    return (await this.replace(
      'website_pages',
      companyId,
      pages.map((p) => ({ ...p, company_id: companyId })),
    )) as WebsitePage[];
  }

  async listPages(companyId: string): Promise<WebsitePage[]> {
    const res = await this.table('website_pages').select('*').eq('company_id', companyId);
    return SupabaseStore.unwrap(res, 'listPages') as WebsitePage[];
  }

  async saveFindings(
    companyId: string,
    findings: Omit<WebsiteFinding, 'id' | 'company_id'>[],
  ): Promise<WebsiteFinding[]> {
    return (await this.replace(
      'website_findings',
      companyId,
      findings.map((f) => ({ ...f, company_id: companyId })),
    )) as WebsiteFinding[];
  }

  async listFindings(companyId: string): Promise<WebsiteFinding[]> {
    const res = await this.table('website_findings').select('*').eq('company_id', companyId);
    return SupabaseStore.unwrap(res, 'listFindings') as WebsiteFinding[];
  }

  async saveCandidates(
    companyId: string,
    rows: Omit<CompetitorCandidate, 'id' | 'company_id'>[],
  ): Promise<CompetitorCandidate[]> {
    return (await this.replace(
      'competitor_candidates',
      companyId,
      rows.map((r) => ({ ...r, company_id: companyId })),
    )) as CompetitorCandidate[];
  }

  async listCandidates(companyId: string): Promise<CompetitorCandidate[]> {
    const res = await this.table('competitor_candidates').select('*').eq('company_id', companyId);
    return SupabaseStore.unwrap(res, 'listCandidates') as CompetitorCandidate[];
  }

  async saveCompetitors(companyId: string, rows: Omit<Competitor, 'id' | 'company_id'>[]): Promise<Competitor[]> {
    // Manual entries are preserved across re-runs of competitor discovery.
    await this.table('competitors').delete().eq('company_id', companyId).eq('source', 'discovered');
    if (rows.length === 0) return [];
    const res = await this.table('competitors')
      .insert(rows.map((r) => ({ ...r, company_id: companyId })))
      .select();
    return SupabaseStore.unwrap(res, 'saveCompetitors') as Competitor[];
  }

  async addCompetitor(companyId: string, row: Omit<Competitor, 'id' | 'company_id'>): Promise<Competitor> {
    const res = await this.table('competitors').insert({ ...row, company_id: companyId }).select().single();
    return SupabaseStore.unwrap(res, 'addCompetitor') as Competitor;
  }

  async listCompetitors(companyId: string): Promise<Competitor[]> {
    const res = await this.table('competitors').select('*').eq('company_id', companyId);
    return SupabaseStore.unwrap(res, 'listCompetitors') as Competitor[];
  }

  async saveScore(score: Omit<ScoreResult, 'id'>): Promise<ScoreResult> {
    const rows = (await this.replace('score_results', score.company_id, [score])) as ScoreResult[];
    return rows[0]!;
  }

  async getScore(companyId: string): Promise<ScoreResult | null> {
    const res = await this.table('score_results').select('*').eq('company_id', companyId).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getScore') as ScoreResult | null;
  }

  async saveOutreach(
    flow: Omit<OutreachFlow, 'id'>,
    messages: Omit<OutreachMessage, 'id' | 'flow_id'>[],
  ): Promise<{ flow: OutreachFlow; messages: OutreachMessage[] }> {
    const existing = await this.getOutreach(flow.company_id);
    if (existing.flow && (existing.flow.status === 'edited' || existing.flow.status === 'approved')) {
      return existing as { flow: OutreachFlow; messages: OutreachMessage[] };
    }

    await this.table('outreach_flows').delete().eq('company_id', flow.company_id);
    const flowRes = await this.table('outreach_flows').insert(flow).select().single();
    const flowRow = SupabaseStore.unwrap(flowRes, 'saveOutreach.flow') as OutreachFlow;

    if (messages.length === 0) return { flow: flowRow, messages: [] };
    const msgRes = await this.table('outreach_messages')
      .insert(messages.map((m) => ({ ...m, flow_id: flowRow.id })))
      .select();
    return { flow: flowRow, messages: SupabaseStore.unwrap(msgRes, 'saveOutreach.messages') as OutreachMessage[] };
  }

  async getOutreach(companyId: string): Promise<{ flow: OutreachFlow | null; messages: OutreachMessage[] }> {
    const flowRes = await this.table('outreach_flows').select('*').eq('company_id', companyId).maybeSingle();
    const flow = SupabaseStore.unwrapMaybe(flowRes, 'getOutreach') as OutreachFlow | null;
    if (!flow) return { flow: null, messages: [] };
    const msgRes = await this.table('outreach_messages').select('*').eq('flow_id', flow.id).order('step');
    return { flow, messages: SupabaseStore.unwrap(msgRes, 'getOutreach.messages') as OutreachMessage[] };
  }

  async updateOutreachMessage(id: string, patch: Partial<OutreachMessage>): Promise<OutreachMessage> {
    const res = await this.table('outreach_messages')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'updateOutreachMessage') as OutreachMessage;
  }

  async updateOutreachFlow(id: string, patch: Partial<OutreachFlow>): Promise<OutreachFlow> {
    const res = await this.table('outreach_flows')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'updateOutreachFlow') as OutreachFlow;
  }

  // -- Jobs ------------------------------------------------------------------
  async upsertAuditRun(run: Omit<AuditRun, 'id'> & { id?: string }): Promise<AuditRun> {
    const res = await this.table('audit_runs')
      .upsert(run, { onConflict: 'campaign_id,company_id' })
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'upsertAuditRun') as AuditRun;
  }

  async getAuditRun(companyId: string): Promise<AuditRun | null> {
    const res = await this.table('audit_runs').select('*').eq('company_id', companyId).maybeSingle();
    return SupabaseStore.unwrapMaybe(res, 'getAuditRun') as AuditRun | null;
  }

  async patchAuditRun(companyId: string, patch: Partial<AuditRun>): Promise<AuditRun> {
    const res = await this.table('audit_runs').update(patch).eq('company_id', companyId).select().single();
    return SupabaseStore.unwrap(res, 'patchAuditRun') as AuditRun;
  }

  async upsertJobRun(run: Omit<JobRun, 'id'> & { id?: string }): Promise<JobRun> {
    const res = await this.table('job_runs')
      .upsert(run, { onConflict: 'idempotency_key' })
      .select()
      .single();
    return SupabaseStore.unwrap(res, 'upsertJobRun') as JobRun;
  }

  async listJobRuns(campaignId: string): Promise<JobRun[]> {
    const res = await this.table('job_runs').select('*').eq('campaign_id', campaignId);
    return SupabaseStore.unwrap(res, 'listJobRuns') as JobRun[];
  }

  async listJobRunsForCompany(companyId: string): Promise<JobRun[]> {
    const res = await this.table('job_runs').select('*').eq('company_id', companyId);
    return SupabaseStore.unwrap(res, 'listJobRunsForCompany') as JobRun[];
  }

  async recordProviderUsage(usage: Omit<ProviderUsage, 'id' | 'created_at'>): Promise<void> {
    const res = await this.table('provider_usage').insert(usage);
    if (res.error) throw new Error(`recordProviderUsage: ${res.error.message}`);
  }

  async listProviderUsage(campaignId: string): Promise<ProviderUsage[]> {
    const res = await this.table('provider_usage').select('*').eq('campaign_id', campaignId);
    return SupabaseStore.unwrap(res, 'listProviderUsage') as ProviderUsage[];
  }

  // -- Aggregates ------------------------------------------------------------
  async getReport(companyId: string): Promise<CompanyReport | null> {
    const company = await this.getCompany(companyId);
    if (!company) return null;
    const [contacts, status_check, pages, findings, candidates, competitors, score, outreach, jobs] =
      await Promise.all([
        this.listContacts(companyId),
        this.getStatusCheck(companyId),
        this.listPages(companyId),
        this.listFindings(companyId),
        this.listCandidates(companyId),
        this.listCompetitors(companyId),
        this.getScore(companyId),
        this.getOutreach(companyId),
        this.listJobRunsForCompany(companyId),
      ]);
    return {
      company,
      contacts,
      status_check,
      pages,
      findings,
      candidates,
      competitors,
      score,
      flow: outreach.flow,
      messages: outreach.messages,
      jobs,
      playbook: company.playbook_id ? await this.getPlaybook(company.playbook_id) : null,
    };
  }

  async listReports(campaignId: string): Promise<CompanyReport[]> {
    const companies = await this.listCompanies(campaignId);
    return (await Promise.all(companies.map((c) => this.getReport(c.id)))).filter(
      (r): r is CompanyReport => r != null,
    );
  }
}
