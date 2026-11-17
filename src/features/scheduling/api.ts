import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PatternSlot } from '@/domain/scheduling/pattern';
import { requireSupabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------------------------
// Meetings (migrations 00030–00033, decisions 0037 and 0039)

const Service = z.enum(['personal_training', 'mesocycle', 'nutrition']);
const SlotSchema = z.object({ id: z.string().optional(), cycleWeek: z.number().int(), weekday: z.number().int(), startTime: z.string(), durationMinutes: z.number().int() });
export const ScheduleSchema = z.object({
  id: z.string(), cycleWeeks: z.number().int(), anchorOn: z.string(), startsOn: z.string(), endsOn: z.string().nullable(),
  timezone: z.string(), replacesId: z.string().nullable(), slots: z.array(SlotSchema),
  services: z.array(Service), programs: z.record(z.string(), z.string()), active: z.boolean(),
  /** Staff only; null for clients and when there are none. */
  notes: z.string().nullable(),
});
export type MeetingSchedule = z.infer<typeof ScheduleSchema>;

const RequestSchema = z.object({
  id: z.string(), kind: z.enum(['cancel', 'reschedule']), message: z.string(), preferredStartsAt: z.string().nullable(),
  late: z.boolean().nullable(), status: z.enum(['pending', 'accepted', 'declined', 'withdrawn', 'expired']), response: z.string(),
  createdAt: z.string(), resolvedAt: z.string().nullable(),
});
export type MeetingRequest = z.infer<typeof RequestSchema>;

export const MeetingSchema = z.object({
  id: z.string(), clientId: z.string(), clientName: z.string(), coachId: z.string().nullable(),
  startsAt: z.string(), durationMinutes: z.number().int(), timezone: z.string(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'late_cancelled', 'no_show']), modified: z.boolean(),
  services: z.array(Service), billable: z.boolean(),
  /** One per service: the chosen program (pinned) or the service's current program. */
  programs: z.array(z.object({ service: Service, programId: z.string().nullable(), title: z.string().nullable(), pinned: z.boolean() })),
  scheduleId: z.string().nullable(), occurrenceOn: z.string().nullable(), cycleWeeks: z.number().int().nullable(),
  cancelledAt: z.string().nullable(), cancellationReason: z.string(), cancelledByClient: z.boolean(),
  meetingUrl: z.string().nullable(), notes: z.string().nullable(),
  /** The repeating pattern's notes (staff only). */
  patternNotes: z.string().nullable(), request: RequestSchema.nullable(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

const Overlaps = z.array(z.object({ id: z.string(), clientId: z.string(), clientName: z.string(), startsAt: z.string(), durationMinutes: z.number().int() }));
export type Overlap = z.infer<typeof Overlaps>[number];

const ContextSchema = z.object({
  services: z.array(z.object({ service: Service, status: z.enum(['active', 'paused']), enrollmentId: z.string(), currentProgramId: z.string().nullable() })),
  coachId: z.string().nullable(), coachName: z.string().nullable(), timezone: z.string(), meetingUrl: z.string().nullable(),
  lateCancelHours: z.number().int(), futureMeetings: z.number().int(), schedules: z.array(ScheduleSchema),
});
export type MeetingContext = z.infer<typeof ContextSchema>;

const PreviewSchema = z.array(z.object({ occurrenceOn: z.string(), startsAt: z.string(), cycleWeek: z.number().int(), weekday: z.number().int(), durationMinutes: z.number().int(), timezone: z.string() }));

const meetingsKey = ['meetings'];

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

export function useMeetingContext(clientId: string) {
  return useQuery({ queryKey: [...meetingsKey, 'context', clientId], queryFn: () => rpc('get_client_meetings', { p_client_id: clientId }, ContextSchema) });
}

/** Today's meetings across every client the coach can see, in the viewer's local day ("Upcoming today"). */
export function useMeetingsToday() {
  return useMeetingsTodayQuery(true);
}

function useMeetingsTodayQuery(enabled: boolean) {
  const day = new Date().toDateString();
  const range = useMemo(() => {
    const start = new Date(day);
    return { from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
  }, [day]);
  return useQuery({
    queryKey: [...meetingsKey, 'today', range.from.toISOString()],
    enabled,
    refetchInterval: 60_000,
    queryFn: () => rpc('list_meetings', { p_from: range.from.toISOString(), p_to: range.to.toISOString() }, z.array(MeetingSchema)),
  });
}

/**
 * Today's scheduled meetings that haven't ended yet (the sidebar badge). Rechecked every 30 seconds,
 * so the count drops as each meeting finishes.
 */
export function useMeetingsLeftToday(enabled = true) {
  const today = useMeetingsTodayQuery(enabled);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (today.data ?? []).filter((m) => m.status === 'scheduled' && new Date(m.startsAt).getTime() + m.durationMinutes * 60_000 > now).length;
}

/** Every visible client's meetings overlapping [from, to) (at most 100 days), soonest first. */
export function useMeetingsBetween(from: Date, to: Date) {
  return useQuery({
    queryKey: [...meetingsKey, 'range', from.toISOString(), to.toISOString()],
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => rpc('list_meetings', { p_from: from.toISOString(), p_to: to.toISOString() }, z.array(MeetingSchema)),
  });
}

/** Meetings overlapping [from, to), soonest first. */
export function useClientMeetings(clientId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: [...meetingsKey, 'list', clientId, from.toISOString(), to.toISOString()],
    refetchInterval: 60_000,
    queryFn: () => rpc('list_meetings', { p_from: from.toISOString(), p_to: to.toISOString(), p_client_id: clientId }, z.array(MeetingSchema)),
  });
}

export function useMeeting(id: string | null) {
  return useQuery({
    queryKey: [...meetingsKey, 'one', id],
    enabled: !!id,
    queryFn: () => rpc('get_meeting', { p_meeting_id: id }, MeetingSchema.nullable()),
  });
}

/** Service → chosen program id. A service left out follows its current program. */
export type ProgramChoice = Partial<Record<z.infer<typeof Service>, string>>;
export type PatternInput = { cycleWeeks: number; anchorOn: string | null; startsOn: string; endsOn: string | null; slots: PatternSlot[] };
export type MeetingTopic = { services: z.infer<typeof Service>[]; programs: ProgramChoice };

/** The server's own recurrence, so the editor never re-implements it. Off while the input is invalid. */
export function usePatternPreview(clientId: string, input: PatternInput | null) {
  return useQuery({
    queryKey: [...meetingsKey, 'preview', clientId, input],
    enabled: !!input,
    placeholderData: keepPreviousData,
    queryFn: () => rpc('preview_meeting_schedule', {
      p_client_id: clientId, p_cycle_weeks: input!.cycleWeeks, p_anchor_on: input!.anchorOn, p_starts_on: input!.startsOn,
      p_ends_on: input!.endsOn, p_slots: input!.slots, p_limit: 6,
    }, PreviewSchema),
  });
}

function useMeetingMutation<I, T>(fn: (input: I) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: meetingsKey }),
      // Answering a request changes its status in Reviews.
      queryClient.invalidateQueries({ queryKey: ['staff-activity'] }),
    ]),
  });
}

const WithOverlaps = MeetingSchema.extend({ overlaps: Overlaps });
const Kept = ScheduleSchema.extend({ keptMeetings: z.number().int() });

export function useCreatePattern(clientId: string) {
  return useMeetingMutation((input: PatternInput & MeetingTopic & { notes: string }) => rpc('create_meeting_schedule', {
    p_client_id: clientId, p_services: input.services, p_cycle_weeks: input.cycleWeeks, p_anchor_on: input.anchorOn,
    p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_slots: input.slots, p_programs: input.programs, p_notes: input.notes,
  }, ScheduleSchema));
}

/** "This and following": the old pattern ends the day before `startsOn`. */
export function useChangePattern() {
  return useMeetingMutation(({ scheduleId, ...input }: PatternInput & MeetingTopic & { scheduleId: string }) => rpc('change_meeting_schedule', {
    p_schedule_id: scheduleId, p_from: input.startsOn, p_services: input.services, p_cycle_weeks: input.cycleWeeks,
    p_anchor_on: input.anchorOn, p_ends_on: input.endsOn, p_slots: input.slots, p_programs: input.programs,
  }, Kept));
}

export function useEndPattern() {
  return useMeetingMutation(({ scheduleId, from }: { scheduleId: string; from: string }) =>
    rpc('end_meeting_schedule', { p_schedule_id: scheduleId, p_from: from }, Kept));
}

export function useAddMeeting(clientId: string) {
  return useMeetingMutation(({ startsAt, durationMinutes, services, programs, notes }: { startsAt: Date; durationMinutes: number; notes: string } & MeetingTopic) =>
    rpc('add_meeting', {
      p_client_id: clientId, p_services: services, p_starts_at: startsAt.toISOString(), p_duration_minutes: durationMinutes,
      p_programs: programs, p_notes: notes,
    }, WithOverlaps));
}

export function useUpdateMeeting() {
  return useMeetingMutation(({ id, startsAt, durationMinutes, services, programs }: { id: string; startsAt: Date; durationMinutes: number } & MeetingTopic) =>
    rpc('update_meeting', {
      p_meeting_id: id, p_starts_at: startsAt.toISOString(), p_duration_minutes: durationMinutes, p_services: services, p_programs: programs,
    }, WithOverlaps));
}

/** A pattern's notes, saved without changing (and so splitting) the pattern. */
export function useSavePatternNotes() {
  return useMeetingMutation(({ scheduleId, notes }: { scheduleId: string; notes: string }) =>
    rpc('save_meeting_schedule_notes', { p_schedule_id: scheduleId, p_notes: notes }, ScheduleSchema));
}

export function useSaveMeetingNotes() {
  return useMeetingMutation(({ id, notes }: { id: string; notes: string }) => rpc('save_meeting_notes', { p_meeting_id: id, p_notes: notes }, MeetingSchema));
}

export function useCancelMeeting() {
  return useMeetingMutation(({ id, reason }: { id: string; reason: string }) =>
    rpc('cancel_meeting', { p_meeting_id: id, p_reason: reason }, MeetingSchema));
}

export function useReinstateMeeting() {
  return useMeetingMutation((id: string) => rpc('reinstate_meeting', { p_meeting_id: id }, MeetingSchema));
}

export function useRespondToRequest() {
  return useMeetingMutation(({ requestId, accept, startsAt, durationMinutes, response }: { requestId: string; accept: boolean; startsAt?: Date; durationMinutes?: number; response: string }) =>
    rpc('respond_to_meeting_request', {
      p_request_id: requestId, p_accept: accept, p_starts_at: startsAt?.toISOString() ?? null, p_duration_minutes: durationMinutes ?? null, p_response: response,
    }, MeetingSchema));
}

export function useStopMeetings(clientId: string) {
  return useMeetingMutation(() => rpc('stop_meetings', { p_client_id: clientId }, z.object({ cancelledMeetings: z.number().int() })));
}
