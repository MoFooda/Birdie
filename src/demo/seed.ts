/**
 * Demo seeding.
 *
 * Creates a campaign and imports the twelve fixture companies through the *same* import
 * path the CSV upload uses, so the demo exercises mapping, validation and duplicate
 * detection rather than injecting rows behind them.
 */

import type { CampaignSettings } from '@/core/types';
import type { DataStore } from '@/store/types';
import { DEMO_COMPANIES } from '@/fixtures/data';
import { suggestMapping, validateImport } from '@/core/csv-mapping';
import { importRows } from '@/core/import';

/** A real UUID: with Supabase configured this is inserted into `users`, whose id is a uuid column. */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_USER_EMAIL = 'demo@opportunity-engine.local';

export const DEMO_SETTINGS: Omit<CampaignSettings, 'campaign_id' | 'updated_at'> = {
  target_geography: 'United Arab Emirates',
  target_sectors: ['Healthcare', 'Retail', 'Professional Services', 'Manufacturing', 'Hospitality', 'Technology'],
  agency_service: 'Website design and rebuild, with conversion-focused landing pages',
  agency_value_proposition:
    'We rebuild websites around the one action a visitor actually needs to take, and we can usually ship a first version in four weeks.',
  sender_name: 'Nadia Sami',
  sender_role: 'Founder',
  sender_company: 'Birdie MENA',
  outreach_language: 'en',
  outreach_tone: 'consultative',
  preferred_cta: 'Worth a 15-minute call to walk through what we found?',
  competitors_to_analyze: 3,
  min_score_for_outreach: 40,
};

/** CSV column headers matching a real Apollo export. */
export const DEMO_CSV_HEADERS = [
  'Company',
  'Website',
  'Industry',
  'Short Description',
  '# Employees',
  'Country',
  'City',
  'Company Linkedin Url',
  'First Name',
  'Last Name',
  'Title',
  'Email',
  'Work Direct Phone',
  'Person Linkedin Url',
  'Apollo Contact Id',
  'Apollo Account Id',
  'WhatsApp Consent',
];

export function demoCsvRows(): Record<string, string>[] {
  return DEMO_COMPANIES.map((c) => ({
    Company: c.name,
    Website: c.website,
    Industry: c.sector,
    'Short Description': c.description,
    '# Employees': String(c.employee_count),
    Country: c.country,
    City: c.city,
    'Company Linkedin Url': c.linkedin_url,
    'First Name': c.contact.first_name,
    'Last Name': c.contact.last_name,
    Title: c.contact.job_title,
    Email: c.contact.email,
    'Work Direct Phone': c.contact.phone,
    'Person Linkedin Url': c.contact.linkedin_url,
    'Apollo Contact Id': c.contact.apollo_contact_id,
    'Apollo Account Id': c.apollo_company_id,
    'WhatsApp Consent': c.contact.whatsapp_consent ? 'yes' : 'no',
  }));
}

export interface SeededDemo {
  campaignId: string;
  companyCount: number;
}

export async function seedDemoCampaign(
  store: DataStore,
  options: { name?: string; ownerId?: string } = {},
): Promise<SeededDemo> {
  const campaign = await store.createCampaign({
    owner_id: options.ownerId ?? DEMO_USER_ID,
    name: options.name ?? 'Demo campaign — UAE website opportunities',
    status: 'draft',
  });

  await store.upsertSettings({
    ...DEMO_SETTINGS,
    campaign_id: campaign.id,
    updated_at: new Date().toISOString(),
  });

  const rows = demoCsvRows();
  const mapping = suggestMapping(DEMO_CSV_HEADERS);
  const validation = validateImport(rows, mapping);
  const result = await importRows(store, campaign.id, validation.rows);

  await store.updateCampaign(campaign.id, { status: 'ready' });

  return { campaignId: campaign.id, companyCount: result.imported };
}
