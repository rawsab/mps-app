import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/Dialog';
import { Alert } from '@/components/ui';
import { useClientPrograms } from '@/features/programs/api';
import { schedulingError, useMeeting, useMeetingContext, type MeetingSchedule } from './api';
import { MeetingDialog } from './MeetingDialog';
import { MeetingDialogSkeleton } from './MeetingSkeletons';
import { PatternDialog } from './PatternDialog';
import type { SavedOptions } from '@/components/Toast';

/**
 * The full meeting dialog away from the client's page (the Meetings page, `?meeting=`). It loads
 * the meeting to learn its client, then that client's meeting context and programs, and opens the
 * pattern editor in place for "change the repeating pattern".
 */
export function MeetingDialogHost({ meetingId, onClose, onSaved }: { meetingId: string; onClose: () => void; onSaved: (message: ReactNode, options?: SavedOptions) => void }) {
  const meeting = useMeeting(meetingId);
  if (meeting.data) return <ClientMeetingDialog meetingId={meetingId} clientId={meeting.data.clientId} onClose={onClose} onSaved={onSaved} />;
  return (
    <Dialog title="Meeting" onClose={onClose}>
      <div className="p-4 sm:p-5">
        {meeting.isPending ? <MeetingDialogSkeleton /> : null}
        <Alert visible={!!meeting.error} title="Could not load the meeting">{schedulingError(meeting.error)}</Alert>
        {meeting.data === null ? <p className="text-sm text-muted">This meeting no longer exists.</p> : null}
      </div>
    </Dialog>
  );
}

function ClientMeetingDialog({ meetingId, clientId, onClose, onSaved }: {
  meetingId: string; clientId: string; onClose: () => void; onSaved: (message: ReactNode, options?: SavedOptions) => void;
}) {
  const context = useMeetingContext(clientId);
  const programs = useClientPrograms(clientId);
  const [pattern, setPattern] = useState<{ schedule: MeetingSchedule; from: string } | null>(null);

  if (!context.data) {
    return (
      <Dialog title="Meeting" onClose={onClose}>
        <div className="p-4 sm:p-5">
          {context.isPending ? <MeetingDialogSkeleton /> : null}
          <Alert visible={!!context.error} title="Could not load the meeting">{schedulingError(context.error)}</Alert>
        </div>
      </Dialog>
    );
  }
  if (pattern) {
    return <PatternDialog clientId={clientId} context={context.data} programs={programs.data ?? []} schedule={pattern.schedule} from={pattern.from}
      onClose={onClose} onSaved={onSaved} />;
  }
  return <MeetingDialog meetingId={meetingId} context={context.data} programs={programs.data ?? []} onClose={onClose} onSaved={onSaved}
    onChangePattern={(schedule, from) => setPattern({ schedule, from })} />;
}
