import { useState } from 'react';
import { Button } from '@/components/ui';

/*
 * LOCAL DEVELOPMENT ONLY. One-click sign-in for the fictional accounts in supabase/seed.sql.
 * SignInPage loads this module only in a dev build pointed at a local Supabase, so the seed
 * password never reaches a production bundle.
 */
const SEED_PASSWORD = 'local-dev-only-password';

const ACCOUNTS: { group: string; people: { name: string; email: string; note: string }[] }[] = [
  {
    group: 'Staff',
    people: [
      { name: 'Matt Lizmore', email: 'matt@example.test', note: 'Admin' },
      { name: 'Priya Nair', email: 'priya.nair@example.test', note: 'Coach · Maya, Grace' },
      { name: 'Liam O’Connor', email: 'liam.oconnor@example.test', note: 'Coach · no clients' },
    ],
  },
  {
    group: 'Clients',
    people: [
      { name: 'Maya Chen', email: 'maya.chen@example.test', note: 'Mesocycle' },
      { name: 'Grace Liu', email: 'grace.liu@example.test', note: 'Mesocycle' },
      { name: 'Hannah Kowalski', email: 'hannah.kowalski@example.test', note: 'Mesocycle' },
      { name: 'Lucas Silva', email: 'lucas.silva@example.test', note: 'Mesocycle · invited' },
      { name: 'Daniel Okafor', email: 'daniel.okafor@example.test', note: 'Personal training' },
      { name: 'Aisha Rahman', email: 'aisha.rahman@example.test', note: 'Personal training' },
      { name: 'Owen Fitzgerald', email: 'owen.fitzgerald@example.test', note: 'Active' },
      { name: 'Sofia Márquez', email: 'sofia.marquez@example.test', note: 'Disabled' },
      { name: 'Ryan Patel', email: 'ryan.patel@example.test', note: 'Disabled' },
    ],
  },
];

export default function DevSignIn({ onSignIn }: { onSignIn: (credentials: { email: string; password: string }) => Promise<void> }) {
  const [pending, setPending] = useState<string | null>(null);

  async function pick(email: string) {
    setPending(email);
    await onSignIn({ email, password: SEED_PASSWORD });
    setPending(null);
  }

  return (
    <section aria-labelledby="dev-sign-in" className="mt-10 border-t border-line pt-4">
      <h2 id="dev-sign-in" className="text-sm font-semibold">Local test accounts</h2>
      <p className="mt-0.5 text-xs text-muted">Development only. Signs in as a fictional seed account.</p>
      {ACCOUNTS.map(({ group, people }) => (
        <div key={group} className="mt-3">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{group}</h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {people.map((p) => (
              <li key={p.email}>
                <Button
                  variant="secondary"
                  busy={pending === p.email}
                  disabled={pending !== null}
                  onClick={() => void pick(p.email)}
                  className="w-full !justify-start py-1.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.note}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
