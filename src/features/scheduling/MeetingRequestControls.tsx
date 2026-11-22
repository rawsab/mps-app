import { useState, type ReactNode } from 'react';
import { ConfirmDialog, DialogBody } from '@/components/Dialog';
import { Alert, Badge, Button } from '@/components/ui';
import { canRequestChange } from '@/domain/scheduling/requests';
import { schedulingError, useWithdrawMeetingRequest, type Meeting } from './api';
import { ChangeMeetingDialog, type ChangeKind } from './ChangeMeetingDialog';
import { sessionMoment } from './time';

/**
 * A client's ways to change one meeting (decision 0050): the change dialog, and withdrawing a
 * pending request. Shared by Home's next meeting and the client's Meetings list.
 */
export function useMeetingChange(meeting: Meeting, timeZone: string, onSent: (message: string) => void) {
  const [changing, setChanging] = useState<ChangeKind | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useWithdrawMeetingRequest();
  const pending = meeting.request?.status === 'pending' ? meeting.request : null;
  const dialogs: ReactNode = (
    <>
      {changing ? (
        <ChangeMeetingDialog meeting={meeting} timeZone={timeZone} initialKind={changing} onClose={() => setChanging(null)}
          onSent={(message) => { setChanging(null); onSent(message); }} />
      ) : null}
      {withdrawing && pending ? (
        <ConfirmDialog title="Withdraw your request?" confirmLabel="Withdraw" pending={withdraw.isPending}
          description={pending.kind === 'cancel' ? 'The meeting stays as it is.' : 'The meeting stays at its current time, and any time you asked for is released.'}
          onClose={() => { withdraw.reset(); setWithdrawing(false); }}
          onConfirm={() => withdraw.mutate(pending.id, { onSuccess: () => { setWithdrawing(false); onSent('Request withdrawn.'); } })}>
          <DialogBody><Alert visible={!!withdraw.error}>{schedulingError(withdraw.error)}</Alert></DialogBody>
        </ConfirmDialog>
      ) : null}
    </>
  );
  return { change: setChanging, withdraw: () => setWithdrawing(true), dialogs };
}

/** Reschedule and Cancel meeting, while the meeting can still be changed. */
export function ChangeButtons({ meeting, now, onChange, className = '' }: { meeting: Meeting; now: number; onChange: (kind: ChangeKind) => void; className?: string }) {
  if (!canRequestChange(meeting, now)) return null;
  return (
    <div className={`flex flex-wrap justify-end gap-1 ${className}`}>
      <Button variant="ghost" onClick={() => onChange('reschedule')}>Reschedule</Button>
      <Button variant="ghost-danger" onClick={() => onChange('cancel')}>Cancel meeting</Button>
    </div>
  );
}

/** The client's open request on a meeting: what they asked for, and Withdraw request. */
export function PendingRequestNotice({ meeting, timeZone, onWithdraw, className = '' }: { meeting: Meeting; timeZone: string; onWithdraw: () => void; className?: string }) {
  const pending = meeting.request?.status === 'pending' ? meeting.request : null;
  if (!pending) return null;
  return (
    <div className={`rounded-card border border-gold/40 bg-gold/5 px-3 py-2.5 text-sm ${className}`}>
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone="gold">{pending.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge>
        <span className="text-muted">Waiting for {meeting.coachName ?? 'your coach'}</span>
      </p>
      {pending.preferredStartsAt ? <p className="mt-1.5">Asked for {sessionMoment(pending.preferredStartsAt, timeZone)}</p> : null}
      {pending.message ? <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-muted">“{pending.message}”</p> : null}
      <div className="mt-2 flex justify-end">
        <Button variant="ghost-gold" onClick={onWithdraw}>Withdraw request</Button>
      </div>
    </div>
  );
}
