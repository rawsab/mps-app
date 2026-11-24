import { Link } from 'react-router';
import type { ConflictCandidate, MeetingConflict } from '@/domain/scheduling/conflicts';
import type { Meeting } from './api';
import { topicLabel } from './MeetingTopic';
import { sessionDay, sessionRange } from './time';

export type ConflictMeeting = ConflictCandidate & Pick<Meeting, 'clientName' | 'services'>;

/**
 * One conflict on the Meetings page (decision 0063): the day and the span it covers, then each
 * meeting linking to its dialog. Help draws it too, with fictional meetings.
 */
export function ConflictCard({ conflict, timeZone, showCoach, meetingHref }: {
  conflict: MeetingConflict<ConflictMeeting>; timeZone: string;
  /** Name the coach, when the list spans more than one. */
  showCoach: boolean;
  meetingHref: (id: string) => string;
}) {
  const span = (new Date(conflict.endsAt).getTime() - new Date(conflict.startsAt).getTime()) / 60_000;
  return (
    <div className="min-w-0 rounded-card border border-danger/40 px-4 py-3">
      <p className="text-sm font-medium">
        {sessionDay(conflict.startsAt, timeZone)} · <span className="tabular-nums">{sessionRange(conflict.startsAt, span, timeZone)}</span>
      </p>
      {showCoach && conflict.coachName ? <p className="text-xs text-muted">With {conflict.coachName}</p> : null}
      <ul className="mt-2">
        {conflict.meetings.map((meeting) => (
          <li key={meeting.id}>
            <Link to={meetingHref(meeting.id)} className="row-link group -mx-2 flex min-h-11 min-w-0 items-center gap-3 rounded-card px-2 py-1.5 hover:bg-surface-raised">
              <span className="w-28 shrink-0 text-sm tabular-nums text-muted">{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{meeting.clientName}</span>
                <span className="block truncate text-xs text-muted">{meeting.durationMinutes} min · {topicLabel(meeting.services)}</span>
              </span>
              <span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
