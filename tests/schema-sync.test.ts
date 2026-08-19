/**
 * The Postgres enums and the TypeScript constants must not drift apart.
 *
 * They are two copies of the same list, and nothing but discipline keeps them equal. When
 * they diverged — a twelfth pipeline step added in code with no matching migration — the
 * failure was silent and expensive: every company's run stopped dead at that step, because
 * the enum rejected the value while the type system was perfectly happy.
 *
 * This reads the migrations as text rather than connecting to a database, so it runs
 * everywhere and fails at the moment the drift is introduced instead of on a deployment.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUSINESS_MODELS,
  CAMPAIGN_STATUSES,
  COMPANY_PIPELINE_STATUSES,
  CONFIDENCE_LEVELS,
  CUSTOMER_TYPES,
  FINDING_CATEGORIES,
  JOB_STATUSES,
  MEASUREMENT_SOURCES,
  OPPORTUNITY_CLASSIFICATIONS,
  OUTREACH_LANGUAGES,
  OUTREACH_TONES,
  PIPELINE_STEPS,
  PLAYBOOK_APPROVAL_STATUSES,
  RECOMMENDED_ACTIONS,
  REVIEW_STATUSES,
  SEVERITIES,
  VALIDATION_STATUSES,
  WEBSITE_ROLES,
  WEBSITE_STATUSES,
} from '@/core/types';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Every enum value the migrations declare, including ones added by a later `alter type`. */
function enumsFromMigrations(): Record<string, Set<string>> {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const sql = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n');
  const enums: Record<string, Set<string>> = {};

  for (const match of sql.matchAll(/create type (\w+) as enum \(([\s\S]*?)\);/g)) {
    enums[match[1]!] = new Set([...match[2]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!));
  }
  for (const match of sql.matchAll(/alter type (\w+) add value(?: if not exists)? '([^']+)'/g)) {
    (enums[match[1]!] ??= new Set()).add(match[2]!);
  }
  return enums;
}

const PAIRS: Array<[string, readonly string[]]> = [
  ['pipeline_step', PIPELINE_STEPS],
  ['website_status', WEBSITE_STATUSES],
  ['website_role', WEBSITE_ROLES],
  ['business_model', BUSINESS_MODELS],
  ['customer_type', CUSTOMER_TYPES],
  ['opportunity_classification', OPPORTUNITY_CLASSIFICATIONS],
  ['recommended_action', RECOMMENDED_ACTIONS],
  ['confidence_level', CONFIDENCE_LEVELS],
  ['severity_level', SEVERITIES],
  ['finding_category', FINDING_CATEGORIES],
  ['measurement_source', MEASUREMENT_SOURCES],
  ['job_status', JOB_STATUSES],
  ['company_pipeline_status', COMPANY_PIPELINE_STATUSES],
  ['review_status', REVIEW_STATUSES],
  ['campaign_status', CAMPAIGN_STATUSES],
  ['outreach_language', OUTREACH_LANGUAGES],
  ['outreach_tone', OUTREACH_TONES],
  ['playbook_approval_status', PLAYBOOK_APPROVAL_STATUSES],
  ['validation_status', VALIDATION_STATUSES],
];

describe('Postgres enums match the TypeScript constants', () => {
  const enums = enumsFromMigrations();

  it.each(PAIRS)('%s', (sqlName, values) => {
    const declared = enums[sqlName];
    expect(declared, `no enum named "${sqlName}" in supabase/migrations`).toBeDefined();

    // A value in code but not in the schema is the dangerous direction: the insert fails
    // at runtime, on a deployment, with an error the type checker could never have caught.
    const missing = values.filter((v) => !declared!.has(v));
    expect(missing, `add a migration declaring these on "${sqlName}"`).toEqual([]);

    // The reverse is merely dead schema, but it usually means a rename went half-done.
    const stale = [...declared!].filter((v) => !values.includes(v));
    expect(stale, `"${sqlName}" declares values the application no longer uses`).toEqual([]);
  });
});
