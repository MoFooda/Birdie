import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { env, hasSupabase } from '@/lib/env';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/campaigns');

  const demo = env.demoMode || !hasSupabase();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Website Opportunity Engine</h1>
        <p className="mt-2 text-sm text-muted">
          Import an Apollo export, audit each website against its sector and competitors, and generate outreach
          from evidence you can check.
        </p>
      </div>

      <LoginForm demo={demo} />

      {demo && (
        <p className="mt-6 text-xs text-muted">
          Demo mode is on: no credentials are required and every external provider is served from local fixtures.
          Set <code>DEMO_MODE=false</code> with Supabase credentials to use real accounts.
        </p>
      )}
    </main>
  );
}
