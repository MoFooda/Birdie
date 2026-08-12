'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';

/**
 * Manual competitor entry. Exists because the engine refuses to invent competitors when
 * discovery comes up short — a human filling the gap is the correct escape hatch.
 */
export function AddCompetitor({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Add a competitor manually
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch(`/api/companies/${companyId}/competitors`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, website }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(json.error ?? 'Could not add that competitor.');
            return;
          }
          setName('');
          setWebsite('');
          setOpen(false);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        className="w-40"
        placeholder="Competitor name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        className="w-48"
        placeholder="website.com"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        required
      />
      <Button size="sm" type="submit" disabled={busy}>
        Add
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
