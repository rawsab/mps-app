import { NutritionIcon, PlusIcon, ProgramIcon, ProgressIcon, TrainingIcon } from '@/components/icons';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Badge, Button, SectionTitle, Spinner } from '@/components/ui';
import type { EnrollmentRow } from '@/features/clients/api';
import { formatDate } from '@/lib/format';
import { SERVICE_LABELS } from '@/lib/services';
import { programErrorMessage, useClientPrograms, useCreateProgram, type ProgramRow } from './api';

import { ActionsMenu, actionItemClass } from '@/components/ActionsMenu';
import { DeleteArchivedProgramDialog, RemoveProgramDialog } from './RemoveProgramDialog';
import type { ServiceKind } from '@/domain/programs/contract';
import { useCreateNutritionProgram } from '@/features/nutrition/programApi';
import { currentProgramId, programCandidates } from '@/domain/programs/current';
import { useRestoreProgram, useSetCurrentProgram } from './api';
import { useViewer } from '@/app/auth';

type ProgramFilter = 'all' | ServiceKind;
const programFilters: { value: ProgramFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mesocycle', label: 'Mesocycle' },
  { value: 'personal_training', label: 'Personal Training' },
  { value: 'nutrition', label: 'Nutritional' },
];

/** All client programs share one list; nutrition keeps its dedicated revision and logging model. */
export function ProgramsCard({ clientId, enrollments }: { clientId: string; enrollments: EnrollmentRow[] }) {
  const programs = useClientPrograms(clientId);
  const create = useCreateProgram();
  const createNutrition = useCreateNutritionProgram();
  const nutritionCreateIds = useRef<Record<string, string>>({});
  const navigate = useNavigate();
  const [removal, setRemoval] = useState<ProgramRow | null>(null);
  const [filter, setFilter] = useState<ProgramFilter>('all');
  const setCurrent = useSetCurrentProgram();
  const restore = useRestoreProgram();
  const [deleting, setDeleting] = useState<ProgramRow | null>(null);
  const isAdmin = useViewer().data?.staffRole === 'admin';
  // Current program per live service (decision 0039), and services with a choice to make.
  const currentIds = new Set(enrollments.map((e) => currentProgramId(e, programs.data ?? [])).filter(Boolean));
  const enrollmentOf = (p: ProgramRow) => enrollments.find((e) => e.id === p.enrollment_id);
  const active = enrollments.filter((e) => e.status !== 'ended' && !e.archived_at);
  // Archived programs come back only into a live service (decision 0045).
  const restorable = (p: ProgramRow) => { const e = enrollmentOf(p); return !!e && e.status !== 'ended' && !e.archived_at; };
  const creating = create.isPending || createNutrition.isPending;
  const visiblePrograms = useMemo(() => (programs.data?.filter((program) => filter === 'all' || program.service === filter) ?? [])
    .sort((a, b) => programLastEditedAt(b) - programLastEditedAt(a)), [programs.data, filter]);

  return (
    <section className="min-w-0" aria-labelledby="client-programs">
      <h2 id="client-programs" className="flex items-center gap-2 text-lg font-semibold"><SectionTitle icon={<ProgramIcon />}>Programs</SectionTitle></h2>
      <p className="mb-4 mt-1 text-sm text-muted">Drafts are visible to staff only. The client sees a program once it is published.</p>
      <div role="group" aria-label="Filter programs by type" className="mb-4 flex flex-wrap gap-1.5">
        {programFilters.map((option) => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${filter === option.value ? 'border-gold/50 bg-gold/10 font-medium text-gold-fg' : 'border-line text-muted hover:bg-surface-raised hover:text-text'}`}>{option.label}</button>)}
      </div>
      {programs.isPending ? <Spinner label="Loading programs" /> : null}
      <Alert visible={!!setCurrent.error} className="mb-3" title="Current program not changed">{programErrorMessage(setCurrent.error)}</Alert>
      <Alert visible={!!restore.error} className="mb-3" title="Program not restored">{programErrorMessage(restore.error)}</Alert>
      <Alert visible={!!programs.error} title="Could not load programs">{programErrorMessage(programs.error)}</Alert>
      {programs.data && visiblePrograms.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {visiblePrograms.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <Link
                to={`/coach/clients/${clientId}/${p.service === 'nutrition' ? 'nutrition' : 'programs'}/${p.id}`}
                className="row-link group flex min-h-14 min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-card py-3 pl-3 pr-2 hover:bg-surface-raised"
              >
                <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-4 ${programServiceIconStyle(p.service)}`}>{programServiceIcon(p.service)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{programTitle(p)}</p>
                  {p.service === 'mesocycle' && programTheme(p) ? <p className="mt-0.5 break-words text-sm text-muted">{programTheme(p)}</p> : null}
                  <p className="text-xs text-muted">{SERVICE_LABELS[p.service]} · created {formatDate(p.created_at)}</p>
                </div>
                <span className="flex items-center gap-2">
                  {currentIds.has(p.id) ? <Badge tone="gold">Current</Badge> : null}
                  {programBadges(p)}
                  <span aria-hidden className="text-muted group-hover:text-text">
                    →
                  </span>
                </span>
              </Link>
              {p.archived_at ? <ActionsMenu label={`Options for ${programTitle(p)}`}>
                <button type="button" className={actionItemClass} disabled={restore.isPending || !restorable(p)} title={restorable(p) ? undefined : 'Its service has ended'}
                  onClick={() => restore.mutate(p.id)}>{restorable(p) ? 'Restore' : 'Restore (service ended)'}</button>
                {isAdmin ? <button type="button" className={`${actionItemClass} text-danger`} onClick={() => setDeleting(p)}>Delete permanently</button> : null}
              </ActionsMenu> : null}
              {!p.archived_at ? <ActionsMenu label={`Options for ${programTitle(p)}`}>{!currentIds.has(p.id) && enrollmentOf(p) && programCandidates(p.enrollment_id, programs.data ?? []).length > 1 ? (
                <button type="button" className={actionItemClass} disabled={setCurrent.isPending} onClick={() => setCurrent.mutate({ enrollmentId: p.enrollment_id, programId: p.id })}>Make current</button>
              ) : null}<button type="button" className={`${actionItemClass} text-danger`} onClick={() => setRemoval(p)}>{p.program_revisions.some((r) => r.status === 'published') ? 'Archive' : 'Delete'} program</button></ActionsMenu> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {programs.data && visiblePrograms.length === 0 ? <p className="mb-4 text-sm text-muted">{filter === 'all' ? 'No programs yet.' : `No ${programFilters.find((option) => option.value === filter)?.label.toLowerCase()} programs yet.`}</p> : null}
      {active.length === 0 ? (
        <p className="text-sm text-muted">Add a service to create a program.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {active.filter((e) => filter === 'all' || filter === e.service).map((e) => (
            <Button
              key={e.id}
              variant="secondary"
              busy={e.service === 'nutrition' ? createNutrition.isPending : create.isPending && create.variables === e.id}
              disabled={creating}
              onClick={() => e.service === 'nutrition'
                ? createNutrition.mutate({ enrollmentId: e.id, programId: nutritionCreateIds.current[e.id] ?? (nutritionCreateIds.current[e.id] = crypto.randomUUID()) }, { onSuccess: (id) => { delete nutritionCreateIds.current[e.id]; navigate(`/coach/clients/${clientId}/nutrition/${id}`); } })
                : create.mutate(e.id, { onSuccess: (id) => navigate(`/coach/clients/${clientId}/programs/${id}`) })}
            >
              <PlusIcon /> {e.service === 'mesocycle' ? 'New Mesocycle Program' : e.service === 'nutrition' ? 'New Nutritional Program' : 'New Personal Training Program'}
            </Button>
          ))}
        </div>
      )}
      <Alert visible={!!create.error} className="mt-3" title="Program not created">{programErrorMessage(create.error)}</Alert>
      <Alert visible={!!createNutrition.error} className="mt-3" title="Program not created">{programErrorMessage(createNutrition.error)}</Alert>
      {removal ? <RemoveProgramDialog program={removal} onClose={() => setRemoval(null)} /> : null}
      {deleting ? <DeleteArchivedProgramDialog program={deleting} title={programTitle(deleting)} onClose={() => setDeleting(null)} /> : null}
    </section>
  );
}

export function programTitle(p: ProgramRow): string {
  const draft = p.program_revisions.find((r) => r.status === 'draft');
  const current = p.program_revisions.find((r) => r.id === p.current_revision_id);
  return (draft?.title || current?.title || '').trim() || 'Untitled program';
}

export function programServiceIcon(service: ServiceKind) {
  if (service === 'nutrition') return <NutritionIcon />;
  if (service === 'mesocycle') return <ProgressIcon />;
  return <TrainingIcon />;
}

export function programServiceIconStyle(service: ServiceKind): string {
  if (service === 'nutrition') return 'bg-success/10 text-success';
  if (service === 'mesocycle') return 'bg-gold/10 text-gold-fg';
  return 'bg-surface-raised text-text';
}

function programLastEditedAt(program: ProgramRow): number {
  return Math.max(
    new Date(program.created_at).getTime(),
    ...program.program_revisions.map((revision) => new Date(revision.updated_at).getTime()),
  );
}

function programBadges(p: ProgramRow) {
  if (p.archived_at) return <Badge>Archived</Badge>;
  const current = p.program_revisions.find((r) => r.id === p.current_revision_id);
  const draft = p.program_revisions.some((r) => r.status === 'draft');
  return (
    <>
      {current ? <Badge tone="gold">Live</Badge> : <Badge>Not published</Badge>}
      {draft && current ? <Badge>Draft changes</Badge> : null}
    </>
  );
}

function programTheme(program: ProgramRow): string {
  const revision = program.program_revisions.find((revision) => revision.status === 'draft')
    ?? program.program_revisions.find((revision) => revision.id === program.current_revision_id);
  return revision?.program_theme?.trim() ?? '';
}
