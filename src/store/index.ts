import 'server-only';
import { env, hasSupabaseAdmin } from '@/lib/env';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { DataStore } from './types';

let store: DataStore | null = null;

/**
 * Where data lives is decided by Supabase credentials alone — deliberately *not* by
 * `DEMO_MODE`, which only decides whether providers are live or served from fixtures.
 *
 * Keeping the two separate is what makes a hosted demo possible: `DEMO_MODE=true` with
 * Supabase configured gives fixture analysis (no provider keys needed) on top of real
 * persistent storage. Tying them together would force the in-memory store, and on a
 * serverless host each request can land in a different instance — so a campaign seeded
 * by one request would not exist for the next.
 */
export function getStore(): DataStore {
  if (store) return store;
  store = hasSupabaseAdmin()
    ? new SupabaseStore(env.supabaseUrl, env.supabaseServiceRoleKey)
    : new MemoryStore();
  return store;
}

/** Test seam. */
export function setStore(next: DataStore | null): void {
  store = next;
}

export type { DataStore };
