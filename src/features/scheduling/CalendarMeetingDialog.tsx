import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useViewer } from '@/app/auth';
import { ComboboxField } from '@/components/ComboboxField';
import { SegmentedControl } from '@/components/controls';
import { Dialog } from '@/components/Dialog';
import { Alert, Button } from '@/components/ui';
import { LoadingRegion, SkeletonText } from '@/components/Skeleton';
import { useClientPrograms } from '@/features/programs/api';
import { useClients, useTransferCoachOptions, type ClientRow } from '@/features/clients/api';
import type { SavedOptions } from '@/components/Toast';
import { schedulingError, useMeetingContext } from './api';
import type { FormFrame, MeetingStart } from './formFrame';
import { NewMeetingForm } from './MeetingDialog';
import { PatternForm } from './PatternDialog';
import { sessionDay, sessionRange, zoneLabel } from './time';

type Mode = 'once' | 'repeating';

/** Clients a meeting can be made for: not disabled, with a service that's still running. */
const schedulable = (client: ClientRow) => client.status !== 'disabled'
  && client.service_enrollments.some((e) => !e.archived_at && (e.status === 'active' || e.status === 'paused'));

/**
 * New meeting from the Meetings page calendar (decision 0066): the clicked or dragged time, a client,
 * then the client page's own one-off or repeating form. One dialog throughout, so choosing a client
 * or switching between One meeting and Repeating never reopens it; the time carries across.
 */
export function CalendarMeetingDialog({ start, timeZone, onClose, onSaved }: {
  start: MeetingStart; timeZone: string; onClose: () => void; onSaved: (message: ReactNode, options?: SavedOptions) => void;
}) {
  const viewer = useViewer().data;
  const isAdmin = viewer?.staffRole === 'admin';
  const clients = useClients();
  const coaches = useTransferCoachOptions(isAdmin);
  const [clientId, setClientId] = useState('');
  const [mode, setMode] = useState<Mode>('once');
  const [current, setCurrent] = useState(start);
  // Whether the form is saving, so Escape or the backdrop can't close the dialog mid-save.
  const busy = useRef(false);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);

  // An administrator sees whose client it is, unless it's their own (owner choice).
  const options = useMemo(() => (clients.data ?? []).filter(schedulable).map((client) => {
    const coach = isAdmin && client.primary_coach_id && client.primary_coach_id !== viewer?.userId
      ? coaches.data?.find((c) => c.id === client.primary_coach_id)?.name : undefined;
    return { value: client.id, label: coach ? `${client.full_name} (${coach})` : client.full_name };
  }), [clients.data, coaches.data, isAdmin, viewer?.userId]);

  // The chosen form's body shows here; its footer goes into the dialog's footer.
  const frame: FormFrame = ({ body, footer: buttons, busy: saving }) => {
    busy.current = saving;
    return <>{body}{footer ? createPortal(buttons, footer) : null}</>;
  };

  return (
    <Dialog wide title="New meeting" onClose={() => { if (!busy.current) onClose(); }}
      description={`${sessionDay(current.startsAt.toISOString(), timeZone)}, ${sessionRange(current.startsAt.toISOString(), current.durationMinutes, timeZone)} (${current.durationMinutes} min). Times here are in ${zoneLabel(timeZone)}.`}
      footer={<>
        {clientId ? null : <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled>Add meeting</Button>
        </>}
        <div ref={setFooter} className="contents" />
      </>}>
      <div className="grid gap-5 px-4 pt-4 sm:px-5 sm:pt-5">
        {clients.isPending ? <LoadingRegion label="Loading clients"><SkeletonText width="w-64" /></LoadingRegion> : null}
        <Alert visible={!!clients.error} title="Could not load clients">{schedulingError(clients.error)}</Alert>
        {clients.data ? (
          <ComboboxField label="Client" name="client" options={options} onValueChange={setClientId}
            hint={options.length ? undefined : 'No clients have a service that can have meetings.'} />
        ) : null}
        <div className="flex">
          <SegmentedControl label="How often" size="md" value={mode} onChange={setMode}
            options={[{ value: 'once', label: 'One meeting' }, { value: 'repeating', label: 'Repeating' }]} />
        </div>
      </div>
      {clientId ? (
        // Keyed, so each client and form starts from the time on screen.
        <ClientForm key={`${clientId}:${mode}`} clientId={clientId} mode={mode} start={current} frame={frame}
          onStartChange={setCurrent} onClose={onClose} onSaved={onSaved} />
      ) : (
        <p className="px-4 pb-4 pt-5 text-sm text-muted sm:px-5 sm:pb-5">Choose a client to set the time, what it's about, the program and notes.</p>
      )}
    </Dialog>
  );
}

function ClientForm({ clientId, mode, start, frame, onStartChange, onClose, onSaved }: {
  clientId: string; mode: Mode; start: MeetingStart; frame: FormFrame; onStartChange: (start: MeetingStart) => void;
  onClose: () => void; onSaved: (message: ReactNode, options?: SavedOptions) => void;
}) {
  const viewer = useViewer().data;
  const context = useMeetingContext(clientId);
  const programs = useClientPrograms(clientId);
  if (context.error) return <div className="p-4 sm:p-5"><Alert title="Could not load this client's meetings">{schedulingError(context.error)}</Alert></div>;
  if (!context.data || programs.isPending) {
    return <LoadingRegion label="Loading the client's services" className="grid gap-3 p-4 sm:p-5"><SkeletonText width="w-48" /><SkeletonText width="w-72" /></LoadingRegion>;
  }
  const c = context.data;
  if (!c.coachId) return <div className="p-4 sm:p-5"><Alert title="No primary coach">Give this client a primary coach on their page before adding meetings.</Alert></div>;
  // Meetings belong to the client's primary coach, which may not be the person clicking.
  const notice = c.coachId !== viewer?.userId && c.coachName
    ? <p className="px-4 pt-5 text-sm text-muted sm:px-5">This meeting will be with {c.coachName}. Times below are in {zoneLabel(c.timezone)}, their time zone.</p>
    : null;
  const framed: FormFrame = (parts) => frame({ ...parts, body: <>{notice}{parts.body}</> });
  const props = { clientId, context: c, programs: programs.data ?? [], onClose, onSaved, frame: framed, start, onStartChange };
  return mode === 'once' ? <NewMeetingForm {...props} /> : <PatternForm {...props} />;
}
