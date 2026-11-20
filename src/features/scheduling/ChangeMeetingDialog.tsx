import { useState } from 'react';
import { Checkbox, Chip, SegmentedControl } from '@/components/controls';
import { Dialog, DialogBody } from '@/components/Dialog';
import { Alert, Button, Spinner, TextAreaField } from '@/components/ui';
import { insideLateWindow, openTimesByDay } from '@/domain/scheduling/requests';
import { schedulingError, useOpenTimes, useRequestMeetingChange, type Meeting } from './api';
import { sessionDay, sessionMoment, sessionRange, sessionTime } from './time';

export type ChangeKind = 'reschedule' | 'cancel';

const dayLabel = (date: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${date}T00:00:00Z`));

/**
 * A client asks to reschedule (picking one of the coach's open times, or just writing) or to cancel
 * one meeting (decision 0050). Nothing changes until the coach answers. Times are in the client's zone.
 */
export function ChangeMeetingDialog({ meeting, timeZone, initialKind, onClose, onSent }: {
  meeting: Meeting; timeZone: string; initialKind: ChangeKind; onClose: () => void; onSent: (message: string) => void;
}) {
  // Chosen once, so a retried send returns the same request.
  const [requestId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<ChangeKind>(initialKind);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [noneWork, setNoneWork] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const open = useOpenTimes(meeting.id);
  const send = useRequestMeetingChange();

  const days = open.data ? openTimesByDay(open.data.times, timeZone) : [];
  const shownDay = days.find((d) => d.date === day) ?? days[0] ?? null;
  const canPick = !!open.data?.hasAvailability && days.length > 0;
  const messageOnly = kind === 'reschedule' && (!canPick || noneWork);
  const lateHours = open.data?.lateCancelHours ?? null;
  const late = lateHours !== null && insideLateWindow(meeting, Date.now(), lateHours);
  const coach = meeting.coachName ?? 'your coach';

  function submit() {
    if (kind === 'reschedule' && !time && !message.trim()) {
      setProblem(messageOnly ? 'Tell your coach which times work for you.' : 'Pick a new time, or choose “None of these work” and write a message.');
      return;
    }
    setProblem(null);
    send.mutate({ requestId, meetingId: meeting.id, kind, message: message.trim(), preferredStartsAt: kind === 'reschedule' && !messageOnly ? time : null }, {
      onSuccess: () => onSent(kind === 'cancel' ? 'Cancellation request sent.' : 'Reschedule request sent.'),
      onError: (error) => {
        // Someone else took the time meanwhile: show fresh times and keep the message.
        if ((error as { code?: string }).code === '55000' && time) { setTime(null); void open.refetch(); }
      },
    });
  }

  return (
    <Dialog title={kind === 'cancel' ? 'Ask to cancel' : 'Ask to reschedule'} wide={kind === 'reschedule'} onClose={() => { if (!send.isPending) onClose(); }}
      description={<>Your meeting with {coach}: {sessionDay(meeting.startsAt, timeZone)}, {sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}. Nothing changes until {coach} answers.</>}
      footer={<>
        <Button variant="secondary" disabled={send.isPending} onClick={onClose}>Back</Button>
        <Button busy={send.isPending} onClick={submit}>Send request</Button>
      </>}>
      <DialogBody>
        <SegmentedControl label="Request" size="md" value={kind} optionClassName="flex-1" onChange={(next) => { setKind(next); setProblem(null); }}
          options={[{ value: 'reschedule', label: 'Reschedule' }, { value: 'cancel', label: 'Cancel' }]} />
        <Alert visible={!!send.error}>{schedulingError(send.error)}</Alert>
        {late ? (
          <Alert tone="info" title="Short notice">
            {kind === 'cancel'
              ? `This is less than ${lateHours} hours before the meeting, so it will be marked as a late cancellation.`
              : `This is less than ${lateHours} hours before the meeting. If ${coach} can’t move it, the meeting goes ahead as planned.`}
          </Alert>
        ) : null}

        {kind === 'reschedule' ? (
          open.isPending ? <Spinner label="Loading open times" />
            : open.error ? <Alert title="Could not load open times">{schedulingError(open.error)}</Alert>
            : !canPick ? (
              <p className="text-sm text-muted">
                {open.data.hasAvailability ? 'There are no open times coming up.' : `${coach.charAt(0).toUpperCase()}${coach.slice(1)} hasn’t shared their availability yet.`}{' '}
                Tell them what works and they’ll pick a time.
              </p>
            ) : (
              <>
                <fieldset disabled={noneWork} className="min-w-0 disabled:opacity-50">
                  <legend className="mb-2 text-sm font-medium">Pick a day</legend>
                  <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Days with open times">
                    {days.map((d) => (
                      <li key={d.date} className="shrink-0">
                        <Chip pressed={shownDay?.date === d.date} onClick={() => { setDay(d.date); setTime(null); }}>{dayLabel(d.date)}</Chip>
                      </li>
                    ))}
                  </ul>
                  {shownDay ? (
                    <>
                      <p className="mb-2 mt-4 text-sm font-medium">Pick a time <span className="font-normal text-muted">({meeting.durationMinutes} min)</span></p>
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                        {shownDay.times.map((t) => (
                          <li key={t}><Chip pressed={time === t} className="w-full tabular-nums" onClick={() => setTime(t)}>{sessionTime(t, timeZone)}</Chip></li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </fieldset>
                {time && !noneWork ? <p className="text-sm">New time: <span className="font-medium">{sessionMoment(time, timeZone)}</span> · {sessionRange(time, meeting.durationMinutes, timeZone)}</p> : null}
                <Checkbox label="None of these work" checked={noneWork} onChange={(event) => { setNoneWork(event.target.checked); if (event.target.checked) setTime(null); }} />
              </>
            )
        ) : null}

        <TextAreaField label={kind === 'cancel' ? 'Reason (optional)' : messageOnly ? 'Message' : 'Message (optional)'} rows={3} maxLength={1000}
          value={message} onChange={(event) => setMessage(event.target.value)}
          hint={messageOnly ? 'Say which days and times work for you.' : undefined} />
        <Alert visible={!!problem}>{problem}</Alert>
      </DialogBody>
    </Dialog>
  );
}
