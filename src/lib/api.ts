/**
 * Shared helpers for route handlers.
 *
 * Errors are mapped to status codes and to a message a user can act on. Internal detail
 * (stack traces, provider payloads) is logged, not returned.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { ForbiddenError, NotFoundError, UnauthorizedError, requireSession, type Session } from './auth';
import { getStore } from '@/store';
import type { DataStore } from '@/store/types';

export interface HandlerContext {
  session: Session;
  store: DataStore;
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error('[api]', message);
  return NextResponse.json(
    { error: 'Something went wrong handling that request. The details were logged.' },
    { status: 500 },
  );
}

/** Wrap a handler with auth, store injection and consistent error mapping. */
export function withSession<T extends unknown[]>(
  handler: (ctx: HandlerContext, ...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      const session = await requireSession();
      return await handler({ session, store: getStore() }, ...args);
    } catch (error) {
      return apiError(error);
    }
  };
}

/** Load a campaign the signed-in user owns, or throw the right error. */
export async function ownedCampaign(ctx: HandlerContext, campaignId: string) {
  const campaign = await ctx.store.getCampaign(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (campaign.owner_id !== ctx.session.userId) throw new ForbiddenError();
  return campaign;
}

/** Load a company via its campaign so ownership is always checked. */
export async function ownedCompany(ctx: HandlerContext, companyId: string) {
  const company = await ctx.store.getCompany(companyId);
  if (!company) throw new NotFoundError('Company not found');
  await ownedCampaign(ctx, company.campaign_id);
  return company;
}
