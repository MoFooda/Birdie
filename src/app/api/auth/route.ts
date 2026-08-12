import { NextResponse } from 'next/server';
import { getSession, signInWithPassword, signOut } from '@/lib/auth';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ session: await getSession() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const { error } = await signInWithPassword(body.email ?? '', body.password ?? '');
    if (error) return NextResponse.json({ error }, { status: 401 });
    return NextResponse.json({ session: await getSession() });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE() {
  try {
    await signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
