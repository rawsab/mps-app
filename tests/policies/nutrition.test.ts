/** Read-only HTTP boundary checks; transactional writes and conflicts are covered by 017 pgTAP. */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { NutritionData } from '@/domain/nutrition';
import { NutritionProgramSnapshot } from '@/domain/nutritionProgram';
import { ActivitySchema, ReviewSchema } from '@/features/activity/api';
import { z } from 'zod';

function localConfig() {
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_PUBLISHABLE_KEY) {
    return { url: process.env.SUPABASE_TEST_URL, key: process.env.SUPABASE_TEST_PUBLISHABLE_KEY };
  }
  const config = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (key: string) => new RegExp(`^${key}="?([^"\\n]+)"?`, 'm').exec(config)?.[1] ?? '';
  return { url: get('API_URL'), key: get('PUBLISHABLE_KEY') || get('ANON_KEY') };
}

const { url, key } = localConfig();
const clientA = '10000000-0000-4000-b000-000000000001';
async function signIn(email: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: 'local-dev-only-password' });
  if (error) throw error;
  return client;
}
describe('nutrition HTTP boundary (FR-09 / NFR-01)', () => {
  it('reads the combined coach feed using the shared training/nutrition response contract', async () => {
    const coach=await signIn('priya.nair@example.test');
    const [reviews,recent,count]=await Promise.all([
      coach.rpc('get_staff_activity',{p_limit:100}),coach.rpc('get_client_activity',{p_client_id:clientA,p_limit:3}),coach.rpc('count_unread_activity'),
    ]);
    expect(reviews.error).toBeNull(); expect(recent.error).toBeNull(); expect(count.error).toBeNull();
    expect(z.array(ReviewSchema).safeParse(reviews.data).success).toBe(true);
    expect(z.array(ActivitySchema).safeParse(recent.data).success).toBe(true);
    expect(Number.isInteger(count.data)).toBe(true);
  });
  it('creates, saves, reads and removes a draft through HTTP while hiding it from the client', async () => {
    const [coach, client] = await Promise.all([signIn('priya.nair@example.test'), signIn('maya.chen@example.test')]);
    const enrollment = await coach.from('service_enrollments').select('id').eq('client_id', clientA).eq('service', 'nutrition').neq('status', 'ended').is('archived_at', null).single();
    expect(enrollment.error).toBeNull();
    const id = crypto.randomUUID();
    let version = 1;
    const created = await coach.rpc('create_nutrition_program', { p_enrollment_id: enrollment.data!.id, p_program_id: id });
    expect(created.error).toBeNull();
    try {
      const initial = await coach.rpc('get_nutrition_program', { p_program_id: id });
      expect(initial.error).toBeNull();
      const snapshot = NutritionProgramSnapshot.parse(initial.data);
      expect(snapshot.revision.week_count).toBe(4); expect(snapshot.can_log).toBe(true);
      expect((await client.rpc('get_nutrition_program', { p_program_id: id })).error?.code).toBe('42501');
      const value = { program_style: 'API draft', start_date: snapshot.today, week_count: 4, maintenance: 2600, calorie_goal: 2800, notes: '' };
      const saved = await coach.rpc('save_nutrition_program_draft', { p_program_id: id, p_expected_version: version, p_value: value });
      expect(saved.error).toBeNull(); version = saved.data.lock_version;
      const list = await coach.from('nutrition_programs').select('id, nutrition_program_revisions!nutrition_program_revisions_program_id_client_id_fkey(id, program_style)').eq('id', id).single();
      expect(list.error).toBeNull(); expect(list.data?.nutrition_program_revisions[0]?.program_style).toBe('API draft');
      const reloaded = await coach.rpc('get_nutrition_program', { p_program_id: id });
      expect(NutritionProgramSnapshot.parse(reloaded.data).revision.program_style).toBe('API draft');
    } finally {
      expect((await coach.rpc('remove_nutrition_program', { p_program_id: id, p_expected_version: version, p_archive: false })).error).toBeNull();
    }
  });
  it('returns the client’s nutrition contract and calendar bounds', async () => {
    const client = await signIn('maya.chen@example.test');
    const response = await client.rpc('get_nutrition', { p_client_id: clientA, p_through: null });
    expect(response.error).toBeNull();
    const data = NutritionData.parse(response.data);
    expect(data.client_id).toBe(clientA);
    expect(data.can_assign).toBe(false);
    expect(data.through).toBe(data.today);
    expect(data.from < data.through).toBe(true);
  });
  it('assigned coach can review and unassigned coach cannot', async () => {
    const [coach, other] = await Promise.all([signIn('priya.nair@example.test'), signIn('liam.oconnor@example.test')]);
    expect((await coach.rpc('get_nutrition', { p_client_id: clientA })).error).toBeNull();
    expect((await other.rpc('get_nutrition', { p_client_id: clientA })).error?.code).toBe('42501');
  });
  it('another client cannot read the RPC, tables or correction history', async () => {
    const client = await signIn('daniel.okafor@example.test');
    expect((await client.rpc('get_nutrition', { p_client_id: clientA })).error?.code).toBe('42501');
    for (const table of ['nutrition_targets', 'bodyweight_logs', 'nutrition_logs', 'nutrition_entry_changes']) {
      const response = await client.from(table).select('*').eq('client_id', clientA);
      expect(response.error).toBeNull(); expect(response.data).toEqual([]);
    }
  });
  it('anonymous cannot read nutrition', async () => {
    const client = createClient(url, key, { auth: { persistSession: false } });
    expect((await client.rpc('get_nutrition', { p_client_id: clientA })).error?.code).toBe('42501');
  });
});
