/**
 * The data-access port.
 *
 * Two implementations satisfy it: an in-memory store (demo mode, no secrets required)
 * and a Supabase store. The pipeline and the UI only ever see this interface, which is
 * what lets demo mode exercise the real code paths rather than a parallel fake app.
 *
 * Write methods that persist per-company analysis are *replace-by-company*, not append.
 * That is what makes a retried job idempotent: running `check-website-status` twice
 * leaves one status check, not two.
 */

import type {
  AuditRun,
  Campaign,
  CampaignSettings,
  Company,
  CompanyReport,
  CompetitorCandidate,
  Competitor,
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

export type NewCampaign = Omit<Campaign, 'id' | 'created_at' | 'updated_at'>;
export type NewCompany = Omit<Company, 'id' | 'created_at' | 'updated_at'>;
export type NewContact = Omit<Contact, 'id' | 'created_at'>;
export type NewPlaybook = Omit<SectorPlaybook, 'id' | 'created_at' | 'updated_at'>;

export interface DataStore {
  readonly kind: 'memory' | 'supabase';

  // Campaigns ---------------------------------------------------------------
  listCampaigns(ownerId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  createCampaign(input: NewCampaign): Promise<Campaign>;
  updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign>;
  getSettings(campaignId: string): Promise<CampaignSettings | null>;
  upsertSettings(settings: CampaignSettings): Promise<CampaignSettings>;

  // Companies and contacts ---------------------------------------------------
  listCompanies(campaignId: string): Promise<Company[]>;
  getCompany(id: string): Promise<Company | null>;
  createCompanies(rows: NewCompany[]): Promise<Company[]>;
  updateCompany(id: string, patch: Partial<Company>): Promise<Company>;
  listContacts(companyId: string): Promise<Contact[]>;
  createContacts(rows: NewContact[]): Promise<Contact[]>;

  // Playbooks ----------------------------------------------------------------
  listPlaybooks(): Promise<SectorPlaybook[]>;
  getPlaybook(id: string): Promise<SectorPlaybook | null>;
  createPlaybook(input: NewPlaybook): Promise<SectorPlaybook>;
  updatePlaybook(id: string, patch: Partial<SectorPlaybook>): Promise<SectorPlaybook>;

  // Per-company analysis (replace-by-company) --------------------------------
  saveStatusCheck(check: Omit<WebsiteStatusCheck, 'id'>): Promise<WebsiteStatusCheck>;
  getStatusCheck(companyId: string): Promise<WebsiteStatusCheck | null>;
  savePages(companyId: string, pages: Omit<WebsitePage, 'id' | 'company_id'>[]): Promise<WebsitePage[]>;
  listPages(companyId: string): Promise<WebsitePage[]>;
  saveFindings(companyId: string, findings: Omit<WebsiteFinding, 'id' | 'company_id'>[]): Promise<WebsiteFinding[]>;
  listFindings(companyId: string): Promise<WebsiteFinding[]>;
  saveCandidates(companyId: string, rows: Omit<CompetitorCandidate, 'id' | 'company_id'>[]): Promise<CompetitorCandidate[]>;
  listCandidates(companyId: string): Promise<CompetitorCandidate[]>;
  saveCompetitors(companyId: string, rows: Omit<Competitor, 'id' | 'company_id'>[]): Promise<Competitor[]>;
  addCompetitor(companyId: string, row: Omit<Competitor, 'id' | 'company_id'>): Promise<Competitor>;
  listCompetitors(companyId: string): Promise<Competitor[]>;
  saveScore(score: Omit<ScoreResult, 'id'>): Promise<ScoreResult>;
  getScore(companyId: string): Promise<ScoreResult | null>;
  saveOutreach(
    flow: Omit<OutreachFlow, 'id'>,
    messages: Omit<OutreachMessage, 'id' | 'flow_id'>[],
  ): Promise<{ flow: OutreachFlow; messages: OutreachMessage[] }>;
  getOutreach(companyId: string): Promise<{ flow: OutreachFlow | null; messages: OutreachMessage[] }>;
  updateOutreachMessage(id: string, patch: Partial<OutreachMessage>): Promise<OutreachMessage>;
  updateOutreachFlow(id: string, patch: Partial<OutreachFlow>): Promise<OutreachFlow>;

  // Jobs and telemetry -------------------------------------------------------
  upsertAuditRun(run: Omit<AuditRun, 'id'> & { id?: string }): Promise<AuditRun>;
  getAuditRun(companyId: string): Promise<AuditRun | null>;
  /** Merge into the existing audit run without clearing fields written by other steps. */
  patchAuditRun(companyId: string, patch: Partial<AuditRun>): Promise<AuditRun>;
  upsertJobRun(run: Omit<JobRun, 'id'> & { id?: string }): Promise<JobRun>;
  listJobRuns(campaignId: string): Promise<JobRun[]>;
  listJobRunsForCompany(companyId: string): Promise<JobRun[]>;
  recordProviderUsage(usage: Omit<ProviderUsage, 'id' | 'created_at'>): Promise<void>;
  listProviderUsage(campaignId: string): Promise<ProviderUsage[]>;

  // Aggregates ---------------------------------------------------------------
  getReport(companyId: string): Promise<CompanyReport | null>;
  listReports(campaignId: string): Promise<CompanyReport[]>;
}
