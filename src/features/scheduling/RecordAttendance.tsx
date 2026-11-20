import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Link } from 'react-router';
import { ConfirmDialog } from '@/components/Dialog';
import { NoticePresence } from '@/components/NoticePresence';
import { CheckIcon, CrossIcon } from '@/components/icons';
import { Alert, Button, Spinner } from '@/components/ui';
import { groupAttendanceByDay, nextFocus } from '@/domain/scheduling/attendance';
import { formatDate } from '@/lib/format';
import { schedulingError, useRecordAttendance, useRecordAttendanceMany, useUndoAttendance, type Attendance, type NeedsAttendance } from './api';
import { topicLabel } from './MeetingTopic';
import { sessionDay, sessionTime } from './time';

/** Rows shown before "Show all". */
const SHOWN = 8;

/** No fill or border until hovered, then a light fill that still shows on a hovered row. */
const ICON_BUTTON = 'inline-flex size-9 items-center justify-center rounded-card transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50';

/** The last thing recorded here. `id` is set when it can be undone (one meeting, not the bulk action). */
type Done = { id: string | null; message: string; key: number };

/** How long a notice (and its Undo) stays, unless the pointer or focus is on it. */
const NOTICE_MS = 10_000;
/** NoticePresence's fold-away (index.css `.notice-motion[data-leaving]`: 100ms delay + 280ms). */
const NOTICE_EXIT_MS = 400;
/** Rows gliding into a gap left by a recorded meeting, or out of the way of one coming back. */
const GLIDE_MS = 260;

/**
 * Ended meetings without attendance, newest first by day (decision 0048). One click marks each
 * Completed or No-show; the row leaves at once, focus moves to the same button on the next row, and
 * a notice offers Undo, which takes the recording back without logging either (undo_attendance).
 */
export function RecordAttendance({ meetings, timeZone, meetingHref, onEmptyChange }: {
  meetings: NeedsAttendance[]; timeZone: string; meetingHref: (id: string) => string;
  /** Whether no rows are left on screen (after any leaving row has gone), so the parent can fold the section. */
  onEmptyChange?: (empty: boolean) => void;
}) {
  const record = useRecordAttendance();
  const undo = useUndoAttendance();
  const recordAll = useRecordAttendanceMany();
  // Rows recorded here, hidden before the list refetches without them.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Rows recorded here that are still fading out. They stay drawn even once the refetched list
  // has dropped them, from the last copy seen.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  // Meetings being saved, and as what.
  const [saving, setSaving] = useState<ReadonlyMap<string, Attendance>>(new Map());
  const seen = useRef(new Map<string, NeedsAttendance>());
  // Each leaving row's notice, shown once the row has gone.
  const pendingNotices = useRef(new Map<string, Omit<Done, 'key'>>());
  for (const meeting of meetings) seen.current.set(meeting.id, meeting);
  const [done, setDoneState] = useState<Done | null>(null);
  const [paused, setPaused] = useState(false);
  // The meeting Undo brought back, which fades in once the rows below have made room.
  const [restored, setRestored] = useState<string | null>(null);
  const rowNodes = useRef(new Map<string, HTMLLIElement>());
  /**
   * Applies a list change and lets the other rows glide from where they were (FLIP, transforms only,
   * so nothing relayouts mid-animation). Measuring, the DOM update (flushSync) and starting the glide
   * all happen in one task, so the browser never paints the rows in their new places first.
   */
  const glide = (update: () => void) => {
    const from = new Map([...rowNodes.current].map(([id, node]) => [id, node.getBoundingClientRect().top]));
    flushSync(update);
    for (const [id, node] of rowNodes.current) {
      const before = from.get(id);
      const shift = before === undefined ? 0 : before - node.getBoundingClientRect().top;
      if (Math.abs(shift) > 0.5) {
        node.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      }
    }
  };
  const setDone = (next: Omit<Done, 'key'> | null) => setDoneState(next && { ...next, key: Date.now() });
  useEffect(() => {
    if (!done || paused) return;
    const timer = setTimeout(() => setDoneState(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [done, paused]);
  const [showAll, setShowAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const heading = useRef<HTMLHeadingElement>(null);

  // Saving rows too: the refetch after a save can drop a row before it starts to fade.
  const kept = new Set([...leaving, ...saving.keys()]);
  const listed = [...meetings, ...[...kept].filter((id) => !meetings.some((m) => m.id === id))
    .map((id) => seen.current.get(id)).filter((m): m is NeedsAttendance => !!m)];
  const drawn = listed.filter((m) => !hidden.has(m.id));
  // Still waiting for attendance: what the count, the bulk action and the empty message go by.
  const visible = drawn.filter((m) => !leaving.has(m.id));
  const days = groupAttendanceByDay(drawn, timeZone, new Date());
  const ordered = days.flatMap((day) => day.meetings);
  const shown = new Set((showAll ? ordered : ordered.slice(0, SHOWN)).map((m) => m.id));
  const error = record.error ?? undo.error ?? recordAll.error;
  const nothingDrawn = drawn.length === 0;
  useEffect(() => { onEmptyChange?.(nothingDrawn); }, [nothingDrawn, onEmptyChange]);

  const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
  };

  function mark(meeting: NeedsAttendance, status: Attendance) {
    const focusId = nextFocus(ordered.map((m) => m.id), meeting.id);
    setSaving((s) => new Map(s).set(meeting.id, status));
    // mutateAsync, not mutate: mutate's own callbacks only run for the latest call, and rows can be
    // marked faster than each save returns. The error still shows through record.error.
    record.mutateAsync({ id: meeting.id, status }).then(() => {
      const notice = { id: meeting.id, message: `Marked ${meeting.clientName}’s ${sessionDay(meeting.startsAt, timeZone)} ${sessionTime(meeting.startsAt, timeZone)} meeting ${status === 'completed' ? 'completed' : 'as a no-show'}.` };
      // One movement at a time: the row fades out, then goes and the rows below glide up
      // (finishLeaving), and only then does the notice unfold. With reduced motion, all at once.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setHidden((s) => toggle(s, meeting.id, true));
        setDone(notice);
      } else {
        pendingNotices.current.set(meeting.id, notice);
        setLeaving((s) => toggle(s, meeting.id, true));
      }
      // After the row has gone: the same button on the next row, or the heading when none are left.
      requestAnimationFrame(() => {
        const next = focusId ? buttons.current.get(`${focusId}:${status}`) : undefined;
        if (next) next.focus(); else heading.current?.focus();
      });
    }, () => undefined).finally(() => setSaving((s) => { const next = new Map(s); next.delete(meeting.id); return next; }));
  }

  function finishLeaving(id: string) {
    glide(() => {
      setHidden((s) => toggle(s, id, true));
      setLeaving((s) => toggle(s, id, false));
    });
    const notice = pendingNotices.current.get(id);
    pendingNotices.current.delete(id);
    if (notice) window.setTimeout(() => setDone(notice), GLIDE_MS);
  }

  function undoLast() {
    const id = done?.id;
    if (!id) return;
    undo.mutate(id, {
      onSuccess: () => {
        // The notice folds away first; the meeting comes back once it has gone.
        setDone(null);
        const wait = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : NOTICE_EXIT_MS;
        window.setTimeout(() => glide(() => {
          setRestored(id);
          setLeaving((s) => toggle(s, id, false));
          setHidden((s) => toggle(s, id, false));
        }), wait);
      },
    });
  }

  return (
    <section aria-labelledby="record-attendance" className="min-w-0">
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 id="record-attendance" ref={heading} tabIndex={-1} className="text-xs font-medium text-muted focus:outline-none">
          Record attendance{visible.length ? <span className="ml-2 text-gold-fg">{visible.length} waiting</span> : null}
        </h2>
        {visible.length > 1 ? (
          <Button variant="ghost" className="min-h-9 px-3" disabled={recordAll.isPending} onClick={() => setConfirmAll(true)}>Mark all completed</Button>
        ) : null}
      </div>

      {/*
        Floats at the bottom of the screen, so showing or hiding it never moves the list. Portalled to
        the body: the route's entrance transform would otherwise anchor `fixed` to the page content.
        Unfolds in and folds away (NoticePresence); a newer message fades over the last one.
      */}
      {createPortal(<div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div role="status" aria-live="polite" className="pointer-events-auto max-w-full"
          onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
          <NoticePresence visible={!!done}>
            {done ? (
              <p key={done.key} className="notice-swap flex min-h-11 flex-wrap items-center gap-x-3 rounded-card border border-line bg-surface-raised px-4 py-1 text-sm shadow-lg">
                <span>{done.message}</span>
                {done.id ? <button type="button" disabled={undo.isPending} onClick={undoLast} className="min-h-11 font-medium text-gold-fg underline underline-offset-2 disabled:opacity-50">Undo</button> : null}
              </p>
            ) : null}
          </NoticePresence>
        </div>
      </div>, document.body)}

      {visible.length === 0 ? <p className="text-sm text-muted">All past meetings have attendance.</p> : null}
      {ordered.length ? (
        // One meeting per row, divided by lines: the date sits above the client's name.
        <ul className="divide-y divide-line">
          {days.flatMap((day) => day.meetings.filter((m) => shown.has(m.id)).map((meeting) => {
            const dayLabel = day.relative === 'today' ? 'Today' : day.relative === 'yesterday' ? 'Yesterday' : formatDate(day.date);
            const label = `${meeting.clientName}, ${sessionDay(meeting.startsAt, timeZone)} ${sessionTime(meeting.startsAt, timeZone)}`;
            const busy = saving.has(meeting.id) || leaving.has(meeting.id) || recordAll.isPending;
            const keep = (status: Attendance) => (node: HTMLButtonElement | null) => {
              if (node) buttons.current.set(`${meeting.id}:${status}`, node); else buttons.current.delete(`${meeting.id}:${status}`);
            };
            return (
              // The divider stays on the plain <li>, so its ends are straight. The inner row lights up while
              // hovered or focused, filling the whole height between dividers (square corners, so it meets
              // them cleanly); its negative margin gives the fill room while the text stays aligned.
              <li key={meeting.id} className={leaving.has(meeting.id) ? 'row-fade-out' : restored === meeting.id ? 'row-fade-in' : undefined}
                ref={(node) => { if (node) rowNodes.current.set(meeting.id, node); else rowNodes.current.delete(meeting.id); }}
                inert={leaving.has(meeting.id) || undefined}
                onAnimationEnd={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.animationName === 'row-fade-out') finishLeaving(meeting.id); else setRestored(null);
                }}>
                <div className="-mx-2 flex items-center gap-2 px-2 py-1.5 transition-colors hover:bg-surface-raised focus-within:bg-surface-raised">
                  <Link to={meetingHref(meeting.id)} className="row-link min-w-0 flex-1 py-0.5">
                    <span className="block text-xs tabular-nums text-muted">{dayLabel} · {sessionTime(meeting.startsAt, timeZone)}</span>
                    <span className="flex min-w-0 items-baseline gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{meeting.clientName}</span>
                      <span className="hidden min-w-0 truncate text-xs text-muted sm:inline">{topicLabel(meeting.services)}</span>
                    </span>
                  </Link>
                  <span className="flex shrink-0">
                    <button type="button" ref={keep('no_show')} disabled={busy} aria-label={`Mark ${label} as a no-show`} title="No-show"
                      onClick={() => mark(meeting, 'no_show')} className={`${ICON_BUTTON} text-danger`}>
                      {saving.get(meeting.id) === 'no_show' ? <Spinner small /> : <CrossIcon />}
                    </button>
                    <button type="button" ref={keep('completed')} disabled={busy} aria-label={`Mark ${label} completed`} title="Mark completed"
                      onClick={() => mark(meeting, 'completed')} className={`${ICON_BUTTON} text-success`}>
                      {saving.get(meeting.id) === 'completed' ? <Spinner small /> : <CheckIcon />}
                    </button>
                  </span>
                </div>
              </li>
            );
          }))}
        </ul>
      ) : null}
      {ordered.length > SHOWN ? (
        <Button variant="ghost" className="mt-1" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : `Show all ${ordered.length}`}</Button>
      ) : null}
      <Alert visible={!!error} className="mt-2" title="Not saved">{schedulingError(error)}</Alert>

      {confirmAll ? (
        <ConfirmDialog title={`Mark ${visible.length} meetings completed?`}
          description="Every meeting in this list is recorded as attended. Use No-Show first for any the client missed. Each one can still be corrected from the meeting."
          confirmLabel="Mark all completed" pending={recordAll.isPending} onClose={() => setConfirmAll(false)}
          onConfirm={() => {
              const ids = visible.slice(0, 200).map((m) => m.id);
              recordAll.mutate({ ids, status: 'completed' }, {
                onSuccess: (result) => {
                  setHidden((s) => new Set([...s, ...ids]));
                  setDone({ id: null, message: `Marked ${result.recorded} ${result.recorded === 1 ? 'meeting' : 'meetings'} completed.` });
                  setConfirmAll(false);
                  heading.current?.focus();
                },
                onError: () => setConfirmAll(false),
              });
            }} />
      ) : null}
    </section>
  );
}
