/**
 * Authentication.
 *
 * With Supabase configured this is ordinary Supabase Auth over cookies. In demo mode
 * there are no credentials to check, so a signed-in demo session is represented by a
 * single cookie — enough to exercise every authenticated path without inventing a fake
 * user directory.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env, hasSupabase } from './env';
import { DEMO_USER_EMAIL, DEMO_USER_ID } from '@/demo/seed';

export const DEMO_SESSION_COOKIE = 'woe_demo_session';

export interface Session {
  userId: string;
  email: string;
  demo: boolean;
}

async function supabaseServerClient() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The middleware
          // refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

export async function getSession(): Promise<Session | null> {
  if (env.demoMode || !hasSupabase()) {
    const store = await cookies();
    return store.get(DEMO_SESSION_COOKIE)
      ? { userId: DEMO_USER_ID, email: DEMO_USER_EMAIL, demo: true }
      : null;
  }

  const supabase = await supabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? '', demo: false };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in');
    this.name = 'UnauthorizedError';
  }
}

export async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  if (env.demoMode || !hasSupabase()) {
    const store = await cookies();
    store.set(DEMO_SESSION_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/' });
    return { error: null };
  }
  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
  if (!env.demoMode && hasSupabase()) {
    const supabase = await supabaseServerClient();
    await supabase.auth.signOut();
  }
}

/** Confirm the signed-in user owns this campaign before any read or write. */
export async function assertCampaignAccess(
  campaignId: string,
  session: Session,
  ownerOf: (id: string) => Promise<{ owner_id: string } | null>,
): Promise<void> {
  const campaign = await ownerOf(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (campaign.owner_id !== session.userId) throw new ForbiddenError();
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this campaign') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
