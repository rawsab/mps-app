/**
 * Direct-request isolation checks (NFR-01) against the running local Supabase stack, using real
 * sign-ins with the browser key — the same path an attacker with a valid account would use.
 *
 *   pnpm db:reset && pnpm test:api
 *
 * Fails (does not skip) when the local stack is unreachable.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function localConfig() {
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_PUBLISHABLE_KEY) {
    return { url: process.env.SUPABASE_TEST_URL, key: process.env.SUPABASE_TEST_PUBLISHABLE_KEY };
  }
  const out = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?`, 'm').exec(out)?.[1] ?? '';
  return { url: get('API_URL'), key: get('PUBLISHABLE_KEY') || get('ANON_KEY') };
}

const { url, key } = localConfig();
const PASSWORD = 'local-dev-only-password';
const CLIENT_A = '10000000-0000-4000-b000-000000000001';
const CLIENT_B = '10000000-0000-4000-b000-000000000002';

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}. Did you run pnpm db:reset?`);
  return client;
}

let anon: SupabaseClient;
let a: SupabaseClient;
let b: SupabaseClient;
let admin: SupabaseClient;

beforeAll(async () => {
  expect(url, 'local Supabase API URL').toMatch(/^http/);
  anon = createClient(url, key, { auth: { persistSession: false } });
  [a, b, admin] = await Promise.all([signedIn('maya.chen@example.test'), signedIn('daniel.okafor@example.test'), signedIn('matt@example.test')]);
});

afterAll(async () => {
  // Leave seed state as found even if a test failed mid-way.
  await admin?.from('clients').update({ status: 'active' }).eq('id', CLIENT_A);
});

describe('direct API isolation', () => {
  it('anonymous requests read nothing', async () => {
    const { data, error } = await anon.from('clients').select('id');
    expect(data ?? []).toEqual([]);
    if (error) expect(error.code).toBe('42501');
  });

  it('client A reads only their own client record and enrollments', async () => {
    const clients = await a.from('clients').select('id');
    expect(clients.data?.map((c) => c.id)).toEqual([CLIENT_A]);
    const forged = await a.from('clients').select('id').eq('id', CLIENT_B);
    expect(forged.data).toEqual([]);
    const enrollments = await a.from('service_enrollments').select('client_id');
    expect(new Set(enrollments.data?.map((e) => e.client_id))).toEqual(new Set([CLIENT_A]));
  });

  it('client B cannot read client A through embedded joins', async () => {
    const { data } = await b.from('service_enrollments').select('client_id, clients(id, email)').eq('client_id', CLIENT_A);
    expect(data).toEqual([]);
  });

  it('clients cannot promote themselves or rebind records', async () => {
    const promote = await a.from('staff_roles').insert({ auth_user_id: (await a.auth.getUser()).data.user!.id, role: 'admin' });
    expect(promote.error?.code).toBe('42501');
    const rebind = await a.from('clients').update({ auth_user_id: (await a.auth.getUser()).data.user!.id }).eq('id', CLIENT_B);
    expect(rebind.error?.code).toBe('42501');
    const selfEnroll = await a.from('service_enrollments').insert({ client_id: CLIENT_A, service: 'personal_training' });
    expect(selfEnroll.error?.code).toBe('42501');
  });

  it('a disabled client loses access immediately, even with a live session', async () => {
    const before = await a.from('clients').select('id');
    expect(before.data).toHaveLength(1);
    const disable = await admin.from('clients').update({ status: 'disabled' }).eq('id', CLIENT_A);
    expect(disable.error).toBeNull();
    const after = await a.from('clients').select('id');
    expect(after.data).toEqual([]);
    const enrollments = await a.from('service_enrollments').select('id');
    expect(enrollments.data).toEqual([]);
    await admin.from('clients').update({ status: 'active' }).eq('id', CLIENT_A);
  });

  it('admin sees every client', async () => {
    const { data } = await admin.from('clients').select('id');
    expect(data?.length).toBeGreaterThanOrEqual(12);
  });
});
