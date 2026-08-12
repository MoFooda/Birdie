import 'server-only';
import { env, hasSupabaseAdmin } from '@/lib/env';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { DataStore } from './types';

let store: DataStore | null = null;

/**
 * Demo mode always uses the memory store so the app runs with no secrets.
 * Outside demo mode, Supabase is used when a service-role key is present; without one
 * the app still starts (on the memory store) and the settings page says so plainly
 * rather than failing at the first write.
 */
export function getStore(): DataStore {
  if (store) return store;
  store = !env.demoMode && hasSupabaseAdmin()
    ? new SupabaseStore(env.supabaseUrl, env.supabaseServiceRoleKey)
    : new MemoryStore();
  return store;
}

/** Test seam. */
export function setStore(next: DataStore | null): void {
  store = next;
}

export type { DataStore };
