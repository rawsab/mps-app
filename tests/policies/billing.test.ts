/** Decisions 0053 and 0055: billing documents over HTTP, parsed with the schemas the screens use. Read-only. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ClientBillingSchema, MeetingBillingSchema, NeedsPriceSchema, OverviewSchema, PaymentDetailsSchema, PaymentNoticesSchema, SettingsSchema,
} from '@/features/billing/schemas';

function localConfig() {
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_PUBLISHABLE_KEY) {
    return { url: process.env.SUPABASE_TEST_URL, key: process.env.SUPABASE_TEST_PUBLISHABLE_KEY };
  }
  const config = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (name: string) => new RegExp(`^${name}="?([^"\\n]+)"?`, 'm').exec(config)?.[1] ?? '';
  return { url: get('API_URL'), key: get('PUBLISHABLE_KEY') || get('ANON_KEY') };
}

const { url, key } = localConfig();
const MAYA = '10000000-0000-4000-b000-000000000001';
const GRACE = '10000000-0000-4000-b000-000000000009';

async function signIn(email: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: 'local-dev-only-password' });
  if (error) throw error;
  return client;
}

async function call(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as unknown;
}

describe('billing over HTTP', () => {
  let admin: SupabaseClient;
  let coach: SupabaseClient;
  let unassigned: SupabaseClient;
  let maya: SupabaseClient;

  beforeAll(async () => {
    [admin, coach, unassigned, maya] = await Promise.all([
      signIn('matt@example.test'), signIn('priya.nair@example.test'), signIn('liam.oconnor@example.test'), signIn('maya.chen@example.test'),
    ]);
  });

  it('gives staff documents the screens can parse', async () => {
    const overview = OverviewSchema.parse(await call(coach, 'billing_overview'));
    expect(overview.clients.map((c) => c.clientId)).toContain(MAYA);
    ClientBillingSchema.parse(await call(coach, 'get_client_billing', { p_client_id: MAYA }));
    NeedsPriceSchema.parse(await call(coach, 'list_sessions_needing_price'));
    PaymentNoticesSchema.parse(await call(coach, 'list_payment_notices'));
    expect(Object.keys(SettingsSchema.parse(await call(coach, 'get_billing_settings')).rates)).toHaveLength(7);

    const meeting = await admin.from('meetings').select('id').eq('billable', true).limit(1).maybeSingle();
    expect(meeting.error).toBeNull();
    if (meeting.data) MeetingBillingSchema.parse(await call(admin, 'get_meeting_billing', { p_meeting_id: meeting.data.id }));
  });

  it('shows an unassigned coach nobody', async () => {
    expect(OverviewSchema.parse(await call(unassigned, 'billing_overview')).clients).toEqual([]);
    expect(PaymentNoticesSchema.parse(await call(unassigned, 'list_payment_notices'))).toEqual([]);
    await expect(call(unassigned, 'get_client_billing', { p_client_id: MAYA })).rejects.toMatchObject({ code: '42501' });
  });

  it('lets a client read only their own billing, without staff fields', async () => {
    const own = ClientBillingSchema.parse(await call(maya, 'get_client_billing', { p_client_id: MAYA }));
    expect(own.charges.every((c) => c.status !== 'void' && c.voidReason === null)).toBe(true);
    expect(own.payments.every((p) => p.note === null)).toBe(true);
    PaymentDetailsSchema.parse(await call(maya, 'billing_payment_details'));
    await expect(call(maya, 'get_client_billing', { p_client_id: GRACE })).rejects.toMatchObject({ code: '42501' });
    await expect(call(maya, 'billing_overview')).rejects.toMatchObject({ code: '42501' });
    const notes = await maya.from('billing_payments').select('note');
    expect(notes.error?.code).toBe('42501');
  });

  it('keeps staff billing actions and notice reasons away from clients', async () => {
    const id = crypto.randomUUID();
    await expect(call(maya, 'list_payment_notices')).rejects.toMatchObject({ code: '42501' });
    await expect(call(maya, 'restore_payment', { p_payment_id: id })).rejects.toMatchObject({ code: '42501' });
    await expect(call(maya, 'dismiss_payment_notice', { p_notice_id: id, p_reason: 'No' })).rejects.toMatchObject({ code: '42501' });
    await expect(call(maya, 'record_reported_payment', {
      p_notice_id: id, p_payment_id: id, p_amount_cents: 100, p_received_on: '2026-11-01', p_method: 'e_transfer', p_note: '',
    })).rejects.toMatchObject({ code: '42501' });
    const reasons = await maya.from('billing_payment_notices').select('dismiss_reason');
    expect(reasons.error?.code).toBe('42501');
    const own = await maya.from('billing_payment_notices').select('client_id');
    expect(own.error).toBeNull();
    expect((own.data ?? []).every((n) => n.client_id === MAYA)).toBe(true);
  });
});
