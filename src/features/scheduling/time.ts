import { zonedDateTime } from '@/domain/scheduling/pattern';

/** Session times shown in a named zone (the coach's, on coach screens). Formatters are cached per zone. */
const cache = new Map<string, Intl.DateTimeFormat>();
function format(timeZone: string, kind: 'day' | 'time' | 'full') {
  const key = `${kind}:${timeZone}`;
  let f = cache.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions = kind === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' }
      : kind === 'time' ? { hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    f = new Intl.DateTimeFormat(undefined, { ...options, timeZone });
    cache.set(key, f);
  }
  return f;
}

/** "Tue, Nov 24" */
export const sessionDay = (at: string | Date, timeZone: string) => format(timeZone, 'day').format(new Date(at));
/** "7:00 AM" */
export const sessionTime = (at: string | Date, timeZone: string) => format(timeZone, 'time').format(new Date(at));
/** "Tue, Nov 24, 7:00 AM" */
export const sessionMoment = (at: string | Date, timeZone: string) => format(timeZone, 'full').format(new Date(at));
/** "7:00 – 8:00 AM"-style range. */
export function sessionRange(at: string, minutes: number, timeZone: string) {
  const start = new Date(at);
  return format(timeZone, 'time').formatRange(start, new Date(start.getTime() + minutes * 60_000));
}

export const todayIn = (timeZone: string) => zonedDateTime(new Date(), timeZone).date;

/** "America/Toronto" → "America/Toronto" without underscores, for labels. */
export const zoneLabel = (timeZone: string) => timeZone.replaceAll('_', ' ');

/** The confirmation after recording or changing attendance, e.g. "Marked Grace Liu’s Tue, Nov 3 11:00 AM meeting completed." */
export function attendanceMessage(meeting: { clientName: string; startsAt: string }, status: 'completed' | 'no_show' | 'scheduled', timeZone: string) {
  const which = `${meeting.clientName}’s ${sessionDay(meeting.startsAt, timeZone)} ${sessionTime(meeting.startsAt, timeZone)} meeting`;
  if (status === 'scheduled') return `Marked ${which} as not recorded.`;
  return `Marked ${which} ${status === 'completed' ? 'completed' : 'as a no-show'}.`;
}
