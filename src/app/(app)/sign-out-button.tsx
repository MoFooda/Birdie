'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-header-fg hover:bg-white/10"
      onClick={async () => {
        await fetch('/api/auth', { method: 'DELETE' });
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
