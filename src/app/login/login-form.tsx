'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, Field, Input } from '@/components/ui';

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Sign-in failed.');
        return;
      }
      router.push('/campaigns');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check that the app is running.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit}>
          {!demo && (
            <>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
            </>
          )}

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : demo ? 'Continue as demo user' : 'Sign in'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
