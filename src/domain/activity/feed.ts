import { formatCents } from '../billing/money';
import { dayHeading, weekName } from '../programs/labels';
import type { SessionStatus } from '../training/volume';

/** One training session in a client's activity feed (migration 00018, decision 0023). */
export type SessionActivity = {
  kind: 'session';
  id: string;
  programId: string;
  service: 'mesocycle' | 'personal_training';
  programTitle: string;
  weekId: string;
  weekIndex: number;
  dayId: string;
  dayIndex: number;
  dayLabel: string;
  status: SessionStatus;
  performedOn: string | null;
  startedAt: string;
  completedAt: string | null;
  setCount: number;
  feedbackCount: number;
  activityAt: string;
  staffEdited: boolean;
};

export type NutritionActivity = {
  kind: 'nutrition'; id: string; programId: string | null; service: 'nutrition'; programTitle: string;
  loggedOn: string; performedOn: string; activityAt: string; staffEdited: boolean;
  status: 'completed' | 'in_progress'; weight: number | null; weightUnit: 'lb' | 'kg' | null;
  intake: number | null; output: number | null;
};
/** A client's cancel or reschedule request for a meeting (decisions 0037, 0039). Reviews only. */
export type RequestActivity = {
  kind: 'request'; id: string; services: ('personal_training' | 'mesocycle' | 'nutrition')[]; requestKind: 'cancel' | 'reschedule';
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'; message: string; preferredStartsAt: string | null;
  late: boolean | null; response: string; meetingId: string; startsAt: string; durationMinutes: number;
  activityAt: string; staffEdited: boolean;
};
/** A client's request for a service they don't have (decision 0042). Reviews only. */
export type ServiceRequestActivity = {
  kind: 'service_request'; id: string; service: 'personal_training' | 'mesocycle' | 'nutrition'; message: string;
  status: 'pending' | 'enrolled' | 'declined'; response?: string; activityAt: string; staffEdited: boolean;
};
/** A client's "I've sent it" / "I've paid this" (decision 0055). Reviews only. `chargeLabels` empty: the whole balance. */
export type PaymentNoticeActivity = {
  kind: 'payment_notice'; id: string; amountCents: number; sentOn: string; message: string; chargeLabels: string[];
  status: 'pending' | 'confirmed' | 'dismissed' | 'settled'; activityAt: string; staffEdited: boolean;
};
export type ActivityItem = SessionActivity | NutritionActivity | RequestActivity | ServiceRequestActivity | PaymentNoticeActivity;

/** A Reviews item: timed by the client's own latest change, with this staff member's read state. */
export type ReviewItem = ActivityItem & { clientId: string; clientName: string; unread: boolean };

/** Training kinds plus the shared daily nutrition and PT request categories. */
export type ActivityKind = 'completed' | 'logged' | 'skipped' | 'started' | 'nutrition' | 'request' | 'service_request' | 'payment_notice';

export function activityKind(item: Pick<SessionActivity, 'status' | 'setCount' | 'feedbackCount'> | NutritionActivity | RequestActivity | ServiceRequestActivity | PaymentNoticeActivity): ActivityKind {
  if ('requestKind' in item) return 'request';
  if ('kind' in item && item.kind === 'service_request') return 'service_request';
  if ('kind' in item && item.kind === 'payment_notice') return 'payment_notice';
  if (!('setCount' in item)) return 'nutrition';
  if (item.status === 'completed' || item.status === 'skipped') return item.status;
  return item.setCount > 0 || item.feedbackCount > 0 ? 'logged' : 'started';
}

export function activityTitle(item: ActivityItem): string {
  if (item.kind === 'payment_notice') return `Says they paid ${formatCents(item.amountCents)}`;
  if (item.kind === 'service_request') return `Requested ${SERVICE_NAMES[item.service]}`;
  if (item.kind === 'request') return item.status === 'withdrawn' ? 'Withdrew a meeting request' : item.requestKind === 'cancel' ? 'Asked to cancel a meeting' : 'Asked to reschedule a meeting';
  if (item.kind === 'nutrition') return item.status === 'completed' ? 'Logged daily nutrition' : item.weight !== null ? 'Logged weight' : item.intake !== null || item.output !== null ? 'Logged calories' : 'Updated daily nutrition';
  switch (activityKind(item)) {
    case 'completed': return 'Completed a workout';
    case 'skipped': return 'Skipped a workout';
    case 'logged': return item.setCount > 0 ? 'Logged sets' : 'Answered Stimulus & Fatigue';
    case 'started': return 'Started a workout';
    case 'nutrition': return 'Logged daily nutrition';
    case 'request': return 'Meeting request';
    case 'service_request': return 'Service request';
    case 'payment_notice': return 'Payment sent';
  }
}

/** "Block one · Week 2 · Day 1 · Push". Numbers follow order, like the editor. */
const SERVICE_NAMES = { personal_training: 'Personal training', mesocycle: 'Mesocycle', nutrition: 'Nutrition' } as const;
const SESSION_TIME = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const NOTICE_STATUS = { pending: 'Waiting for you to record it', confirmed: 'Recorded', dismissed: 'Dismissed', settled: 'Paid another way' } as const;
const noticeFor = (item: PaymentNoticeActivity) => (item.chargeLabels.length ? item.chargeLabels.join(', ') : 'Their balance');

export function activityWhere(item: ActivityItem): string {
  if (item.kind === 'payment_notice') return `${noticeFor(item)} · ${NOTICE_STATUS[item.status]}`;
  if (item.kind === 'service_request') return { enrolled: 'Now enrolled', declined: 'Declined', pending: 'Waiting for a reply' }[item.status];
  if (item.kind === 'request') return `${item.services.map((s) => SERVICE_NAMES[s]).join(' · ')} · ${SESSION_TIME.format(new Date(item.startsAt))} · ${item.durationMinutes} min`;
  if (item.kind === 'nutrition') return item.programTitle;
  return [item.programTitle.trim() || 'Untitled program', weekName(item.weekIndex), dayHeading({ label: item.dayLabel }, item.dayIndex)].join(' · ');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Facts worth a glance; nothing is listed for counts the client hasn't produced. */
export function activityDetails(item: ActivityItem): string[] {
  if (item.kind === 'payment_notice') return [item.message ? `“${item.message}”` : ''].filter(Boolean);
  if (item.kind === 'service_request') return [item.message ? `“${item.message}”` : '', item.response ? `Reply: “${item.response}”` : ''].filter(Boolean);
  if (item.kind === 'request') return [
    item.message ? `“${item.message}”` : '',
    item.preferredStartsAt ? `Prefers ${SESSION_TIME.format(new Date(item.preferredStartsAt))}` : '',
  ].filter(Boolean);
  if (item.kind === 'nutrition') return [
    item.weight === null ? '' : `Weight ${item.weight.toLocaleString()} ${item.weightUnit ?? ''}`,
    item.intake === null ? '' : `Consumed ${item.intake.toLocaleString()} kcal`,
    item.output === null ? '' : `Output ${item.output.toLocaleString()} kcal`,
  ].filter(Boolean);
  const details: string[] = [];
  if (item.setCount > 0) details.push(`${plural(item.setCount, 'set')} logged`);
  if (item.feedbackCount > 0) details.push(`Stimulus & Fatigue for ${plural(item.feedbackCount, 'muscle')}`);
  return details;
}

/** One labelled fact for the Activity page's detail card. `long` facts (notes, replies) span the card. */
export type ActivityFact = { label: string; value: string; long?: boolean };

/**
 * The detail card's facts: what `activityWhere` and `activityDetails` say, labelled. Missing values
 * are left out; zero is a value (0 kcal shows).
 */
export function activityFacts(item: ActivityItem, formatDate: (value: string) => string): ActivityFact[] {
  const facts: (ActivityFact | false)[] = [];
  const note = (label: string, text: string | undefined) => !!text?.trim() && { label, value: `“${text.trim()}”`, long: true };
  if (item.kind === 'payment_notice') {
    facts.push({ label: 'Amount', value: formatCents(item.amountCents) }, { label: 'Sent on', value: formatDate(item.sentOn) },
      { label: 'For', value: noticeFor(item) }, { label: 'Status', value: NOTICE_STATUS[item.status] }, note('Note', item.message));
  } else if (item.kind === 'service_request') {
    facts.push({ label: 'Service', value: SERVICE_NAMES[item.service] }, { label: 'Status', value: activityWhere(item) },
      note('Note', item.message), note('Reply', item.response));
  } else if (item.kind === 'request') {
    facts.push({ label: 'Meeting', value: `${SESSION_TIME.format(new Date(item.startsAt))} · ${item.durationMinutes} min` },
      { label: item.services.length === 1 ? 'Service' : 'Services', value: item.services.map((s) => SERVICE_NAMES[s]).join(', ') },
      !!item.preferredStartsAt && { label: 'Prefers', value: SESSION_TIME.format(new Date(item.preferredStartsAt!)) },
      note('Note', item.message), note('Reply', item.response));
  } else if (item.kind === 'nutrition') {
    facts.push(!!item.programTitle.trim() && { label: 'Program', value: item.programTitle.trim() },
      { label: 'Log date', value: formatDate(item.performedOn) },
      item.weight !== null && { label: 'Weight', value: `${item.weight.toLocaleString()} ${item.weightUnit ?? ''}`.trim() },
      item.intake !== null && { label: 'Consumed', value: `${item.intake.toLocaleString()} kcal` },
      item.output !== null && { label: 'Output', value: `${item.output.toLocaleString()} kcal` });
  } else {
    facts.push({ label: 'Program', value: item.programTitle.trim() || 'Untitled program' },
      { label: 'Workout', value: [weekName(item.weekIndex), dayHeading({ label: item.dayLabel }, item.dayIndex)].join(' · ') },
      !!item.performedOn && { label: 'Workout date', value: formatDate(item.performedOn!) },
      item.setCount > 0 && { label: 'Sets logged', value: String(item.setCount) },
      item.feedbackCount > 0 && { label: 'Stimulus & Fatigue', value: plural(item.feedbackCount, 'muscle') });
  }
  return facts.filter((fact): fact is ActivityFact => !!fact);
}

/** "just now", "5m ago", "3h ago", "Yesterday", "4d ago", then a date. */
export function relativeTime(at: string, now: Date, formatDate: (value: string) => string): string {
  const then = new Date(at);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60 && localDay(then) === localDay(now)) return `${Math.floor(minutes / 60)}h ago`;
  const days = daysBetween(then, now);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(at);
}

/** Groups newest-first items by the viewer's local day, keeping their order. */
export function groupByDay<T extends { activityAt: string }>(items: T[], now: Date, formatDate: (value: string) => string): { label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const at = new Date(item.activityAt);
    const key = localDay(at);
    const last = groups.at(-1);
    if (last?.key === key) { last.items.push(item); continue; }
    const days = daysBetween(at, now);
    groups.push({ key, label: days === 0 ? 'Today' : days === 1 ? 'Yesterday' : formatDate(item.activityAt), items: [item] });
  }
  return groups.map(({ label, items }) => ({ label, items }));
}

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const daysBetween = (from: Date, to: Date) =>
  Math.round((new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 86_400_000);
