import { Button } from '@/components/ui';
import { envResult } from '@/lib/env';

/**
 * Local-development shortcut: one-click sign-in as seeded accounts from supabase/seed.sql.
 * Rendered only under `import.meta.env.DEV` (so production builds drop it) and only against a
 * local Supabase URL. These are fictional @example.test accounts that exist only in the local seed.
 */
const SEED_PASSWORD = 'local-dev-only-password';
const ACCOUNTS = [
  { label: 'Coach / admin login', detail: 'Matt', email: 'matt@example.test' },
  { label: 'Client login', detail: 'Maya', email: 'maya.chen@example.test' },
] as const;

export function isLocalBackend(): boolean {
  if (!envResult.ok) return false;
  const host = new URL(envResult.env.supabaseUrl).hostname;
  return host === '127.0.0.1' || host === 'localhost';
}

export function DevQuickLogin({ busy, onSignIn }: { busy: boolean; onSignIn: (credentials: { email: string; password: string }) => void }) {
  if (!isLocalBackend()) return null;
  return (
    <div className="grid gap-2 rounded-card border border-dashed border-line p-3">
      <p className="text-xs font-medium text-muted">Local dev: seeded test accounts</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ACCOUNTS.map((a) => (
          <Button key={a.email} type="button" variant="secondary" disabled={busy} onClick={() => onSignIn({ email: a.email, password: SEED_PASSWORD })} className="flex-col !gap-0 py-1.5">
            <span>{a.label}</span>
            <span className="text-xs font-normal text-muted">{a.detail}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
