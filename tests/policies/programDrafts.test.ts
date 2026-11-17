/**
 * Draft save and publish over HTTP (FR-04, FR-06, NFR-01): the TypeScript ProgramDraft contract
 * survives a round trip through save_draft/get_program_draft, PostgREST maps the conflict and
 * readiness errors to 409/422, and the client sees only what was published.
 *
 *   pnpm db:reset && pnpm test:api
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProgramDraft, validateForPublish } from '@/domain/programs/contract';

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
const CLIENT_B = '10000000-0000-4000-b000-000000000002';

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}. Did you run pnpm db:reset?`);
  return client;
}

const id = () => crypto.randomUUID();
const goblet = (d: ProgramDraft) => d.weeks[0]!.days[0]!.sections[1]!.exercises[0]!;

/** A personal training day with a timed stretch, an RPE target and per-set targets (FR-05 acceptance). */
function personalTrainingDraft(): ProgramDraft {
  return ProgramDraft.parse({
    schemaVersion: 1,
    service: 'personal_training',
    title: 'Strength foundations',
    programTheme: '',
    coachNotes: '',
    sharedSections: [],
    resources: [{ id: id(), title: 'Breathing', body: 'Brace before each rep.', url: 'https://example.test/brace' }],
    weeks: [
      {
        id: id(),
        index: 1,
        label: 'Week 1',
        startDate: null,
        useSections: false,
        days: [
          {
            id: id(),
            label: 'Full body',
            scheduledDate: '2026-11-18',
            sections: [
              {
                id: id(),
                kind: 'preparation',
                title: 'Mobility',
                instructions: '',
                exercises: [
                  {
                    id: id(), logicalKey: 'couch-stretch', name: 'Couch stretch', alternatives: [], groupId: null, demoUrl: null, notes: '',
                    prescription: {
                      setCount: { min: 1, max: 1 },
                      targets: [{ effort: { kind: 'duration', seconds: { min: 60, max: 60 }, perSide: true }, load: null, rir: null, rpe: null, annotations: [] }],
                    },
                  },
                ],
              },
              {
                id: id(),
                kind: 'main',
                title: 'Main',
                instructions: '',
                exercises: [
                  {
                    id: id(), logicalKey: 'goblet-squat', name: 'Goblet squat', notes: '', groupId: null, demoUrl: null,
                    alternatives: [{ id: 'alt-1', name: 'Box squat' }],
                    prescription: {
                      setCount: { min: 2, max: 2 },
                      targets: [
                        { effort: { kind: 'reps', reps: { min: 10, max: 10 }, perSide: false }, load: { mode: 'external', value: { min: 20, max: 20 }, unit: 'kg' }, rir: null, rpe: { min: 6, max: 7 }, annotations: [] },
                        { effort: { kind: 'reps', reps: { min: 8, max: 10 }, perSide: false }, load: { mode: 'external', value: { min: 24, max: 24 }, unit: 'kg' }, rir: null, rpe: { min: 8, max: 8 }, annotations: [] },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

let admin: SupabaseClient;
let b: SupabaseClient;
let programId: string;

beforeAll(async () => {
  expect(url, 'local Supabase API URL').toMatch(/^http/);
  [admin, b] = await Promise.all([signedIn('matt@example.test'), signedIn('daniel.okafor@example.test')]);
  const enrollment = await admin.from('service_enrollments').select('id').eq('client_id', CLIENT_B).eq('service', 'personal_training').single();
  expect(enrollment.error).toBeNull();
  const created = await admin.rpc('create_program', { p_enrollment_id: enrollment.data!.id });
  expect(created.error).toBeNull();
  programId = created.data as string;
});

describe('program drafts over HTTP', () => {
  const draft = personalTrainingDraft();

  it('round-trips the ProgramDraft contract exactly', async () => {
    expect(validateForPublish(draft)).toEqual([]);
    const saved = await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: null, p_draft: draft });
    expect(saved.error).toBeNull();
    expect(saved.data.lockVersion).toBe(1);
    const loaded = await admin.rpc('get_program_draft', { p_program_id: programId });
    expect(loaded.error).toBeNull();
    expect(ProgramDraft.parse(loaded.data.draft)).toEqual(draft);
  });

  it('refuses a stale save with 409 and the current version', async () => {
    const edited = { ...draft, title: 'Strength foundations v2' };
    expect((await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: 1, p_draft: edited })).error).toBeNull();
    const stale = await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: 1, p_draft: draft });
    expect(stale.status).toBe(409);
    expect(stale.error?.code).toBe('PT409');
    expect(JSON.parse(stale.error!.details)).toEqual({ currentVersion: 2 });
  });

  it('rejects a document that breaks the contract with the failing path', async () => {
    const bad = structuredClone(draft);
    (goblet(bad).prescription.targets[0] as { rir: unknown }).rir = '1-2';
    const res = await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: 2, p_draft: bad });
    expect(res.error?.code).toBe('22023');
    expect(res.error?.message).toContain('weeks.0.days.0.sections.1.exercises.0.prescription.targets.0.rir');
  });

  it('returns publish problems with 422 and keeps the client view empty', async () => {
    const incomplete = structuredClone(draft);
    goblet(incomplete).prescription = { setCount: null, targets: [] };
    expect((await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: 2, p_draft: incomplete })).error).toBeNull();
    const res = await admin.rpc('publish_revision', { p_program_id: programId, p_expected_version: 3 });
    expect(res.status).toBe(422);
    expect(JSON.parse(res.error!.details)).toEqual(validateForPublish(incomplete));
    expect((await b.from('programs').select('id').eq('id', programId)).data).toEqual([]);
  });

  it('publishes atomically and the client reads only the published revision', async () => {
    expect((await b.rpc('get_program_draft', { p_program_id: programId })).error?.code).toBe('42501');
    expect((await admin.rpc('save_draft', { p_program_id: programId, p_expected_version: 3, p_draft: draft })).error).toBeNull();
    const published = await admin.rpc('publish_revision', { p_program_id: programId, p_expected_version: 4 });
    expect(published.error).toBeNull();
    const revisions = await b.from('program_revisions').select('id, title, status').eq('program_id', programId);
    expect(revisions.data).toEqual([{ id: published.data.revisionId, title: 'Strength foundations', status: 'published' }]);
    const sets = await b.from('prescribed_sets').select('rpe_min, rpe_max').eq('revision_id', published.data.revisionId).order('position');
    expect(sets.data).toContainEqual({ rpe_min: 6, rpe_max: 7 });
  });
});
