import { describe, expect, it } from 'vitest';
import { isPrivilegedKey, parseEnv } from '@/lib/env';
import { clientSections } from '@/lib/services';

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role, iss: 'supabase' })}.signature`;

describe('browser environment', () => {
  it('accepts a publishable key', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop' }).ok).toBe(true);
    expect(parseEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).ok).toBe(true);
  });

  it('refuses secret and service-role keys (NFR-02)', () => {
    expect(isPrivilegedKey('sb_secret_abcdefghijklmnop')).toBe(true);
    expect(isPrivilegedKey(jwt('service_role'))).toBe(true);
    const r = parseEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') });
    expect(r).toEqual({ ok: false, problems: [expect.stringContaining('secret/service-role')] });
  });

  it('reports missing configuration instead of falling back to a mock', () => {
    const r = parseEnv({});
    expect(r.ok).toBe(false);
  });
});

describe('client navigation by service', () => {
  it('shows only sections for enrolled services', () => {
    expect(clientSections(['nutrition'])).toEqual({ training: false, nutrition: true, progress: true });
    expect(clientSections(['personal_training'])).toEqual({ training: true, nutrition: false, progress: true });
    expect(clientSections([])).toEqual({ training: false, nutrition: false, progress: false });
  });
});

describe('date formatting', async () => {
  const { formatDate } = await import('@/lib/format');
  // A naive local parse shows 2026-01-01 as Dec 31, 2025 anywhere west of UTC (run with TZ=America/Los_Angeles).
  it('never shifts a calendar date across time zones', () => {
    expect(formatDate('2026-01-01')).toContain('2026');
    expect(formatDate('2026-01-01')).not.toContain('2025');
    expect(formatDate('2026-01-01')).not.toContain('31');
  });
});
