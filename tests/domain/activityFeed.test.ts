import { describe, expect, it } from 'vitest';
import { activityDetails, activityFacts, activityKind, activityTitle, activityWhere, groupByDay, relativeTime, type SessionActivity, type NutritionActivity, type RequestActivity, type ServiceRequestActivity } from '@/domain/activity/feed';
import { activityLink, ReviewSchema } from '@/features/activity/api';

const item = (overrides: Partial<SessionActivity> = {}): SessionActivity => ({
  kind: 'session', id: 's1', programId: 'p1', service: 'mesocycle', programTitle: 'Block one', weekId: 'w2', weekIndex: 1,
  dayId: 'd1', dayIndex: 0, dayLabel: 'W2 Push', status: 'in_progress', performedOn: null, startedAt: '', completedAt: null,
  setCount: 0, feedbackCount: 0, activityAt: '', staffEdited: false, ...overrides,
});
const date = (value: string) => `date:${value}`;

describe('activity wording', () => {
  it('represents daily nutrition without workout fields, preserving zero calories and linking to the right day', () => {
    const n: NutritionActivity={kind:'nutrition',id:'n1',programId:'p1',service:'nutrition',programTitle:'Bulk',loggedOn:'2026-11-17',performedOn:'2026-11-17',activityAt:'2026-11-17T12:00:00Z',staffEdited:false,status:'completed',weight:200,weightUnit:'lb',intake:0,output:2500};
    expect(activityTitle(n)).toBe('Logged daily nutrition'); expect(activityKind(n)).toBe('nutrition');
    expect(activityDetails(n)).toEqual(['Weight 200 lb','Consumed 0 kcal','Output 2,500 kcal']);
    expect(activityWhere(n)).toBe('Bulk');
    expect(activityLink('c1',n)).toBe('/coach/clients/c1/nutrition/p1/log#nutrition-day-2026-11-17');
    expect(ReviewSchema.parse({...n,clientId:'c1',clientName:'Maya',unread:true}).kind).toBe('nutrition');
    expect(activityTitle({...n,status:'in_progress',weight:null,weightUnit:null})).toBe('Logged calories');
  });
  it('names what the client did', () => {
    expect(activityTitle(item())).toBe('Started a workout');
    expect(activityTitle(item({ setCount: 3 }))).toBe('Logged sets');
    expect(activityTitle(item({ status: 'completed', setCount: 3 }))).toBe('Completed a workout');
    expect(activityTitle(item({ status: 'skipped' }))).toBe('Skipped a workout');
  });

  it('sorts sessions into review kinds; opening a day alone is only "started"', () => {
    expect(activityKind(item())).toBe('started');
    expect(activityKind(item({ setCount: 2 }))).toBe('logged');
    expect(activityKind(item({ feedbackCount: 1 }))).toBe('logged');
    expect(activityKind(item({ status: 'completed' }))).toBe('completed');
    expect(activityKind(item({ status: 'skipped', setCount: 1 }))).toBe('skipped');
    expect(activityTitle(item({ feedbackCount: 1 }))).toBe('Answered Stimulus & Fatigue');
  });

  it('numbers weeks and days by order and keeps the day focus', () => {
    expect(activityWhere(item())).toBe('Block one · Week 2 · Day 1 · Push');
    expect(activityWhere(item({ programTitle: ' ', dayLabel: '' }))).toBe('Untitled program · Week 2 · Day 1');
  });

  it('lists only counts that exist', () => {
    expect(activityDetails(item())).toEqual([]);
    expect(activityDetails(item({ setCount: 1, feedbackCount: 2 }))).toEqual(['1 set logged', 'Stimulus & Fatigue for 2 muscles']);
  });
});

describe('activity times', () => {
  const now = new Date(2026, 10, 17, 15, 0);
  const at = (d: Date) => d.toISOString();

  it('uses short relative times, then a date', () => {
    expect(relativeTime(at(new Date(2026, 10, 17, 14, 59, 30)), now, date)).toBe('just now');
    expect(relativeTime(at(new Date(2026, 10, 17, 14, 15)), now, date)).toBe('45m ago');
    expect(relativeTime(at(new Date(2026, 10, 17, 9, 0)), now, date)).toBe('6h ago');
    expect(relativeTime(at(new Date(2026, 10, 16, 23, 0)), now, date)).toBe('Yesterday');
    expect(relativeTime(at(new Date(2026, 10, 13, 12, 0)), now, date)).toBe('4d ago');
    const old = at(new Date(2026, 10, 1, 12, 0));
    expect(relativeTime(old, now, date)).toBe(`date:${old}`);
  });

  it('groups newest-first items by local day', () => {
    const items = [new Date(2026, 10, 17, 10), new Date(2026, 10, 17, 8), new Date(2026, 10, 16, 20), new Date(2026, 10, 10, 9)]
      .map((d, i) => item({ id: `s${i}`, activityAt: at(d) }));
    expect(groupByDay(items, now, date).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['s0', 's1']], ['Yesterday', ['s2']], [`date:${items[3]!.activityAt}`, ['s3']],
    ]);
  });
});

describe('meeting requests', () => {
  const request = (overrides: Partial<RequestActivity> = {}): RequestActivity => ({
    kind: 'request', id: 'r1', services: ['personal_training', 'nutrition'], requestKind: 'reschedule', status: 'pending', message: 'Thursday instead?',
    preferredStartsAt: null, late: null, response: '', meetingId: 'a1', startsAt: '2026-11-24T12:00:00Z', durationMinutes: 60,
    activityAt: '2026-11-17T12:00:00Z', staffEdited: false, ...overrides,
  });

  it('names what the client asked for', () => {
    expect(activityKind(request())).toBe('request');
    expect(activityTitle(request())).toBe('Asked to reschedule a meeting');
    expect(activityTitle(request({ requestKind: 'cancel', late: true }))).toBe('Asked to cancel a meeting');
    expect(activityTitle(request({ status: 'withdrawn' }))).toBe('Withdrew a meeting request');
  });

  it('shows the session and quotes the message', () => {
    expect(activityWhere(request())).toMatch(/^Personal training · Nutrition · .+ · 60 min$/);
    expect(activityDetails(request())[0]).toBe('“Thursday instead?”');
    expect(activityDetails(request({ message: '' }))).toEqual([]);
  });

  it('opens the session on the client page and parses from Reviews', () => {
    expect(activityLink('c1', request())).toBe('/coach/clients/c1?session=a1');
    expect(ReviewSchema.parse({ ...request(), clientId: 'c1', clientName: 'Grace Liu', unread: true }).kind).toBe('request');
  });
});

describe('service requests', () => {
  const request = (overrides: Partial<ServiceRequestActivity> = {}): ServiceRequestActivity => ({
    kind: 'service_request', id: 'q1', service: 'personal_training', message: 'Mornings suit me', status: 'pending',
    activityAt: '2026-11-17T12:00:00Z', staffEdited: false, ...overrides,
  });

  it('names the service and quotes the message', () => {
    expect(activityKind(request())).toBe('service_request');
    expect(activityTitle(request())).toBe('Requested Personal training');
    expect(activityWhere(request())).toBe('Waiting for a reply');
    expect(activityWhere(request({ status: 'enrolled' }))).toBe('Now enrolled');
    expect(activityDetails(request())).toEqual(['“Mornings suit me”']);
    expect(activityDetails(request({ message: '' }))).toEqual([]);
  });

  it('shows a decline and its reply (decision 0044)', () => {
    const declined = request({ status: 'declined', response: 'Full this month' });
    expect(activityWhere(declined)).toBe('Declined');
    expect(activityDetails(declined)).toEqual(['“Mornings suit me”', 'Reply: “Full this month”']);
    expect(activityDetails(request({ status: 'declined', message: '', response: '' }))).toEqual([]);
  });

  it('opens the client page and parses from Reviews', () => {
    expect(activityLink('c1', request())).toBe('/coach/clients/c1');
    expect(ReviewSchema.parse({ ...request(), clientId: 'c1', clientName: 'Maya Chen', unread: true }).kind).toBe('service_request');
  });
});

describe('activity detail card', () => {
  const labels = (facts: { label: string }[]) => facts.map((fact) => fact.label);

  it('labels a session, leaving out counts the client has not produced', () => {
    expect(activityFacts(item(), date)).toEqual([
      { label: 'Program', value: 'Block one' }, { label: 'Workout', value: 'Week 2 · Day 1 · Push' }]);
    expect(activityFacts(item({ performedOn: '2026-11-18', setCount: 12, feedbackCount: 1 }), date).slice(2)).toEqual([
      { label: 'Workout date', value: 'date:2026-11-18' }, { label: 'Sets logged', value: '12' }, { label: 'Stimulus & Fatigue', value: '1 muscle' }]);
  });

  it('keeps zero calories and drops unanswered nutrition values', () => {
    const n: NutritionActivity = { kind: 'nutrition', id: 'n1', programId: 'p1', service: 'nutrition', programTitle: 'Bulk', loggedOn: '2026-11-17', performedOn: '2026-11-17',
      activityAt: '', staffEdited: false, status: 'in_progress', weight: null, weightUnit: null, intake: 0, output: null };
    expect(activityFacts(n, date)).toEqual([
      { label: 'Program', value: 'Bulk' }, { label: 'Log date', value: 'date:2026-11-17' }, { label: 'Consumed', value: '0 kcal' }]);
  });

  it('puts notes and replies full width, after the short facts', () => {
    const r: RequestActivity = { kind: 'request', id: 'r1', services: ['personal_training'], requestKind: 'reschedule', status: 'declined', message: ' Thursday? ',
      preferredStartsAt: '2026-11-20T15:00:00Z', late: null, response: 'Fully booked', meetingId: 'm1', startsAt: '2026-11-19T15:00:00Z', durationMinutes: 60, activityAt: '', staffEdited: false };
    const facts = activityFacts(r, date);
    expect(labels(facts)).toEqual(['Meeting', 'Service', 'Prefers', 'Note', 'Reply']);
    expect(facts.at(-2)).toEqual({ label: 'Note', value: '“Thursday?”', long: true });
    expect(labels(activityFacts({ ...r, message: '', response: '', preferredStartsAt: null }, date))).toEqual(['Meeting', 'Service']);
    const s: ServiceRequestActivity = { kind: 'service_request', id: 'q1', service: 'nutrition', message: '', status: 'pending', activityAt: '', staffEdited: false };
    expect(activityFacts(s, date)).toEqual([{ label: 'Service', value: 'Nutrition' }, { label: 'Status', value: 'Waiting for a reply' }]);
  });
});
