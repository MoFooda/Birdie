/**
 * Regenerates `supabase/seed.sql` from `src/core/playbooks.ts`, so the seeded playbooks
 * and the ones the memory store uses can never drift apart.
 *
 *   npm run seed:sql
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SEED_PLAYBOOKS } from '../src/core/playbooks.ts';

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const array = (values: string[]) => `array[${values.map(quote).join(', ')}]::text[]`;

const rows = SEED_PLAYBOOKS.map(
  (p) => `  (
    ${quote(p.sector)},
    ${quote(p.sub_sector)},
    ${quote(p.business_model)}::business_model,
    ${p.website_importance_score},
    ${quote(p.expected_website_role)}::website_role,
    ${array(p.essential_pages)},
    ${array(p.essential_conversion_actions)},
    ${array(p.essential_trust_signals)},
    ${quote(p.common_customer_journey)},
    ${array(p.weak_website_signals)},
    ${array(p.rebuild_conditions)},
    ${array(p.targeted_improvement_conditions)},
    ${array(p.competitor_signals)},
    ${array(p.outreach_angles)},
    ${p.version},
    ${quote(p.approval_status)}::playbook_approval_status
  )`,
).join(',\n');

const sql = `-- Sector playbook seed data.
--
-- GENERATED FILE — do not edit by hand.
-- Source: src/core/playbooks.ts · Regenerate: npm run seed:sql
--
-- Scoring depends on approved playbooks existing, so run this after the migration:
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Re-running is safe: it updates existing rows in place rather than duplicating them,
-- and bumps their version so a scored company can be traced to the revision that
-- produced its sector importance.

insert into sector_playbooks (
  sector,
  sub_sector,
  business_model,
  website_importance_score,
  expected_website_role,
  essential_pages,
  essential_conversion_actions,
  essential_trust_signals,
  common_customer_journey,
  weak_website_signals,
  rebuild_conditions,
  targeted_improvement_conditions,
  competitor_signals,
  outreach_angles,
  version,
  approval_status
) values
${rows}
on conflict (sector, sub_sector, business_model) do update set
  website_importance_score = excluded.website_importance_score,
  expected_website_role = excluded.expected_website_role,
  essential_pages = excluded.essential_pages,
  essential_conversion_actions = excluded.essential_conversion_actions,
  essential_trust_signals = excluded.essential_trust_signals,
  common_customer_journey = excluded.common_customer_journey,
  weak_website_signals = excluded.weak_website_signals,
  rebuild_conditions = excluded.rebuild_conditions,
  targeted_improvement_conditions = excluded.targeted_improvement_conditions,
  competitor_signals = excluded.competitor_signals,
  outreach_angles = excluded.outreach_angles,
  approval_status = excluded.approval_status,
  version = sector_playbooks.version + 1,
  updated_at = now();
`;

const outPath = resolve(import.meta.dirname, '../supabase/seed.sql');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sql, 'utf8');

console.log(`Wrote ${SEED_PLAYBOOKS.length} playbooks to ${outPath}`);
