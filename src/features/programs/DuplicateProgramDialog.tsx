import { useNavigate } from 'react-router';
import { Dialog, DialogBody } from '@/components/Dialog';
import { Alert, Button } from '@/components/ui';
import { programErrorMessage, useDuplicateProgram } from './api';

/**
 * Duplicates a training program into a new draft and opens it (decision 0061). A live, published
 * program can be replaced: it is archived and the copy becomes current, the coach's routine for
 * personal training. Otherwise the original stays as it is.
 */
export function DuplicateProgramDialog({ clientId, programId, title, canReplace, onClose }: {
  clientId: string; programId: string; title: string;
  /** Published and not archived, so it can be archived for the copy. */
  canReplace: boolean;
  onClose: () => void;
}) {
  const duplicate = useDuplicateProgram();
  const navigate = useNavigate();
  const run = (replace: boolean) => duplicate.mutate({ programId, replace }, {
    onSuccess: (id) => { onClose(); navigate(`/coach/clients/${clientId}/programs/${id}`); },
  });
  const busy = duplicate.isPending ? duplicate.variables?.replace : undefined;

  return (
    <Dialog title="Duplicate program?" onClose={onClose}
      description={`Makes a draft copy of “${title}” with the same weeks, days, exercises and notes, then opens it. The client sees the copy once you publish it.`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={duplicate.isPending}>Cancel</Button>
        {canReplace ? <>
          <Button variant="secondary" busy={busy === false} disabled={duplicate.isPending} onClick={() => run(false)}>Keep both</Button>
          <Button busy={busy === true} disabled={duplicate.isPending} onClick={() => run(true)}>Archive this one, use the copy</Button>
        </> : <Button busy={duplicate.isPending} disabled={duplicate.isPending} onClick={() => run(false)}>Duplicate</Button>}
      </>}>
      <DialogBody className="grid gap-3 text-sm">
        {canReplace ? <>
          <p><span className="font-medium">Archive this one, use the copy:</span> this program is archived and the copy becomes the current program. The client can still open this one under Archived programs.</p>
          <p><span className="font-medium">Keep both:</span> this program stays as it is, and the copy is added beside it.</p>
        </> : null}
        <Alert visible={!!duplicate.error} title="Program not duplicated">{programErrorMessage(duplicate.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}
