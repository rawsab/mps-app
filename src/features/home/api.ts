import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useViewer } from '@/app/auth';
import type { ServiceKind } from '@/domain/programs/contract';
import { useNutritionPrograms } from '@/features/nutrition/programApi';
import { MeetingSchema } from '@/features/scheduling/api';
import { usePublishedProgram, usePublishedPrograms, useTrainingLog } from '@/features/training/api';
import { requireSupabase } from '@/lib/supabase';

// Client Home (FR-03, decision 0042).

/** Re-renders every 30 seconds so "join now" and the next meeting stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const MEETING_LOOKAHEAD_DAYS = 60;

/** The client's next scheduled meeting that hasn't ended, or null. RLS limits `list_meetings` to their own. */
export function useNextMeeting(now: number) {
  const [from] = useState(() => new Date());
  const to = useMemo(() => new Date(from.getTime() + MEETING_LOOKAHEAD_DAYS * 86_400_000), [from]);
  const query = useQuery({
    queryKey: ['meetings', 'mine', from.toISOString()],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('list_meetings', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw error;
      return z.array(MeetingSchema).parse(data);
    },
  });
  const next = query.data?.find((m) => m.status === 'scheduled' && new Date(m.startsAt).getTime() + m.durationMinutes * 60_000 > now) ?? null;
  return { ...query, next };
}

/**
 * Where each of the client's services opens: its current program, else the service's list.
 * Training programs say which is current; so do nutrition programs (decision 0039).
 */
export function useServiceLinks() {
  const viewer = useViewer();
  const services = viewer.data?.services ?? [];
  const training = usePublishedPrograms();
  const nutrition = useNutritionPrograms(services.includes('nutrition') ? viewer.data?.client?.id : undefined);
  return services.map((service): { service: ServiceKind; to: string } => {
    if (service === 'nutrition') {
      const current = nutrition.data?.find((p) => p.is_current && !p.archived_at);
      return { service, to: current ? `/nutrition/${current.id}` : '/nutrition' };
    }
    const current = training.data?.find((p) => p.service === service && p.isCurrent);
    return { service, to: current ? `/training/${current.programId}` : '/training' };
  });
}

/** The current mesocycle with its log, shared by the to-do and the progress tile. */
export function useCurrentMesocycle(enabled: boolean) {
  const programs = usePublishedPrograms();
  const id = enabled ? programs.data?.find((p) => p.service === 'mesocycle' && p.isCurrent)?.programId : undefined;
  const program = usePublishedProgram(id);
  const log = useTrainingLog(id);
  return {
    id,
    isPending: enabled && (programs.isPending || (!!id && (program.isPending || log.isPending))),
    error: programs.error ?? program.error ?? log.error,
    program: program.data?.document,
    sessions: log.data,
  };
}

// ---------------------------------------------------------------------------------------------
// Service requests (migration 00037)

const ServiceRequestSchema = z.object({
  id: z.string(), service: z.enum(['personal_training', 'mesocycle', 'nutrition']), message: z.string(), createdAt: z.string(),
  status: z.enum(['pending', 'enrolled', 'declined']), response: z.string(), resolvedAt: z.string().nullable(),
});
export type ServiceRequest = z.infer<typeof ServiceRequestSchema>;
const serviceRequestsKey = ['service-requests', 'mine'];

export function useMyServiceRequests() {
  return useQuery({
    queryKey: serviceRequestsKey,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('list_my_service_requests');
      if (error) throw error;
      return z.array(ServiceRequestSchema).parse(data);
    },
  });
}

/** The id comes from the caller and is kept across retries, so a lost reply never sends twice. */
export function useRequestService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; service: ServiceKind; message: string }) => {
      const { data, error } = await requireSupabase().rpc('request_service', { p_request_id: input.id, p_service: input.service, p_message: input.message });
      if (error) throw error;
      return ServiceRequestSchema.parse(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serviceRequestsKey }),
  });
}

/** Edits the message on the client's pending request. A changed message shows the coach the request again. */
export function useUpdateServiceRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; message: string }) => {
      const { data, error } = await requireSupabase().rpc('update_service_request', { p_request_id: input.id, p_message: input.message });
      if (error) throw error;
      return ServiceRequestSchema.parse(data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: serviceRequestsKey }),
  });
}
