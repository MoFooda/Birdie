/**
 * Apollo CSV column mapping and import validation.
 *
 * Apollo exports vary between accounts and saved views, so column names are suggested
 * automatically and then confirmed by the user. Validation never silently drops a row:
 * every row comes back with its issues attached so the import screen can show exactly
 * what is valid, what is missing a website, what is a duplicate and what needs a look.
 */

import { companyNameKey, normalizeDomain } from './domain';

export const CSV_FIELD_KEYS = [
  'company_name',
  'website',
  'sector',
  'description',
  'employee_count',
  'country',
  'city',
  'company_linkedin_url',
  'first_name',
  'last_name',
  'job_title',
  'email',
  'phone',
  'contact_linkedin_url',
  'apollo_contact_id',
  'apollo_company_id',
  'whatsapp_consent',
] as const;

export type CsvFieldKey = (typeof CSV_FIELD_KEYS)[number];

export interface CsvFieldSpec {
  key: CsvFieldKey;
  label: string;
  /** Only these three are needed to run the website analysis. */
  required: boolean;
  aliases: string[];
}

export const CSV_FIELDS: CsvFieldSpec[] = [
  { key: 'company_name', label: 'Company name', required: true, aliases: ['company', 'company name', 'account name', 'organization', 'organization name', 'account'] },
  { key: 'website', label: 'Website / domain', required: true, aliases: ['website', 'company website', 'domain', 'website url', 'url', 'company domain', 'primary domain'] },
  { key: 'sector', label: 'Sector / industry', required: true, aliases: ['industry', 'sector', 'company industry', 'apollo industry', 'industries'] },
  { key: 'description', label: 'Company description', required: false, aliases: ['description', 'short description', 'company description', 'seo description', 'keywords'] },
  { key: 'employee_count', label: 'Employee count', required: false, aliases: ['# employees', 'employees', 'employee count', 'num employees', 'headcount', 'company size'] },
  { key: 'country', label: 'Country', required: false, aliases: ['country', 'company country', 'company location'] },
  { key: 'city', label: 'City', required: false, aliases: ['city', 'company city', 'company address'] },
  { key: 'company_linkedin_url', label: 'Company LinkedIn URL', required: false, aliases: ['company linkedin url', 'company linkedin', 'organization linkedin'] },
  { key: 'first_name', label: 'Contact first name', required: false, aliases: ['first name', 'firstname', 'contact first name'] },
  { key: 'last_name', label: 'Contact last name', required: false, aliases: ['last name', 'lastname', 'contact last name'] },
  { key: 'job_title', label: 'Job title', required: false, aliases: ['title', 'job title', 'position', 'contact title'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'email address', 'work email', 'primary email'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'mobile phone', 'work direct phone', 'corporate phone', 'phone number'] },
  { key: 'contact_linkedin_url', label: 'Contact LinkedIn URL', required: false, aliases: ['person linkedin url', 'contact linkedin url', 'linkedin url', 'linkedin'] },
  { key: 'apollo_contact_id', label: 'Apollo contact ID', required: false, aliases: ['apollo contact id', 'contact id', 'id'] },
  { key: 'apollo_company_id', label: 'Apollo company ID', required: false, aliases: ['apollo account id', 'account id', 'company id', 'organization id'] },
  { key: 'whatsapp_consent', label: 'WhatsApp consent', required: false, aliases: ['whatsapp consent', 'whatsapp opt in', 'whatsapp_opt_in', 'consent'] },
];

export type CsvMapping = Partial<Record<CsvFieldKey, string>>;

const norm = (h: string) => h.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');

/** Best-effort automatic column mapping; the user confirms or overrides it in the UI. */
export function suggestMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const used = new Set<string>();

  for (const field of CSV_FIELDS) {
    const exact = headers.find((h) => !used.has(h) && field.aliases.includes(norm(h)));
    if (exact) {
      mapping[field.key] = exact;
      used.add(exact);
      continue;
    }
    const partial = headers.find(
      (h) => !used.has(h) && field.aliases.some((a) => norm(h).includes(a) || a.includes(norm(h))),
    );
    if (partial) {
      mapping[field.key] = partial;
      used.add(partial);
    }
  }
  return mapping;
}

export const IMPORT_ISSUES = [
  'missing_company_name',
  'missing_website',
  'invalid_domain',
  'missing_sector',
  'duplicate_domain',
  'duplicate_company_name',
  'invalid_email',
  'social_profile_instead_of_website',
] as const;
export type ImportIssue = (typeof IMPORT_ISSUES)[number];

export const IMPORT_ISSUE_LABELS: Record<ImportIssue, string> = {
  missing_company_name: 'Missing company name',
  missing_website: 'Missing website',
  invalid_domain: 'Invalid domain',
  missing_sector: 'Missing sector',
  duplicate_domain: 'Duplicate domain',
  duplicate_company_name: 'Duplicate company name',
  invalid_email: 'Invalid email',
  social_profile_instead_of_website: 'Social profile used as website',
};

export interface ParsedImportRow {
  row_number: number;
  company_name: string;
  submitted_website: string | null;
  normalized_domain: string | null;
  sector: string | null;
  description: string | null;
  employee_count: number | null;
  country: string | null;
  city: string | null;
  company_linkedin_url: string | null;
  apollo_company_id: string | null;
  contact: {
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    apollo_contact_id: string | null;
    whatsapp_consent: boolean;
  };
  issues: ImportIssue[];
  /** `error` rows cannot be imported; `needs_review` rows import but are flagged. */
  status: 'valid' | 'needs_review' | 'error';
}

export interface ImportValidationResult {
  rows: ParsedImportRow[];
  summary: {
    total: number;
    valid: number;
    needs_review: number;
    errors: number;
    missing_website: number;
    duplicates: number;
    invalid_domains: number;
    missing_sector: number;
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function pick(row: Record<string, string>, mapping: CsvMapping, key: CsvFieldKey): string | null {
  const column = mapping[key];
  if (!column) return null;
  const value = row[column];
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'consented', 'opted in', 'opt-in']);

export function validateImport(
  rawRows: Record<string, string>[],
  mapping: CsvMapping,
  /** Domains already present in the campaign, so re-imports do not create duplicates. */
  existingDomains: string[] = [],
  existingNameKeys: string[] = [],
): ImportValidationResult {
  const seenDomains = new Map<string, number>();
  const seenNames = new Map<string, number>();
  for (const d of existingDomains) seenDomains.set(d, 0);
  for (const n of existingNameKeys) seenNames.set(n, 0);

  const rows: ParsedImportRow[] = rawRows.map((raw, i) => {
    const issues: ImportIssue[] = [];
    const company_name = pick(raw, mapping, 'company_name') ?? '';
    if (company_name === '') issues.push('missing_company_name');

    const submitted_website = pick(raw, mapping, 'website');
    let normalized_domain: string | null = null;
    if (!submitted_website) {
      issues.push('missing_website');
    } else {
      const n = normalizeDomain(submitted_website);
      if (n.ok) {
        normalized_domain = n.domain;
      } else if (n.reason === 'is_social_profile') {
        issues.push('social_profile_instead_of_website');
      } else {
        issues.push('invalid_domain');
      }
    }

    const sector = pick(raw, mapping, 'sector');
    if (!sector) issues.push('missing_sector');

    const email = pick(raw, mapping, 'email');
    if (email && !EMAIL_RE.test(email)) issues.push('invalid_email');

    const nameKey = company_name ? companyNameKey(company_name) : '';
    if (normalized_domain) {
      if (seenDomains.has(normalized_domain)) issues.push('duplicate_domain');
      else seenDomains.set(normalized_domain, i);
    } else if (nameKey) {
      if (seenNames.has(nameKey)) issues.push('duplicate_company_name');
      else seenNames.set(nameKey, i);
    }

    const employeeRaw = pick(raw, mapping, 'employee_count');
    const employee_count = employeeRaw ? Number(employeeRaw.replace(/[^\d]/g, '')) || null : null;

    const consentRaw = pick(raw, mapping, 'whatsapp_consent');

    const blocking = issues.some(
      (x) => x === 'missing_company_name' || x === 'duplicate_domain' || x === 'duplicate_company_name',
    );
    const reviewNeeded = issues.length > 0;

    return {
      row_number: i + 1,
      company_name,
      submitted_website,
      normalized_domain,
      sector,
      description: pick(raw, mapping, 'description'),
      employee_count,
      country: pick(raw, mapping, 'country'),
      city: pick(raw, mapping, 'city'),
      company_linkedin_url: pick(raw, mapping, 'company_linkedin_url'),
      apollo_company_id: pick(raw, mapping, 'apollo_company_id'),
      contact: {
        first_name: pick(raw, mapping, 'first_name'),
        last_name: pick(raw, mapping, 'last_name'),
        job_title: pick(raw, mapping, 'job_title'),
        email,
        phone: pick(raw, mapping, 'phone'),
        linkedin_url: pick(raw, mapping, 'contact_linkedin_url'),
        apollo_contact_id: pick(raw, mapping, 'apollo_contact_id'),
        whatsapp_consent: consentRaw ? TRUTHY.has(consentRaw.toLowerCase()) : false,
      },
      issues,
      status: blocking ? 'error' : reviewNeeded ? 'needs_review' : 'valid',
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((r) => r.status === 'valid').length,
      needs_review: rows.filter((r) => r.status === 'needs_review').length,
      errors: rows.filter((r) => r.status === 'error').length,
      missing_website: rows.filter((r) => r.issues.includes('missing_website')).length,
      duplicates: rows.filter(
        (r) => r.issues.includes('duplicate_domain') || r.issues.includes('duplicate_company_name'),
      ).length,
      invalid_domains: rows.filter(
        (r) => r.issues.includes('invalid_domain') || r.issues.includes('social_profile_instead_of_website'),
      ).length,
      missing_sector: rows.filter((r) => r.issues.includes('missing_sector')).length,
    },
  };
}

/** Required columns that the user has not mapped yet. */
export function missingRequiredMappings(mapping: CsvMapping): CsvFieldSpec[] {
  return CSV_FIELDS.filter((f) => f.required && !mapping[f.key]);
}
