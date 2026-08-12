/**
 * Regenerates `samples/apollo-sample.csv` from the demo dataset, so the sample export and
 * the fixtures can never drift apart.
 *
 *   npm run sample:csv
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEMO_COMPANIES } from '../src/fixtures/data.ts';

const HEADERS = [
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

function escape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const rows = DEMO_COMPANIES.map((c) =>
  [
    c.name,
    c.website,
    c.sector,
    c.description,
    String(c.employee_count),
    c.country,
    c.city,
    c.linkedin_url,
    c.contact.first_name,
    c.contact.last_name,
    c.contact.job_title,
    c.contact.email,
    c.contact.phone,
    c.contact.linkedin_url,
    c.contact.apollo_contact_id,
    c.apollo_company_id,
    c.contact.whatsapp_consent ? 'yes' : 'no',
  ].map(escape),
);

// A deliberately broken tail so the import screen has something to flag: a duplicate,
// a row with no company name, a social profile in the website column, and a bad domain.
const extras = [
  ['Al Noor Dental Clinic', 'https://www.alnoordental.ae/', 'Hospital & Health Care', 'Duplicate row, same domain as an earlier one.', '24', 'United Arab Emirates', 'Dubai', '', 'Hana', 'Al Rashid', 'Practice Manager', 'hana@alnoordental.ae', '', '', 'apollo_ct_9001', 'apollo_co_1001', 'yes'],
  ['', 'orphanrow.com', 'Retail', 'No company name, so this row cannot be imported.', '5', 'Egypt', 'Cairo', '', '', '', '', '', '', '', 'apollo_ct_9002', 'apollo_co_9002', 'no'],
  ['Social Only Trading', 'https://www.facebook.com/socialonlytrading', 'Retail', 'Uses a Facebook page instead of a website.', '12', 'United Arab Emirates', 'Dubai', '', 'Mo', 'Idris', 'Owner', 'mo@socialonly.ae', '+971 4 555 0244', '', 'apollo_ct_9003', 'apollo_co_9003', 'no'],
  ['Broken Domain Co', 'not a website', '', 'Unparseable website and no sector.', '8', 'Egypt', 'Cairo', '', 'Sami', 'Nabil', 'Manager', 'sami@brokendomain', '', '', 'apollo_ct_9004', 'apollo_co_9004', 'no'],
].map((row) => row.map(escape));

const csv = `﻿${[HEADERS.map(escape).join(','), ...[...rows, ...extras].map((r) => r.join(','))].join('\r\n')}\r\n`;

const outPath = resolve(import.meta.dirname, '../samples/apollo-sample.csv');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, csv, 'utf8');

console.log(`Wrote ${rows.length + extras.length} rows to ${outPath}`);
