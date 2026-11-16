import { z } from 'zod';

/**
 * Browser configuration. Everything here ships in public JavaScript, so privileged keys are
 * rejected outright (NFR-02). A publishable/anon key is not authorization; RLS is.
 */
const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL must be a URL' }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'VITE_SUPABASE_PUBLISHABLE_KEY is missing'),
});

export type AppEnv = { supabaseUrl: string; supabaseKey: string };
export type EnvResult = { ok: true; env: AppEnv } | { ok: false; problems: string[] };

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export function isPrivilegedKey(key: string): boolean {
  return key.startsWith('sb_secret_') || jwtRole(key) === 'service_role';
}

export function parseEnv(raw: Record<string, unknown>): EnvResult {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => i.message) };
  const key = parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (isPrivilegedKey(key)) {
    return { ok: false, problems: ['A secret/service-role key was configured for the browser. Use the publishable (anon) key.'] };
  }
  return { ok: true, env: { supabaseUrl: parsed.data.VITE_SUPABASE_URL, supabaseKey: key } };
}

export const envResult = parseEnv(import.meta.env);
