import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { Badge } from '@/components/ui';
import { SignOutButton } from './sign-out-button';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/campaigns" className="font-extrabold tracking-tight">
            Website Opportunity Engine
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link className="rounded px-3 py-1.5 hover:bg-surface-2" href="/campaigns">
              Campaigns
            </Link>
            <Link className="rounded px-3 py-1.5 hover:bg-surface-2" href="/playbooks">
              Sector playbooks
            </Link>
            <Link className="rounded px-3 py-1.5 hover:bg-surface-2" href="/settings">
              Settings
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {env.demoMode && <Badge tone="warning">Demo mode — fixture data</Badge>}
            <span className="hidden text-xs text-muted sm:inline">{session.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
