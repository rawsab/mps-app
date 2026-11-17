import { useState } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { ArrowUpRightIcon } from '@/components/icons';
import { Alert, Badge, Button } from '@/components/ui';
import { currentProgramId, programCandidates } from '@/domain/programs/current';
import { friendlyError, type EnrollmentRow } from '@/features/clients/api';
import { SERVICE_LABELS } from '@/lib/services';
import { useSetCurrentProgram, type ProgramRow } from './api';
import { programTitle } from './ProgramsCard';

export const programPath = (clientId: string, program: Pick<ProgramRow, 'id' | 'service'>) =>
  `/coach/clients/${clientId}/${program.service === 'nutrition' ? 'nutrition' : 'programs'}/${program.id}`;

/**
 * The service's current program as a one-line link on the Services card (decision 0039). With
 * several programs and no choice yet, it asks the coach to choose.
 */
export function CurrentProgramBox({ clientId, enrollment, programs }: { clientId: string; enrollment: EnrollmentRow; programs: ProgramRow[] }) {
  const [choosing, setChoosing] = useState(false);
  const candidates = programCandidates(enrollment.id, programs);
  const currentId = currentProgramId(enrollment, programs);
  const current = candidates.find((p) => p.id === currentId);
  if (!candidates.length) return null;
  const box = 'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-card border border-line bg-surface px-3 text-sm';

  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1">
      {current ? (
        <Link to={programPath(clientId, current)} title={programTitle(current)} aria-label={`Open current program: ${programTitle(current)}`}
          className={`${box} group transition-colors hover:border-muted/70 hover:bg-surface-raised`}>
          <span className="min-w-0 flex-1 truncate">{programTitle(current)}</span>
          <span className="text-muted group-hover:text-text"><ArrowUpRightIcon /></span>
        </Link>
      ) : (
        <button type="button" onClick={() => setChoosing(true)} className={`${box} text-left text-muted transition-colors hover:border-muted/70 hover:text-text`}>
          <span className="min-w-0 flex-1 truncate">{candidates.length} programs · choose current</span>
        </button>
      )}
      {current && candidates.length > 1 ? (
        <Button variant="ghost" className="shrink-0 px-2 text-xs" onClick={() => setChoosing(true)}>Change</Button>
      ) : null}
      {choosing ? <ChooseCurrentDialog enrollment={enrollment} candidates={candidates} currentId={currentId} onClose={() => setChoosing(false)} /> : null}
    </div>
  );
}

export function ChooseCurrentDialog({ enrollment, candidates, currentId, onClose }: {
  enrollment: EnrollmentRow; candidates: ProgramRow[]; currentId: string | null; onClose: () => void;
}) {
  const save = useSetCurrentProgram();
  const [choice, setChoice] = useState(currentId ?? '');
  return (
    <Dialog title={`Current ${SERVICE_LABELS[enrollment.service]} program`}
      description="Meetings about this service use it unless another program is chosen. The client sees it marked as current."
      onClose={() => { if (!save.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={save.isPending} disabled={!choice || choice === currentId}
          onClick={() => save.mutate({ enrollmentId: enrollment.id, programId: choice }, { onSuccess: onClose })}>Make current</Button>
      </>}>
      <fieldset className="grid gap-1 p-4 sm:p-5">
        <legend className="sr-only">Programs</legend>
        {candidates.map((program) => {
          const published = !!program.current_revision_id;
          return (
            <label key={program.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card px-2 hover:bg-surface-raised has-[:checked]:bg-surface-raised">
              <input type="radio" name="current-program" className="size-4 accent-gold" checked={choice === program.id} onChange={() => setChoice(program.id)} />
              <span className="min-w-0 flex-1 truncate">{programTitle(program)}</span>
              {program.id === currentId ? <Badge tone="gold">Current</Badge> : null}
              {!published ? <Badge>Not published</Badge> : null}
            </label>
          );
        })}
        <Alert visible={!!save.error} className="mt-2" title="Not changed">{friendlyError(save.error)}</Alert>
      </fieldset>
    </Dialog>
  );
}
