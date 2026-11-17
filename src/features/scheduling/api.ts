import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PatternSlot } from '@/domain/scheduling/pattern';
import type { UpcomingSession } from '@/domain/scheduling/upcoming';
import { requireSupabase } from '@/lib/supabase';
import { sampleUpcomingSessions } from './sampleSessions';

/**
 * The clients page's "Upcoming today" still shows labelled sample sessions in local development
 * (decision 0026) until phase 3 of decision 0037 points it at the real sessions below.
 */
export type UpcomingSessions = { source: 'sample'; sessions: UpcomingSession[] } | { source: 'unavailable' };

export function useUpcomingSessions(): UpcomingSessions {
  return useMemo(() => (import.meta.env.DEV ? { source: 'sample', sessions: sampleUpcomingSessions(new Date()) } : { source: 'unavailable' }), []);
}

// ---------------------------------------------------------------------------------------------
// Personal training scheduling (migrations 00030–00031, decision 0037)

const SlotSchema = z.object({ id: z.string().optional(), cycleWeek: z.number().int(), weekday: z.number().int(), startTime: z.string(), durationMinutes: z.number().int() });
export const ScheduleSchema = z.object({
  id: z.string(), cycleWeeks: z.number().int(), anchorOn: z.string(), startsOn: z.string(), endsOn: z.string().nullable(),
  timezone: z.string(), replacesId: z.string().nullable(), slots: z.array(SlotSchema),
});

const RequestSchema = z.object({
  id: z.string(), kind: z.enum(['cancel', 'reschedule']), message: z.string(), preferredStartsAt: z.string().nullable(),
  late: z.boolean().nullable(), status: z.enum(['pending', 'accepted', 'declined', 'withdrawn', 'expired']), response: z.string(),
  createdAt: z.string(), resolvedAt: z.string().nullable(),
});
export type AppointmentRequest = z.infer<typeof RequestSchema>;

export const AppointmentSchema = z.object({
  id: z.string(), clientId: z.string(), clientName: z.string(), coachId: z.string().nullable(),
  startsAt: z.string(), durationMinutes: z.number().int(), timezone: z.string(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'late_cancelled', 'no_show']), modified: z.boolean(),
  scheduleId: z.string().nullable(), occurrenceOn: z.string().nullable(), cycleWeeks: z.number().int().nullable(),
  cancelledAt: z.string().nullable(), cancellationReason: z.string(), cancelledByClient: z.boolean(),
  meetingUrl: z.string().nullable(), request: RequestSchema.nullable(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;

const Overlaps = z.array(z.object({ id: z.string(), clientId: z.string(), clientName: z.string(), startsAt: z.string(), durationMinutes: z.number().int() }));
export type Overlap = z.infer<typeof Overlaps>[number];

const SchedulingSchema = z.object({
  service: z.enum(['active', 'paused']).nullable(), coachId: z.string().nullable(), coachName: z.string().nullable(),
  timezone: z.string(), meetingUrl: z.string().nullable(), lateCancelHours: z.number().int(), futureSessions: z.number().int(),
  schedules: z.array(ScheduleSchema),
});
export type Scheduling = z.infer<typeof SchedulingSchema>;

const PreviewSchema = z.array(z.object({ occurrenceOn: z.string(), startsAt: z.string(), cycleWeek: z.number().int(), weekday: z.number().int(), durationMinutes: z.number().int(), timezone: z.string() }));

const ptKey = ['pt'];
const schedulingKey = (clientId: string) => [...ptKey, 'scheduling', clientId];

/** Database messages are written as sentences without the capital and full stop. */
export function schedulingError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '42501') return 'You do not have permission to do that.';
  const text = e?.message?.trim();
  if (!text) return 'Something went wrong. Nothing was saved.';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;
}

async function rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
  return schema.parse(data);
}

export function usePtScheduling(clientId: string) {
  return useQuery({ queryKey: schedulingKey(clientId), queryFn: () => rpc('get_pt_scheduling', { p_client_id: clientId }, SchedulingSchema) });
}

/** Sessions overlapping [from, to), soonest first. */
export function useClientAppointments(clientId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: [...ptKey, 'appointments', clientId, from.toISOString(), to.toISOString()],
    refetchInterval: 60_000,
    queryFn: () => rpc('list_pt_appointments', { p_from: from.toISOString(), p_to: to.toISOString(), p_client_id: clientId }, z.array(AppointmentSchema)),
  });
}

export function usePtAppointment(id: string | null) {
  return useQuery({
    queryKey: [...ptKey, 'appointment', id],
    enabled: !!id,
    queryFn: () => rpc('get_pt_appointment', { p_appointment_id: id }, AppointmentSchema.nullable()),
  });
}

export type PatternInput = { cycleWeeks: number; anchorOn: string | null; startsOn: string; endsOn: string | null; slots: PatternSlot[] };

/** The server's own recurrence, so the editor never re-implements it. Off while the input is invalid. */
export function usePatternPreview(clientId: string, input: PatternInput | null) {
  return useQuery({
    queryKey: [...ptKey, 'preview', clientId, input],
    enabled: !!input,
    placeholderData: keepPreviousData,
    queryFn: () => rpc('preview_pt_schedule', {
      p_client_id: clientId, p_cycle_weeks: input!.cycleWeeks, p_anchor_on: input!.anchorOn, p_starts_on: input!.startsOn,
      p_ends_on: input!.endsOn, p_slots: input!.slots, p_limit: 6,
    }, PreviewSchema),
  });
}

function usePtMutation<I, T>(fn: (input: I) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ptKey }),
      // Answering a request changes its status in Reviews.
      queryClient.invalidateQueries({ queryKey: ['staff-activity'] }),
    ]),
  });
}

const WithOverlaps = AppointmentSchema.extend({ overlaps: Overlaps });
const Kept = ScheduleSchema.extend({ keptSessions: z.number().int() });

export function useCreatePattern(clientId: string) {
  return usePtMutation((input: PatternInput) => rpc('create_pt_schedule', {
    p_client_id: clientId, p_cycle_weeks: input.cycleWeeks, p_anchor_on: input.anchorOn, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_slots: input.slots,
  }, ScheduleSchema));
}

/** "This and following": the old pattern ends the day before `startsOn`. */
export function useChangePattern() {
  return usePtMutation(({ scheduleId, ...input }: PatternInput & { scheduleId: string }) => rpc('change_pt_schedule', {
    p_schedule_id: scheduleId, p_from: input.startsOn, p_cycle_weeks: input.cycleWeeks, p_anchor_on: input.anchorOn, p_ends_on: input.endsOn, p_slots: input.slots,
  }, Kept));
}

export function useEndPattern() {
  return usePtMutation(({ scheduleId, from }: { scheduleId: string; from: string }) =>
    rpc('end_pt_schedule', { p_schedule_id: scheduleId, p_from: from }, Kept));
}

export function useAddSession(clientId: string) {
  return usePtMutation(({ startsAt, durationMinutes }: { startsAt: Date; durationMinutes: number }) =>
    rpc('add_pt_appointment', { p_client_id: clientId, p_starts_at: startsAt.toISOString(), p_duration_minutes: durationMinutes }, WithOverlaps));
}

export function useUpdateSession() {
  return usePtMutation(({ id, startsAt, durationMinutes }: { id: string; startsAt: Date; durationMinutes: number }) =>
    rpc('update_pt_appointment', { p_appointment_id: id, p_starts_at: startsAt.toISOString(), p_duration_minutes: durationMinutes }, WithOverlaps));
}

export function useCancelSession() {
  return usePtMutation(({ id, reason }: { id: string; reason: string }) =>
    rpc('cancel_pt_appointment', { p_appointment_id: id, p_reason: reason }, AppointmentSchema));
}

export function useReinstateSession() {
  return usePtMutation((id: string) => rpc('reinstate_pt_appointment', { p_appointment_id: id }, AppointmentSchema));
}

export function useRespondToRequest() {
  return usePtMutation(({ requestId, accept, startsAt, durationMinutes, response }: { requestId: string; accept: boolean; startsAt?: Date; durationMinutes?: number; response: string }) =>
    rpc('respond_to_pt_appointment_request', {
      p_request_id: requestId, p_accept: accept, p_starts_at: startsAt?.toISOString() ?? null, p_duration_minutes: durationMinutes ?? null, p_response: response,
    }, AppointmentSchema));
}

export function useStopScheduling(clientId: string) {
  return usePtMutation(() => rpc('stop_pt_scheduling', { p_client_id: clientId }, z.object({ cancelledSessions: z.number().int() })));
}
