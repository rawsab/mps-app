import { useMemo } from 'react';
import type { UpcomingSession } from '@/domain/scheduling/upcoming';
import { sampleUpcomingSessions } from './sampleSessions';

/**
 * Scheduling isn't built yet (decision 0026). Local development shows labelled sample sessions;
 * any other build reports the feature as unavailable rather than inventing appointments.
 * The scheduling tables replace this with a real query.
 */
export type UpcomingSessions = { source: 'sample'; sessions: UpcomingSession[] } | { source: 'unavailable' };

export function useUpcomingSessions(): UpcomingSessions {
  return useMemo(() => (import.meta.env.DEV ? { source: 'sample', sessions: sampleUpcomingSessions(new Date()) } : { source: 'unavailable' }), []);
}
