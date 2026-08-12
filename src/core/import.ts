/**
 * Turning validated CSV rows into companies and contacts.
 *
 * Rows that failed validation with a blocking issue are never written. Rows with
 * non-blocking issues (missing website, missing sector, invalid domain) *are* imported —
 * a company with no website is one of the strongest opportunities in this product — but
 * they carry their issues forward and are flagged for review.
 */

import type { DataStore, NewCompany, NewContact } from '@/store/types';
import type { ParsedImportRow } from './csv-mapping';

export interface ImportResult {
  imported: number;
  skipped: number;
  company_ids: string[];
}

export async function importRows(
  store: DataStore,
  campaignId: string,
  rows: ParsedImportRow[],
): Promise<ImportResult> {
  const importable = rows.filter((r) => r.status !== 'error');

  const companies: NewCompany[] = importable.map((r) => ({
    campaign_id: campaignId,
    name: r.company_name,
    submitted_website: r.submitted_website,
    normalized_domain: r.normalized_domain,
    apollo_sector: r.sector,
    description: r.description,
    employee_count: r.employee_count,
    country: r.country,
    city: r.city,
    linkedin_url: r.company_linkedin_url,
    apollo_company_id: r.apollo_company_id,
    import_issues: r.issues,
    needs_manual_review: r.status === 'needs_review',
    pipeline_status: 'pending',
    review_status: 'unreviewed',
    sector: null,
    sub_sector: null,
    business_model: null,
    customer_type: null,
    expected_website_role: null,
    sector_confidence: null,
    sector_evidence: [],
    playbook_id: null,
  }));

  const created = await store.createCompanies(companies);

  const contacts: NewContact[] = [];
  created.forEach((company, index) => {
    const row = importable[index]!;
    const c = row.contact;
    const hasContact = c.first_name || c.last_name || c.email || c.phone;
    if (!hasContact) return;
    contacts.push({
      company_id: company.id,
      first_name: c.first_name,
      last_name: c.last_name,
      job_title: c.job_title,
      email: c.email,
      phone: c.phone,
      linkedin_url: c.linkedin_url,
      apollo_contact_id: c.apollo_contact_id,
      whatsapp_consent: c.whatsapp_consent,
    });
  });

  if (contacts.length > 0) await store.createContacts(contacts);

  return {
    imported: created.length,
    skipped: rows.length - importable.length,
    company_ids: created.map((c) => c.id),
  };
}
