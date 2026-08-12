'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

export function SeedDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch('/api/demo/seed', { method: 'POST' });
            const json = await res.json();
            if (!res.ok) {
              setError(json.error ?? 'Could not seed the demo campaign.');
              return;
            }
            router.push(`/campaigns/${json.campaignId}`);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Seeding…' : 'Seed demo campaign'}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
