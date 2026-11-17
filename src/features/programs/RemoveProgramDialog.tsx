import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/Dialog';
import { Alert, Button, Spinner } from '@/components/ui';
import { fetchProgramDraft, programErrorMessage, useRemoveProgram, type ProgramRow } from './api';

/** Capture the draft version for confirmation; a concurrent save invalidates this removal. */
export function RemoveProgramDialog({ program, onClose }: { program: ProgramRow; onClose: () => void }) {
  const snapshot = useQuery({
    queryKey: ['program-removal', program.id], queryFn: () => fetchProgramDraft(program.id),
    staleTime: 0, refetchOnWindowFocus: false,
  });
  const remove = useRemoveProgram();
  const archive = program.program_revisions.some((revision) => revision.status === 'published') || snapshot.data?.status === 'published';
  const action = archive ? 'Archive' : 'Delete';
  return <Dialog title={`${action} program?`} description={archive
    ? 'Published programs are archived so their revisions and client history stay available. This program will become read-only.'
    : 'This permanently deletes the unpublished program and all of its draft weeks, days and exercises.'}
    onClose={() => { if (!remove.isPending) onClose(); }} footer={<>
      <Button variant="secondary" disabled={remove.isPending} onClick={onClose}>Keep program</Button>
      <Button variant="danger" busy={remove.isPending} disabled={!snapshot.data || snapshot.isFetching || !!snapshot.error || remove.isError}
        onClick={() => remove.mutate({ programId: program.id, expectedVersion: snapshot.data!.lockVersion, archive: !!archive }, { onSuccess: onClose })}>{action} program</Button>
    </>}>
    <div className="p-4 sm:p-5">
      {snapshot.isPending ? <Spinner label="Checking program" /> : null}
      {snapshot.error || remove.error ? <Alert title="Program was not removed">{programErrorMessage(snapshot.error ?? remove.error)} Close and reopen this dialog to review the latest version and try again.</Alert> : null}
      {snapshot.data ? <p className="text-sm">{snapshot.data.draft?.title.trim() || 'Untitled program'}</p> : null}
    </div>
  </Dialog>;
}
