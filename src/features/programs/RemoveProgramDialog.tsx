import { useQuery } from '@tanstack/react-query';
import { ConfirmDialog, DialogBody } from '@/components/Dialog';
import { useState } from 'react';
import { TrashIcon } from '@/components/icons';
import { Alert, Spinner, TextField } from '@/components/ui';
import { fetchProgramDraft, programErrorMessage, useDeleteArchivedProgram, useProgramWorkoutCount, useRemoveProgram, type ProgramRow } from './api';
import { fetchNutritionProgram } from '@/features/nutrition/programApi';

/** Capture the draft version for confirmation; a concurrent save invalidates this removal. */
export function RemoveProgramDialog({ program, onClose }: { program: ProgramRow; onClose: () => void }) {
  const snapshot = useQuery({
    queryKey: ['program-removal', program.id], queryFn: async () => {
      if (program.service !== 'nutrition') return fetchProgramDraft(program.id);
      const data = await fetchNutritionProgram(program.id);
      return { lockVersion: data.revision.status === 'draft' ? data.revision.lock_version : null, status: data.revision.status,
        draft: { title: data.revision.program_style } };
    },
    staleTime: 0, refetchOnWindowFocus: false,
  });
  const remove = useRemoveProgram();
  const archive = program.program_revisions.some((revision) => revision.status === 'published') || snapshot.data?.status === 'published';
  const action = archive ? 'Archive' : 'Delete';
  return <ConfirmDialog title={`${action} program?`} description={archive
    ? 'Published programs are archived so their content and client history stay available. This program will become read-only.'
    : 'This permanently deletes the unpublished program and its draft content.'}
    cancelLabel="Keep program" confirmLabel={`${action} program`} tone="danger" pending={remove.isPending}
    disabled={!snapshot.data || snapshot.isFetching || !!snapshot.error || remove.isError}
    onConfirm={() => remove.mutate({ programId: program.id, expectedVersion: snapshot.data!.lockVersion, archive: !!archive, service: program.service }, { onSuccess: onClose })}
    onClose={onClose}>
    <DialogBody>
      {snapshot.isPending ? <Spinner label="Checking program" /> : null}
      <Alert visible={!!(snapshot.error || remove.error)} title="Program was not removed">{programErrorMessage(snapshot.error ?? remove.error)} Close and reopen this dialog to review the latest program and try again.</Alert>
      {snapshot.data ? <p className="text-sm">{snapshot.data.draft?.title.trim() || 'Untitled program'}</p> : null}
    </DialogBody>
  </ConfirmDialog>;
}

/**
 * Admin only: permanently deletes an archived program, published revisions and the client's logged
 * workouts included (decision 0045), after typing the program's title.
 */
export function DeleteArchivedProgramDialog({ program, title, onClose }: { program: ProgramRow; title: string; onClose: () => void }) {
  const remove = useDeleteArchivedProgram();
  const training = program.service !== 'nutrition';
  const workouts = useProgramWorkoutCount(program.id, training);
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim().toLowerCase() === title.trim().toLowerCase();
  const logged = workouts.data ?? 0;

  return <ConfirmDialog title="Delete program permanently?" description="It disappears for you and the client. This can’t be undone."
    cancelLabel="Keep archived" confirmLabel={<><TrashIcon />Delete permanently</>} tone="danger" pending={remove.isPending}
    disabled={!confirmed || (training && workouts.isPending)}
    onConfirm={() => remove.mutate(program.id, { onSuccess: onClose })} onClose={onClose}>
    <DialogBody className="grid gap-4">
      {training && workouts.isPending ? <Spinner label="Checking logged workouts" /> : null}
      <Alert visible={!!workouts.error} title="Could not check logged workouts">{programErrorMessage(workouts.error)}</Alert>
      <p className="text-sm">
        Removes <span className="font-medium">{title}</span>, every revision
        {training ? <>, and the client’s {logged === 1 ? '1 logged workout' : `${logged} logged workouts`} and Stimulus & Fatigue answers for it</> : null}.
        {training ? null : ' Daily nutrition logs are kept.'}
      </p>
      <TextField label={`Type “${title}” to confirm`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
      <Alert visible={!!remove.error} title="Program was not deleted">{programErrorMessage(remove.error)}</Alert>
    </DialogBody>
  </ConfirmDialog>;
}
