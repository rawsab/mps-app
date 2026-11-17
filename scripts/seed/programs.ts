/**
 * Which demo client gets which program, and in what lifecycle state. Rendered to
 * supabase/seed/programs.sql by `pnpm seed:programs`; `tests/domain/seedPrograms.test.ts` fails if
 * the committed SQL is stale.
 *
 * Every document goes through the real write path (save_draft → publish_revision → remove_program)
 * as the seeded admin, so the database's contract and publish checks apply to the seed too.
 */
import type { ProgramDraft, ServiceKind } from '@/domain/programs/contract';
import { seedId } from './builders';
import { graceMesocycle, hannahMesocycle, lucasMesocycleDraft, mayaMesocycle, mayaMesocycleRevision } from './mesocycles';
import { aishaPlan, danielFirstPlan, danielPlan, gracePlan, noahPlanDraft, ryanPlan } from './personalTraining';

export const SEED_ADMIN = '00000000-0000-4000-a000-000000000001';

export type SeedProgram = {
  key: string;
  clientId: string;
  service: Exclude<ServiceKind, 'nutrition'>;
  createdAt: string;
  /** In order. Each is saved as a new revision; `publish` freezes it before the next. */
  revisions: { draft: ProgramDraft; publish: boolean }[];
  archive?: boolean;
};

const client = (n: number) => `10000000-0000-4000-b000-0000000000${String(n).padStart(2, '0')}`;

export const seedPrograms: SeedProgram[] = [
  // Maya (client A): week 3 of a published block, with an unpublished revision in progress.
  { key: 'maya/meso3', clientId: client(1), service: 'mesocycle', createdAt: '2026-10-28 15:10:00+00',
    revisions: [{ draft: mayaMesocycle, publish: true }, { draft: mayaMesocycleRevision, publish: false }] },
  // Daniel (client B): an archived first plan and the current one.
  { key: 'daniel/aug', clientId: client(2), service: 'personal_training', createdAt: '2026-08-21 18:00:00+00',
    revisions: [{ draft: danielFirstPlan, publish: true }], archive: true },
  { key: 'daniel/nov', clientId: client(2), service: 'personal_training', createdAt: '2026-11-06 20:30:00+00',
    revisions: [{ draft: danielPlan, publish: true }] },
  { key: 'aisha/strength', clientId: client(5), service: 'personal_training', createdAt: '2026-11-05 17:45:00+00',
    revisions: [{ draft: aishaPlan, publish: true }] },
  // Lucas is invited but hasn't signed in; his first block is a draft that isn't ready yet.
  { key: 'lucas/meso1', clientId: client(6), service: 'mesocycle', createdAt: '2026-11-15 16:20:00+00',
    revisions: [{ draft: lucasMesocycleDraft, publish: false }] },
  // Hannah's mesocycle service ended 2026-05-31; the published block remains as history.
  { key: 'hannah/meso2', clientId: client(7), service: 'mesocycle', createdAt: '2026-04-30 14:00:00+00',
    revisions: [{ draft: hannahMesocycle, publish: true }] },
  // Noah is pending (no account); his plan is complete but held until he accepts.
  { key: 'noah/start', clientId: client(8), service: 'personal_training', createdAt: '2026-11-15 21:00:00+00',
    revisions: [{ draft: noahPlanDraft, publish: false }] },
  // Grace (Priya's client): both services.
  { key: 'grace/meso1', clientId: client(9), service: 'mesocycle', createdAt: '2026-10-15 19:30:00+00',
    revisions: [{ draft: graceMesocycle, publish: true }] },
  { key: 'grace/technique', clientId: client(9), service: 'personal_training', createdAt: '2026-11-04 19:30:00+00',
    revisions: [{ draft: gracePlan, publish: true }] },
  // Ryan's PT service ended 2026-04-30.
  { key: 'ryan/return', clientId: client(12), service: 'personal_training', createdAt: '2026-04-10 15:00:00+00',
    revisions: [{ draft: ryanPlan, publish: true }] },
];

export const programId = (key: string) => seedId(`program/${key}`);

export const SEED_SQL_PATH = new URL('../../supabase/seed/programs.sql', import.meta.url);

/** JSON with one exercise per line: readable diffs without a multi-megabyte file. */
function formatDocument(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = indent + ' ';
    return `[\n${value.map((v) => inner + formatDocument(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    if ('logicalKey' in value || ('title' in value && 'url' in value)) return JSON.stringify(value);
    const inner = indent + ' ';
    const entries = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatDocument(v, inner)}`);
    return `{\n${entries.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;

export function renderSeedSql(programs: SeedProgram[] = seedPrograms): string {
  const calls = programs.map((p) => {
    const revisions = p.revisions.map((r) => {
      const json = formatDocument(r.draft);
      if (json.includes('$doc$')) throw new Error(`${p.key}: document contains the SQL quote tag`);
      return `  (${r.publish}, $doc$${json}$doc$)`;
    });
    return [
      `-- ${p.key}`,
      `select pg_temp.seed_program(${literal(programId(p.key))}, ${literal(p.clientId)}, ${literal(p.service)}, ${literal(p.createdAt)}, ${p.archive ?? false}, array[`,
      revisions.join(',\n'),
      `]::pg_temp.seed_revision[]);`,
    ].join('\n');
  });

  return `-- GENERATED by scripts/seed/programs.ts. Edit the TypeScript and run \`pnpm seed:programs\`.
-- LOCAL DEVELOPMENT DATA ONLY: demo programs for the fictional clients in seed.sql.
--
-- Documents go through the real write path as the seeded admin: save_draft validates each one
-- against the ProgramDraft contract and publish_revision applies the publish checks. Programs on
-- ended services were published while the service ran, so the service is reopened for that step.
begin;

select set_config('request.jwt.claims', json_build_object('sub', ${literal(SEED_ADMIN)}, 'role', 'authenticated')::text, true);

create type pg_temp.seed_revision as (publish boolean, doc jsonb);

create function pg_temp.seed_program(
  p_id uuid, p_client uuid, p_service public.service_kind, p_created_at timestamptz, p_archive boolean,
  p_revisions pg_temp.seed_revision[]
) returns void language plpgsql as $$
declare
  enrollment public.service_enrollments;
  rev pg_temp.seed_revision;
  saved jsonb;
  draft_version integer;
begin
  select * into strict enrollment from public.service_enrollments
  where client_id = p_client and service = p_service order by starts_on desc limit 1;
  if enrollment.status = 'ended' then
    update public.service_enrollments set status = 'active', ends_on = null, archived_at = null where id = enrollment.id;
  end if;

  insert into public.programs (id, client_id, enrollment_id, service, created_by, created_at)
  values (p_id, p_client, enrollment.id, p_service, ${literal(SEED_ADMIN)}, p_created_at);

  foreach rev in array p_revisions loop
    saved := public.save_draft(p_id, null, rev.doc);
    draft_version := (saved ->> 'lockVersion')::integer;
    if rev.publish then
      perform public.publish_revision(p_id, draft_version);
      draft_version := null;
    end if;
  end loop;

  if p_archive then
    perform public.remove_program(p_id, draft_version, true);
  end if;
  if enrollment.status = 'ended' then
    update public.service_enrollments set status = 'ended', ends_on = enrollment.ends_on, archived_at = enrollment.archived_at
    where id = enrollment.id;
  end if;
end $$;

${calls.join('\n\n')}

commit;
`;
}
