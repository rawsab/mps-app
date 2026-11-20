import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog, DialogBody } from '@/components/Dialog';
import { ArrowUpRightIcon, HistoryIcon, MoveIcon, PlayIcon, StopIcon } from '@/components/icons';
import { Alert, SelectField } from '@/components/ui';
import { PopupMenu } from '@/components/PopupMenu';
import { friendlyError, useTransferClient, useTransferCoachOptions, useUpdateClientStatus, type ClientRow, type CoachOption } from './api';

type RowAction = 'view' | 'activity' | 'transfer' | 'status';
export type ClientRowMenuState = { row: ClientRow; x: number; y: number; returnFocus: HTMLElement | null };

/** Right-click menu for a clients table row. Transfer and disable are admin only, like the detail page. */
export function ClientRowMenu({ menu, isAdmin, onClose }: { menu: ClientRowMenuState; isAdmin: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const coaches = useTransferCoachOptions(isAdmin);
  const [dialog, setDialog] = useState<'transfer' | 'status' | null>(null);
  const { row } = menu;
  const disabled = row.status === 'disabled';
  const targets = transferTargets(coaches.data, row);
  const close = (restoreFocus: boolean) => {
    onClose();
    if (restoreFocus) menu.returnFocus?.focus();
  };

  if (dialog === 'transfer') return <TransferClientDialog row={row} coaches={coaches.data ?? []} onClose={() => close(true)} />;
  if (dialog === 'status') return <ClientAccessDialog row={row} onClose={() => close(true)} />;

  return (
    <PopupMenu<RowAction>
      x={menu.x}
      y={menu.y}
      label={row.full_name}
      onClose={close}
      onAction={(action) => {
        if (action === 'view') { onClose(); navigate(`/coach/clients/${row.id}`); }
        else if (action === 'activity') { onClose(); navigate(`/coach/clients/${row.id}/activity`); }
        else setDialog(action);
      }}
      items={[
        { action: 'view', label: 'View client', icon: <ArrowUpRightIcon /> },
        { action: 'activity', label: 'See recent updates', icon: <HistoryIcon /> },
        ...(isAdmin
          ? [
              // Greyed out until there is another coach to move the client to.
              { action: 'transfer' as const, label: 'Transfer client', icon: <MoveIcon />, disabled: targets.length === 0, separator: true },
              { action: 'status' as const, label: disabled ? 'Reactivate' : 'Disable', icon: disabled ? <PlayIcon /> : <StopIcon />, danger: !disabled },
            ]
          : []),
      ]}
    />
  );
}

/** Every staff member except the client's current primary coach. */
function transferTargets(coaches: CoachOption[] | undefined, row: Pick<ClientRow, 'primary_coach_id'>) {
  return (coaches ?? []).filter((coach) => coach.id !== row.primary_coach_id);
}

function TransferClientDialog({ row, coaches, onClose }: { row: ClientRow; coaches: CoachOption[]; onClose: () => void }) {
  const transfer = useTransferClient();
  const targets = transferTargets(coaches, row);
  const [coachId, setCoachId] = useState(targets[0]?.id ?? '');
  const current = coaches.find((coach) => coach.id === row.primary_coach_id)?.name;
  return (
    <ConfirmDialog
      title={`Transfer ${row.full_name}?`}
      description={`${current ? `Currently with ${current}. ` : 'No primary coach yet. '}The new coach takes over their assignment, upcoming sessions and meetings.`}
      confirmLabel="Transfer client"
      pending={transfer.isPending}
      disabled={!coachId}
      onConfirm={() => transfer.mutate({ clientId: row.id, coachId }, { onSuccess: onClose })}
      onClose={onClose}
    >
      <DialogBody className="grid gap-3">
        <SelectField label="New coach" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
          {targets.map((coach) => (
            <option key={coach.id} value={coach.id}>{coach.role === 'admin' ? `${coach.name} (admin)` : coach.name}</option>
          ))}
        </SelectField>
        <Alert visible={!!transfer.error} title="Client not transferred">{friendlyError(transfer.error)}</Alert>
      </DialogBody>
    </ConfirmDialog>
  );
}

function ClientAccessDialog({ row, onClose }: { row: ClientRow; onClose: () => void }) {
  const setStatus = useUpdateClientStatus();
  const disabled = row.status === 'disabled';
  return (
    <ConfirmDialog
      title={disabled ? `Reactivate ${row.full_name}?` : `Disable ${row.full_name}?`}
      description={disabled
        ? 'Restores access to their published programs and history.'
        : 'Blocks the client from all data immediately, even with an existing session. Their records are kept.'}
      confirmLabel={disabled ? 'Reactivate' : 'Disable client'}
      tone={disabled ? 'primary' : 'danger'}
      pending={setStatus.isPending}
      // Any non-disabled value reactivates; the database derives pending, invited or active.
      onConfirm={() => setStatus.mutate({ id: row.id, status: disabled ? 'pending' : 'disabled' }, { onSuccess: onClose })}
      onClose={onClose}
    >
      <DialogBody>
        <Alert visible={!!setStatus.error} title="Status not changed">{friendlyError(setStatus.error)}</Alert>
        {!setStatus.error ? <p className="text-sm text-muted">They can be {disabled ? 'disabled' : 'reactivated'} again from this menu or their client page.</p> : null}
      </DialogBody>
    </ConfirmDialog>
  );
}
