import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PatternSlot } from '@/domain/scheduling/pattern';
import { resourceExtension } from '@/domain/scheduling/resources';
import { requireSupabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------------------------
// Meetings (migrations 00030–00033, decisions 0037 and 0039)

const Service = z.enum(['personal_training', 'mesocycle', 'nutrition']);
const SlotSchema = z.object({ id: z.string().optional(), cycleWeek: z.number().int(), weekday: z.number().int(), startTime: z.string(), durationMinutes: z.number().int() });
export const ScheduleSchema = z.object({
  id: z.string(), cycleWeeks: z.number().int(), anchorOn: z.string(), startsOn: z.string(), endsOn: z.string().nullable(),
  timezone: z.string(), replacesId: z.string().nullable(), slots: z.array(SlotSchema),
  services: z.array(Service), programs: z.record(z.string(), z.string()), active: z.boolean(),
  /** Solo or partner, for the PT price (migration 00052). */
  format: z.enum(['solo', 'partner']),
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

const StatusSchema = z.enum(['scheduled', 'completed', 'cancelled', 'late_cancelled', 'no_show']);

/** Files in the meeting-resources bucket, or https links (migration 00046). Always shared with the client. */
const ResourceSchema = z.object({
  id: z.string(), kind: z.enum(['file', 'link']), title: z.string(), storagePath: z.string().nullable(), mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(), url: z.string().nullable(), createdAt: z.string(),
});
export type MeetingResource = z.infer<typeof ResourceSchema>;

const AttendanceChangeSchema = z.object({
  fromStatus: StatusSchema, toStatus: StatusSchema, reason: z.string(), changedAt: z.string(), changedByName: z.string().nullable(),
});

export const MeetingSchema = z.object({
  id: z.string(), clientId: z.string(), clientName: z.string(), coachId: z.string().nullable(),
  startsAt: z.string(), durationMinutes: z.number().int(), timezone: z.string(),
  status: StatusSchema, modified: z.boolean(),
  services: z.array(Service), billable: z.boolean(),
  /** One per service: the chosen program (pinned) or the service's current program. */
  programs: z.array(z.object({ service: Service, programId: z.string().nullable(), title: z.string().nullable(), pinned: z.boolean() })),
  scheduleId: z.string().nullable(), occurrenceOn: z.string().nullable(), cycleWeeks: z.number().int().nullable(),
  cancelledAt: z.string().nullable(), cancellationReason: z.string(), cancelledByClient: z.boolean(),
  meetingUrl: z.string().nullable(), notes: z.string().nullable(),
  /** The coach's name and picture path, so clients can see who the meeting is with (migration 00038). */
  coachName: z.string().nullable(), coachAvatarPath: z.string().nullable(),
  /** The repeating pattern's notes (staff only). */
  patternNotes: z.string().nullable(), request: RequestSchema.nullable(),
  /** Notes the client can read (migration 00046), kept apart from the staff-only `notes`. */
  sharedNotes: z.string().nullable(), resources: z.array(ResourceSchema),
  /** Every attendance recording and correction, oldest first (staff only; empty for clients). */
  attendanceChanges: z.array(AttendanceChangeSchema),
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

const PendingMeetingRequestSchema = MeetingSchema.pick({
  id: true, clientId: true, clientName: true, startsAt: true, services: true,
}).extend({ request: RequestSchema.extend({ status: z.literal('pending') }) });

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

export function usePendingMeetingRequests() {
  return useQuery({
    queryKey: [...meetingsKey, 'pending-requests'],
    refetchInterval: 60_000,
    queryFn: () => rpc('list_pending_meeting_requests', {}, z.array(PendingMeetingRequestSchema)),
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

export const PAST_PAGE = 25;

/** Started meetings, newest first, a page at a time (migration 00046). */
export function usePastMeetings(clientId: string, pageSize = PAST_PAGE) {
  return useInfiniteQuery({
    queryKey: [...meetingsKey, 'past', clientId, pageSize],
    refetchInterval: 60_000,
    initialPageParam: undefined as Meeting | undefined,
    queryFn: ({ pageParam }) => rpc('list_past_meetings', {
      p_client_id: clientId, p_before_at: pageParam?.startsAt ?? null, p_before_id: pageParam?.id ?? null, p_limit: pageSize,
    }, z.array(MeetingSchema)),
    getNextPageParam: (page) => (page.length === pageSize ? page.at(-1) : undefined),
  });
}

/**
 * Every started meeting, newest first, for stats that span the whole history (the client's PT
 * dashboard). Pages through `list_past_meetings` at its largest page size.
 */
export function useAllPastMeetings(clientId: string | undefined) {
  return useQuery({
    queryKey: [...meetingsKey, 'past-all', clientId],
    enabled: !!clientId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const all: Meeting[] = [];
      for (;;) {
        const last = all.at(-1);
        const page = await rpc('list_past_meetings', {
          p_client_id: clientId, p_before_at: last?.startsAt ?? null, p_before_id: last?.id ?? null, p_limit: 100,
        }, z.array(MeetingSchema));
        all.push(...page);
        if (page.length < 100) return all;
      }
    },
  });
}

const NeedsAttendanceSchema =MeetingSchema.pick({ id: true, clientId: true, clientName: true, startsAt: true, durationMinutes: true, services: true });
export type NeedsAttendance = z.infer<typeof NeedsAttendanceSchema>;

/** Ended meetings with no attendance yet, oldest first (Meetings page to-dos). */
export function useMeetingsNeedingAttendance() {
  return useQuery({
    queryKey: [...meetingsKey, 'needs-attendance'],
    refetchInterval: 60_000,
    queryFn: () => rpc('list_meetings_needing_attendance', {}, z.array(NeedsAttendanceSchema)),
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
      // Attendance charges and voids PT sessions (decision 0053).
      queryClient.invalidateQueries({ queryKey: ['billing'] }),
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

export type Attendance = 'completed' | 'no_show';

export function useRecordAttendance() {
  return useMeetingMutation(({ id, status }: { id: string; status: Attendance }) =>
    rpc('record_attendance', { p_meeting_id: id, p_status: status }, MeetingSchema));
}

/** All or nothing: every meeting is recorded, or none is (migration 00047). */
export function useRecordAttendanceMany() {
  return useMeetingMutation(({ ids, status }: { ids: string[]; status: Attendance }) =>
    rpc('record_attendance_many', { p_meeting_ids: ids, p_status: status }, z.object({ recorded: z.number().int() })));
}

/** `scheduled` sets the meeting back to "not recorded". */
export function useCorrectAttendance() {
  return useMeetingMutation(({ id, status, reason }: { id: string; status: Attendance | 'scheduled'; reason: string }) =>
    rpc('correct_attendance', { p_meeting_id: id, p_status: status, p_reason: reason }, MeetingSchema));
}

/** Takes back the caller's own latest change (within 15 minutes) without logging it (migration 00048). */
export function useUndoAttendance() {
  return useMeetingMutation((id: string) => rpc('undo_attendance', { p_meeting_id: id }, MeetingSchema));
}

export function useSaveSharedNotes() {
  return useMeetingMutation(({ id, notes }: { id: string; notes: string }) =>
    rpc('save_meeting_shared_notes', { p_meeting_id: id, p_notes: notes }, MeetingSchema));
}

export const MEETING_RESOURCES_BUCKET = 'meeting-resources';

/** Uploads to `{client}/{meeting}/{uuid}.ext`, then records it. A file that can't be recorded is removed again. */
export function useAddMeetingFile() {
  return useMeetingMutation(async ({ meeting, file, title }: { meeting: Meeting; file: File; title: string }) => {
    const storage = requireSupabase().storage.from(MEETING_RESOURCES_BUCKET);
    const path = `${meeting.clientId}/${meeting.id}/${crypto.randomUUID()}.${resourceExtension(file.type)}`;
    const upload = await storage.upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    try {
      return await rpc('add_meeting_resource', { p_meeting_id: meeting.id, p_path: path, p_title: title }, MeetingSchema);
    } catch (error) {
      await storage.remove([path]);
      throw error;
    }
  });
}

export function useAddMeetingLink() {
  return useMeetingMutation(({ id, url, title }: { id: string; url: string; title: string }) =>
    rpc('add_meeting_link', { p_meeting_id: id, p_url: url, p_title: title }, MeetingSchema));
}

/**
 * Removes the row, then the stored file. If only the file delete fails, the resource is already gone
 * for everyone and the reply says the file was left behind.
 */
export function useRemoveMeetingResource() {
  return useMeetingMutation(async (resourceId: string) => {
    const result = await rpc('remove_meeting_resource', { p_resource_id: resourceId },
      z.object({ storagePath: z.string().nullable(), meeting: MeetingSchema }));
    if (!result.storagePath) return { meeting: result.meeting, fileLeft: false };
    const cleanup = await requireSupabase().storage.from(MEETING_RESOURCES_BUCKET).remove([result.storagePath]);
    return { meeting: result.meeting, fileLeft: !!cleanup.error };
  });
}

/** A short-lived link to open a stored resource (signed URLs, as with profile photos). */
export async function openResourceUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from(MEETING_RESOURCES_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------------------------
// Coach availability and client requests (migration 00049, decision 0050)

const HoursSchema = z.array(z.object({ weekday: z.number().int(), startTime: z.string(), endTime: z.string() }));
const ExceptionSchema = z.object({
  id: z.string(), kind: z.enum(['time_off', 'extra_hours']), startsAt: z.string(), endsAt: z.string(), allDay: z.boolean(), note: z.string(),
});
export type AvailabilityException = z.infer<typeof ExceptionSchema>;
const BookingRulesSchema = z.object({ bookingNoticeHours: z.number().int(), bookingHorizonDays: z.number().int(), bookingBufferMinutes: z.number().int() });
export type BookingRules = z.infer<typeof BookingRulesSchema>;
const AvailabilitySchema = BookingRulesSchema.extend({ timezone: z.string(), hours: HoursSchema, exceptions: z.array(ExceptionSchema) });
export type Availability = z.infer<typeof AvailabilitySchema>;
const WindowsSchema = z.array(z.object({ startsAt: z.string(), endsAt: z.string() }));
export type AvailabilityWindow = z.infer<typeof WindowsSchema>[number];
const OpenTimesSchema = z.object({
  meetingId: z.string(), coachTimezone: z.string(), durationMinutes: z.number().int(), lateCancelHours: z.number().int(),
  billable: z.boolean(), hasAvailability: z.boolean(), times: z.array(z.string()),
});
export type OpenTimes = z.infer<typeof OpenTimesSchema>;

const availabilityKey = [...meetingsKey, 'availability'];

/** The signed-in coach's hours, time off, extra hours and booking rules. */
export function useMyAvailability() {
  return useQuery({ queryKey: availabilityKey, queryFn: () => rpc('get_my_availability', {}, AvailabilitySchema) });
}

export function useSaveWorkingHours() {
  return useMeetingMutation((hours: z.infer<typeof HoursSchema>) => rpc('save_working_hours', { p_hours: hours }, HoursSchema));
}

export function useSaveBookingRules() {
  return useMeetingMutation((rules: BookingRules) => rpc('save_booking_rules', {
    p_notice_hours: rules.bookingNoticeHours, p_horizon_days: rules.bookingHorizonDays, p_buffer_minutes: rules.bookingBufferMinutes,
  }, BookingRulesSchema));
}

/** Adds or updates (the id is chosen once per dialog). Time off replies with the meetings inside it. */
export function useSaveAvailabilityException() {
  return useMeetingMutation((input: AvailabilityException) => rpc('save_availability_exception', {
    p_id: input.id, p_kind: input.kind, p_starts_at: input.startsAt, p_ends_at: input.endsAt, p_all_day: input.allDay, p_note: input.note,
  }, z.object({ exception: ExceptionSchema, overlaps: Overlaps })));
}

export function useRemoveAvailabilityException() {
  return useMeetingMutation((id: string) => rpc('remove_availability_exception', { p_id: id }, z.object({ removed: z.boolean() })));
}

/** The coach's own available time, for shading the calendar. */
export function useAvailabilityWindows(from: Date, to: Date) {
  return useQuery({
    queryKey: [...availabilityKey, 'windows', from.toISOString(), to.toISOString()],
    placeholderData: keepPreviousData,
    queryFn: () => rpc('list_availability_windows', { p_from: from.toISOString(), p_to: to.toISOString() }, WindowsSchema),
  });
}

/** Times a meeting could move to. Clients see only these, never the coach's calendar. */
export function useOpenTimes(meetingId: string | null) {
  return useQuery({
    queryKey: [...meetingsKey, 'open-times', meetingId],
    enabled: !!meetingId,
    queryFn: () => rpc('list_open_times', { p_meeting_id: meetingId }, OpenTimesSchema),
  });
}

/** Clients: one open cancel or reschedule request per meeting. The id is chosen once per dialog, so retries are safe. */
export function useRequestMeetingChange() {
  return useMeetingMutation((input: { requestId: string; meetingId: string; kind: 'cancel' | 'reschedule'; message: string; preferredStartsAt: string | null }) =>
    rpc('request_meeting_change', {
      p_request_id: input.requestId, p_meeting_id: input.meetingId, p_kind: input.kind, p_message: input.message,
      p_preferred_starts_at: input.preferredStartsAt,
    }, RequestSchema));
}

export function useWithdrawMeetingRequest() {
  return useMeetingMutation((requestId: string) => rpc('withdraw_meeting_request', { p_request_id: requestId }, RequestSchema));
}
