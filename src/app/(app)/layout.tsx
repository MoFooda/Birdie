import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { SignOutButton } from './sign-out-button';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen">
      {/* Charcoal masthead over a near-white page, echoing birdie & partners' own site. */}
      <header className="sticky top-0 z-10 bg-header text-header-fg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/campaigns" className="text-lg font-extrabold lowercase tracking-tight">
            birdie<span className="text-brand">.</span>engine
          </Link>

          <nav className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider">
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/campaigns">
              Campaigns
            </Link>
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/playbooks">
              Playbooks
            </Link>
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/settings">
              Settings
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {env.demoMode && (
              <span className="rounded-sm bg-brand px-2 py-1 text-xs font-semibold text-brand-fg">
                Demo mode — fixture data
              </span>
            )}
            <span className="hidden text-xs opacity-70 sm:inline">{session.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
