import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { z } from 'zod';
import type { ActivityItem, ReviewItem } from '@/domain/activity/feed';
import type { TrendWindow } from '@/domain/activity/trends';
import { requireSupabase } from '@/lib/supabase';

// Staff-only feed of a client's logging (migration 00018, decision 0023).
const SessionActivitySchema = z.object({
  kind: z.literal('session'), id: z.string(), programId: z.string(), service: z.enum(['mesocycle', 'personal_training']),
  programTitle: z.string(), weekId: z.string(), weekIndex: z.number().int(), dayId: z.string(), dayIndex: z.number().int(),
  dayLabel: z.string(), status: z.enum(['in_progress', 'completed', 'skipped']), performedOn: z.string().nullable(),
  startedAt: z.string(), completedAt: z.string().nullable(), setCount: z.number().int(), feedbackCount: z.number().int(),
  activityAt: z.string(), staffEdited: z.boolean(),
});

const NutritionActivitySchema = z.object({
  kind: z.literal('nutrition'), id: z.string(), programId: z.string().nullable(), service: z.literal('nutrition'), programTitle: z.string(),
  loggedOn: z.string(), performedOn: z.string(), activityAt: z.string(), staffEdited: z.boolean(),
  status: z.enum(['completed','in_progress']), weight: z.number().nullable(), weightUnit: z.enum(['lb','kg']).nullable(),
  intake: z.number().nullable(), output: z.number().nullable(),
});
const RequestActivitySchema = z.object({
  kind: z.literal('request'), id: z.string(), services: z.array(z.enum(['personal_training', 'mesocycle', 'nutrition'])), requestKind: z.enum(['cancel', 'reschedule']),
  status: z.enum(['pending', 'accepted', 'declined', 'withdrawn', 'expired']), message: z.string(), preferredStartsAt: z.string().nullable(),
  late: z.boolean().nullable(), response: z.string(), meetingId: z.string(), startsAt: z.string(), durationMinutes: z.number().int(),
  activityAt: z.string(), staffEdited: z.boolean(),
});
const ServiceRequestActivitySchema = z.object({
  kind: z.literal('service_request'), id: z.string(), service: z.enum(['personal_training', 'mesocycle', 'nutrition']), message: z.string(),
  status: z.enum(['pending', 'enrolled', 'declined']), response: z.string().optional(), activityAt: z.string(), staffEdited: z.boolean(),
});
export const ActivitySchema = z.discriminatedUnion('kind',[SessionActivitySchema,NutritionActivitySchema]);
const reviewFields = { clientId: z.string(), clientName: z.string(), unread: z.boolean() };
export const ReviewSchema = z.discriminatedUnion('kind',[SessionActivitySchema.extend(reviewFields),NutritionActivitySchema.extend(reviewFields),RequestActivitySchema.extend(reviewFields),ServiceRequestActivitySchema.extend(reviewFields)]);

export const activityKey = (clientId: string) => ['client-activity', clientId];
export const HISTORY_PAGE = 25;

async function fetchActivity(clientId: string, limit: number, before?: ActivityItem): Promise<ActivityItem[]> {
  const { data, error } = await requireSupabase().rpc('get_client_activity', {
    p_client_id: clientId, p_limit: limit,
    // The cursor goes back exactly as the server sent it, so no precision is lost.
    p_before_at: before?.activityAt ?? null, p_before_id: before?.id ?? null,
  });
  if (error) throw error;
  return z.array(ActivitySchema).parse(data);
}

export function useRecentActivity(clientId: string, limit = 5) {
  return useQuery({
    queryKey: [...activityKey(clientId), 'recent', limit],
    refetchInterval: 60_000,
    queryFn: () => fetchActivity(clientId, limit),
  });
}

export function useActivityHistory(clientId: string) {
  return useInfiniteQuery({
    queryKey: [...activityKey(clientId), 'history'],
    initialPageParam: undefined as ActivityItem | undefined,
    queryFn: ({ pageParam }) => fetchActivity(clientId, HISTORY_PAGE, pageParam),
    getNextPageParam: (page) => (page.length === HISTORY_PAGE ? page.at(-1) : undefined),
  });
}

/** Opens the logged day in the coach's view of the client log, returning to where the coach came from. */
export function activityLink(clientId: string, item: ActivityItem): string {
  // The client page opens the session (and its request) from ?session=.
  if (item.kind === 'request') return `/coach/clients/${clientId}?${new URLSearchParams({ session: item.meetingId })}`;
  if (item.kind === 'service_request') return `/coach/clients/${clientId}`;
  if (item.kind === 'nutrition') return item.programId
    ? `/coach/clients/${clientId}/nutrition/${item.programId}/log#nutrition-day-${item.loggedOn}`
    : `/coach/clients/${clientId}`;
  const params = new URLSearchParams({ week: item.weekId, day: item.dayId });
  return `/coach/clients/${clientId}/programs/${item.programId}/log?${params}`;
}

// ---------------------------------------------------------------------------------------------
// Reviews: client activity across every visible client, with read state per staff member
// (migration 00019, decision 0024).

const reviewsKey = ['staff-activity'];
const listKey = [...reviewsKey, 'list'];
const unreadKey = [...reviewsKey, 'unread'];
const UNREAD_POLL_MS = 60_000;
/** Matches the fade on unread markers, so read items fade before a refetch drops them from Unread. */
export const READ_FADE_MS = 300;

export type ReviewFilter = 'all' | 'focused' | 'unread';

/** Focused: service requests and meeting requests (decision 0042). */
export function useReviews(filter: ReviewFilter) {
  return useInfiniteQuery({
    queryKey: [...listKey, filter],
    refetchInterval: UNREAD_POLL_MS,
    initialPageParam: undefined as ReviewItem | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await requireSupabase().rpc('get_staff_activity', {
        p_before_at: pageParam?.activityAt ?? null, p_before_id: pageParam?.id ?? null, p_limit: HISTORY_PAGE,
        p_unread_only: filter === 'unread', p_focused: filter === 'focused',
      });
      if (error) throw error;
      return z.array(ReviewSchema).parse(data);
    },
    getNextPageParam: (page) => (page.length === HISTORY_PAGE ? page.at(-1) : undefined),
  });
}

/** The sidebar badge. Polls because client logs arrive without the coach doing anything. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: unreadKey,
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('count_unread_activity');
      if (error) throw error;
      return data as number;
    },
  });
}

/** The latest few unread items. */
export function useLatestUnread(limit: number) {
  return useQuery({
    queryKey: [...listKey, 'latest', limit],
    refetchInterval: UNREAD_POLL_MS,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_staff_activity', { p_limit: limit, p_unread_only: true });
      if (error) throw error;
      return z.array(ReviewSchema).parse(data);
    },
  });
}

type ReviewPages = InfiniteData<ReviewItem[], ReviewItem | undefined>;

/**
 * One session seen (opening it), or everything read when no id is given. Markers clear at once
 * (optimistic) and fade; the server's view replaces the cache once the fade has finished.
 */
export function useMarkActivityRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: ActivityItem | null) => {
      const { error } = item?.kind === 'nutrition'
        ? await requireSupabase().rpc('mark_nutrition_activity_read', { p_activity_id: item.id })
        : item?.kind === 'service_request'
        ? await requireSupabase().rpc('mark_service_request_read', { p_request_id: item.id })
        : item?.kind === 'request'
        ? await requireSupabase().rpc('mark_request_read', { p_request_id: item.id })
        : await requireSupabase().rpc('mark_activity_read', item ? { p_session_id: item.id } : {});
      if (error) throw error;
    },
    onMutate: async (item) => {
      const sessionId = item?.id ?? null;
      await queryClient.cancelQueries({ queryKey: reviewsKey });
      // Lists are infinite pages (Reviews) or a plain array (the clients page's latest few).
      const lists = queryClient.getQueriesData<ReviewPages | ReviewItem[]>({ queryKey: listKey });
      const count = queryClient.getQueryData<number>(unreadKey);
      const read = (item: ReviewItem) => (sessionId === null || item.id === sessionId ? { ...item, unread: false } : item);
      const opened = lists.flatMap(([, data]) => (Array.isArray(data) ? data : data?.pages.flat() ?? [])).find((item) => item.id === sessionId && item.unread);
      queryClient.setQueriesData<ReviewPages | ReviewItem[]>({ queryKey: listKey }, (data) =>
        !data ? data : Array.isArray(data) ? data.map(read) : { ...data, pages: data.pages.map((page) => page.map(read)) });
      if (count !== undefined) queryClient.setQueryData(unreadKey, sessionId === null ? 0 : Math.max(0, count - (opened ? 1 : 0)));
      return { lists, count };
    },
    onError: (_error, _sessionId, context) => {
      context?.lists.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (context?.count !== undefined) queryClient.setQueryData(unreadKey, context.count);
    },
    onSettled: () => { setTimeout(() => void queryClient.invalidateQueries({ queryKey: reviewsKey }), READ_FADE_MS); },
  });
}

// Trends beside the feed (migration 00045, decision 0046).
const ActivityStatsSchema = z.object({
  total: z.number().int(),
  buckets: z.array(z.object({ bucket: z.string(), count: z.number().int() })),
  kinds: z.array(z.object({ kind: z.enum(['completed', 'logged', 'skipped', 'started', 'nutrition', 'request', 'service_request']), count: z.number().int() })),
  clients: z.array(z.object({ clientId: z.string(), clientName: z.string(), count: z.number().int() })),
});
export type ActivityStats = z.infer<typeof ActivityStatsSchema>;

/** Counts for one trend window, in the viewer's time zone. Shares the feed's poll and refresh. */
export function useActivityStats(window: TrendWindow) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: [...reviewsKey, 'stats', window.bucket, window.from.toISOString(), timeZone],
    refetchInterval: UNREAD_POLL_MS,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_staff_activity_stats', {
        p_from: window.from.toISOString(), p_to: window.to.toISOString(), p_bucket: window.bucket, p_time_zone: timeZone,
      });
      if (error) throw error;
      return ActivityStatsSchema.parse(data);
    },
  });
}
