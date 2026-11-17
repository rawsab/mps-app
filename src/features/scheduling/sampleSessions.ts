import type { UpcomingSession } from '@/domain/scheduling/upcoming';

/**
 * LOCAL DEVELOPMENT ONLY (decision 0026). Made-up sessions for the fictional seed clients, so the
 * clients page layout can be reviewed before scheduling exists. Times are relative to now so the
 * panel always has something to show. Delete this file when the scheduling tables land.
 */
const SAMPLES: { client: [string, string]; day: number; hour: number; minute?: number; minutes: number; recurrence: string | null; location: string | null }[] = [
  { client: ['10000000-0000-4000-b000-000000000002', 'Daniel Okafor'], day: 0, hour: 7, minutes: 60, recurrence: 'Weekly', location: 'Studio' },
  { client: ['10000000-0000-4000-b000-000000000009', 'Grace Liu'], day: 0, hour: 12, minutes: 60, recurrence: 'Twice weekly', location: 'Studio' },
  { client: ['10000000-0000-4000-b000-000000000008', 'Noah Tremblay'], day: 0, hour: 16, minutes: 30, recurrence: null, location: 'Assessment · Studio' },
  { client: ['10000000-0000-4000-b000-000000000005', 'Aisha Rahman'], day: 0, hour: 18, minute: 30, minutes: 45, recurrence: null, location: 'Video call' },
  { client: ['10000000-0000-4000-b000-000000000002', 'Daniel Okafor'], day: 0, hour: 20, minutes: 30, recurrence: null, location: 'Video call' },
  { client: ['10000000-0000-4000-b000-000000000009', 'Grace Liu'], day: 1, hour: 9, minutes: 60, recurrence: 'Twice weekly', location: 'Studio' },
  { client: ['10000000-0000-4000-b000-000000000002', 'Daniel Okafor'], day: 2, hour: 7, minutes: 60, recurrence: 'Weekly', location: 'Studio' },
  { client: ['10000000-0000-4000-b000-000000000009', 'Grace Liu'], day: 4, hour: 9, minutes: 60, recurrence: 'Twice weekly', location: 'Studio' },
  { client: ['10000000-0000-4000-b000-000000000008', 'Noah Tremblay'], day: 5, hour: 12, minutes: 30, recurrence: null, location: 'Assessment · Studio' },
];

export function sampleUpcomingSessions(now: Date): UpcomingSession[] {
  return SAMPLES.map((s, index) => ({
    id: `sample-${index}`,
    clientId: s.client[0],
    clientName: s.client[1],
    startsAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + s.day, s.hour, s.minute ?? 0).toISOString(),
    durationMinutes: s.minutes,
    recurrence: s.recurrence,
    location: s.location,
  }));
}
