import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/Dialog';
import { Alert, Button, Spinner } from '@/components/ui';
import { fetchProgramDraft, programErrorMessage, useRemoveProgram, type ProgramRow } from './api';
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
  return <Dialog title={`${action} program?`} description={archive
    ? 'Published programs are archived so their content and client history stay available. This program will become read-only.'
    : 'This permanently deletes the unpublished program and its draft content.'}
    onClose={() => { if (!remove.isPending) onClose(); }} footer={<>
      <Button variant="secondary" disabled={remove.isPending} onClick={onClose}>Keep program</Button>
      <Button variant="danger" busy={remove.isPending} disabled={!snapshot.data || snapshot.isFetching || !!snapshot.error || remove.isError}
        onClick={() => remove.mutate({ programId: program.id, expectedVersion: snapshot.data!.lockVersion, archive: !!archive, service: program.service }, { onSuccess: onClose })}>{action} program</Button>
    </>}>
    <div className="p-4 sm:p-5">
      {snapshot.isPending ? <Spinner label="Checking program" /> : null}
      <Alert visible={!!(snapshot.error || remove.error)} title="Program was not removed">{programErrorMessage(snapshot.error ?? remove.error)} Close and reopen this dialog to review the latest program and try again.</Alert>
      {snapshot.data ? <p className="text-sm">{snapshot.data.draft?.title.trim() || 'Untitled program'}</p> : null}
    </div>
  </Dialog>;
}
