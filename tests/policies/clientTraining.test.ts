/**
 * Client Training readers over HTTP (FR-03, FR-04, NFR-01; PRD §4 drafts are staff-only): the
 * client reads the current published revision, never a newer draft, and never another client's.
 *
 *   pnpm db:reset && pnpm test:api
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProgramDraft } from '@/domain/programs/contract';

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

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}. Did you run pnpm db:reset?`);
  return client;
}

const id = () => crypto.randomUUID();

function mesocycle(title: string): ProgramDraft {
  return ProgramDraft.parse({
    schemaVersion: 1, service: 'mesocycle', title, programTheme: 'Size', coachNotes: 'Log every set.',
    sharedSections: [], resources: [],
    weeks: [{
      id: id(), index: 1, label: '', startDate: null, useSections: false,
      days: [{ id: id(), label: 'Pull', scheduledDate: null, sections: [{
        id: id(), kind: 'main', title: 'Main', instructions: '',
        exercises: [{
          id: id(), logicalKey: 'chest-supported-row', name: 'Chest-supported row', alternatives: [], groupId: null, demoUrl: null, notes: '',
          prescription: { setCount: { min: 3, max: 3 }, targets: [{ effort: { kind: 'reps', reps: { min: 8, max: 12 }, perSide: false }, load: null, rir: { min: 1, max: 2 }, rpe: null, annotations: [] }] },
        }],
      }] }],
    }],
  });
}

let admin: SupabaseClient;
let a: SupabaseClient;
let b: SupabaseClient;
let programId: string;
const published = mesocycle('Training view block');

beforeAll(async () => {
  expect(url, 'local Supabase API URL').toMatch(/^http/);
  [admin, a, b] = await Promise.all([signedIn('matt@example.test'), signedIn('maya.chen@example.test'), signedIn('daniel.okafor@example.test')]);
  const enrollment = await admin.from('service_enrollments').select('id').eq('client_id', CLIENT_A).eq('service', 'mesocycle').single();
  expect(enrollment.error).toBeNull();
  const created = await admin.rpc('create_program', { p_enrollment_id: enrollment.data!.id });
  expect(created.error).toBeNull();
  programId = created.data as string;
  expect((await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: null, p_draft: published })).error).toBeNull();
  expect((await admin.rpc('publish_revision', { p_program_id: programId, p_expected_version: 1 })).error).toBeNull();
  // A newer draft with a different title and an extra week must stay invisible to the client.
  const draft = mesocycle('Unpublished rename');
  draft.weeks.push({ ...structuredClone(published.weeks[0]!), id: id(), index: 2 });
  expect((await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: null, p_draft: draft })).error).toBeNull();
});

describe('client training view over HTTP', () => {
  it('the client reads the current published revision, not the draft', async () => {
    const res = await a.rpc('get_published_program', { p_program_id: programId });
    expect(res.error).toBeNull();
    expect(res.data.revisionNumber).toBe(1);
    expect(res.data.archivedAt).toBeNull();
    expect(ProgramDraft.parse(res.data.document)).toEqual(published);
  });

  it('the client list shows the published title and week count', async () => {
    const res = await a.rpc('list_published_programs');
    expect(res.error).toBeNull();
    expect(res.data).toContainEqual(expect.objectContaining({ programId, title: 'Training view block', programTheme: 'Size', weekCount: 1, revisionNumber: 1 }));
  });

  it('another client cannot list or read it', async () => {
    const list = await b.rpc('list_published_programs');
    expect(list.error).toBeNull();
    expect(list.data.map((p: { programId: string }) => p.programId)).not.toContain(programId);
    const res = await b.rpc('get_published_program', { p_program_id: programId });
    expect(res.error?.code).toBe('42501');
  });

  it('the client still cannot open the draft', async () => {
    expect((await a.rpc('get_program_draft', { p_program_id: programId })).error?.code).toBe('42501');
  });
});
