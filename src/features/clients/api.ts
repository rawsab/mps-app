import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ServiceKind } from '@/domain/programs/contract';
import { requireSupabase } from '@/lib/supabase';
import { photoUrl } from '@/features/profile/api';

export const ClientStatus = z.enum(['pending', 'invited', 'active', 'disabled']);
export type ClientStatus = z.infer<typeof ClientStatus>;
export const EnrollmentStatus = z.enum(['active', 'paused', 'ended']);

export type ClientRow = {
  id: string;
  email: string;
  full_name: string;
  status: ClientStatus;
  timezone: string;
  auth_user_id: string | null;
  primary_coach_id: string | null;
  created_at: string;
  updated_at: string;
  service_enrollments: EnrollmentRow[];
};

export type EnrollmentRow = {
  id: string;
  service: ServiceKind;
  status: z.infer<typeof EnrollmentStatus>;
  starts_on: string;
  ends_on: string | null;
  archived_at: string | null;
  /** When the service was added; the Services card lists newest first. */
  created_at: string;
  /** Selected by the clients list, which counts service changes as edits. */
  updated_at?: string;
  /** The coach's choice of current program (decision 0039); see `currentProgramId`. */
  current_program_id: string | null;
  current_nutrition_program_id: string | null;
};

const CLIENT_COLUMNS = 'id, email, full_name, status, timezone, auth_user_id, primary_coach_id, created_at, updated_at, service_enrollments(id, service, status, starts_on, ends_on, archived_at, created_at, updated_at, current_program_id, current_nutrition_program_id)';

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('clients').select(CLIENT_COLUMNS).order('full_name');
      if (error) throw error;
      return data as ClientRow[];
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('clients').select(CLIENT_COLUMNS).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },
  });
}

/** Photo access follows client assignments in both profile and Storage policies. */
export function useClientPhoto(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['client-photo', userId],
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('profiles').select('avatar_path').eq('auth_user_id', userId!).maybeSingle();
      if (error) throw error;
      return photoUrl(data?.avatar_path ?? null);
    },
  });
}

export const NewClientInput = z.object({
  full_name: z.string().trim().min(1, 'Enter the client’s name').max(160),
  email: z.email('Enter a valid email address').transform((e) => e.toLowerCase()),
  timezone: z.string().min(1),
  services: z.array(ServiceKind).min(1, 'Choose at least one service'),
  /** Optional private note; blank means no note. */
  notes: z.string().trim().max(5000, 'Keep notes under 5,000 characters'),
});
export type NewClientInput = z.infer<typeof NewClientInput>;

/** Creates the client record and its enrollments. RLS allows this only for admins. */
export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewClientInput) => {
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from('clients')
        .insert({ full_name: input.full_name, email: input.email, timezone: input.timezone })
        .select('id')
        .single();
      if (error) throw error;
      const { error: enrollError } = await supabase
        .from('service_enrollments')
        .insert(input.services.map((service) => ({ client_id: data.id, service })));
      if (enrollError) throw enrollError;
      if (input.notes) {
        const { error: noteError } = await supabase.from('private_coach_notes').insert({ client_id: data.id, body: input.notes });
        if (noteError) throw noteError;
      }
      return data.id as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

/** Private coaching notes: staff only, enforced by RLS (clients never read them). */
export function useClientNotes(clientId: string) {
  return useQuery({
    queryKey: ['client-notes', clientId],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('private_coach_notes')
        .select('id, body, author_id, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as { id: string; body: string; author_id: string | null; created_at: string }[];
    },
  });
}

export const NoteBody = z.string().trim().min(1, 'Write a note first').max(5000, 'Keep notes under 5,000 characters');

export function useAddClientNote(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await requireSupabase().from('private_coach_notes').insert({ client_id: clientId, body });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] }),
  });
}

export function useUpdateClientStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ClientStatus }) => {
      const { error } = await requireSupabase().from('clients').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export type CoachOption = { id: string; name: string; role: 'admin' | 'coach' };

/** Staff a client can be transferred to. Admin only; the function checks the role itself. */
export function useTransferCoachOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['transfer-coach-options'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('transfer_coach_options');
      if (error) throw error;
      return data as CoachOption[];
    },
  });
}

/** Moves the client to a new primary coach (decision 0041); future sessions and meetings follow. */
export function useTransferClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, coachId }: { clientId: string; coachId: string }) => {
      const { error } = await requireSupabase().rpc('transfer_client', { p_client_id: clientId, p_coach_id: coachId });
      if (error) throw error;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['meetings'] }),
    ]),
  });
}

export function useAddEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, service }: { clientId: string; service: ServiceKind }) => {
      const { error } = await requireSupabase().from('service_enrollments').insert({ client_id: clientId, service });
      if (error) throw error;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      // Adding a requested service answers the request, so it leaves the unread list.
      queryClient.invalidateQueries({ queryKey: ['staff-activity'] }),
    ]),
  });
}

export function useSetEnrollmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EnrollmentRow['status'] }) => {
      const patch = status === 'ended' ? { status, ends_on: new Date().toISOString().slice(0, 10) } : { status, ends_on: null };
      const { error } = await requireSupabase().from('service_enrollments').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

/** Hide ended enrollments without removing linked program/session history. */
export function useArchiveEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from('service_enrollments')
        .update({ archived_at: new Date().toISOString() }).eq('id', id).eq('status', 'ended').select('id').single();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

/** What deleting an archived service with its programs would remove. Admin only. */
export function useArchivedServiceContents(enrollmentId: string) {
  return useQuery({
    queryKey: ['clients', 'archived-service', enrollmentId],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('archived_service_contents', { p_enrollment_id: enrollmentId });
      if (error) throw error;
      return z.object({ programs: z.number().int(), published: z.number().int(), loggedWorkouts: z.number().int() }).parse(data);
    },
  });
}

/** Admin only. Without `deletePrograms`, the server refuses a service that still has programs (decision 0038). */
export function useDeleteArchivedService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deletePrograms }: { id: string; deletePrograms: boolean }) => {
      const { error } = await requireSupabase().rpc('delete_archived_service', { p_enrollment_id: id, p_delete_programs: deletePrograms });
      if (error?.code === 'PT409') throw new Error(`${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`);
      if (error) throw error;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['programs'] }),
      queryClient.invalidateQueries({ queryKey: ['meetings'] }),
    ]),
  });
}

/** Calls the server-side invite function. It verifies the caller's admin role itself. */
export function useInviteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await requireSupabase().functions.invoke<{ status: string }>('invite-client', {
        body: { clientId, redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error((detail as { error?: string } | null)?.error ?? error.message);
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === '23505') return 'That would duplicate an existing record (email or active service).';
  if (e?.code === '42501') return 'You do not have permission to do that.';
  return e?.message ?? 'Something went wrong. Nothing was saved.';
}

/** Authorship and client access are enforced again by the delete policy. */
export function useDeleteClientNote(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await requireSupabase().from('private_coach_notes').delete().eq('id', id).eq('client_id', clientId).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] }),
  });
}

// ---------------------------------------------------------------------------------------------
// Service requests: staff answers (decision 0044)

const PendingServiceRequestSchema = z.object({
  id: z.string(), clientId: z.string(), clientName: z.string(), service: ServiceKind, message: z.string(), createdAt: z.string(),
});
export type PendingServiceRequest = z.infer<typeof PendingServiceRequestSchema>;
const pendingServiceRequestsKey = ['service-requests', 'pending'];

/**
 * Pending requests for one client, or across every client the caller can see. The client page and
 * the Clients page share this query, so an answer in one shows in the other.
 */
export function usePendingServiceRequests(clientId?: string) {
  return useQuery({
    queryKey: [...pendingServiceRequestsKey, clientId ?? 'all'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('list_pending_service_requests', clientId ? { p_client_id: clientId } : {});
      if (error) throw error;
      return z.array(PendingServiceRequestSchema).parse(data);
    },
  });
}

/** Opening a request marks it seen for this staff member, the same read state Reviews uses. */
export function useMarkServiceRequestSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().rpc('mark_service_request_read', { p_request_id: id });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['staff-activity'] }),
  });
}

/** Accepting adds the service; answering again is harmless, so a retry never adds it twice. */
export function useAnswerServiceRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; accept: true } | { id: string; accept: false; reply: string }) => {
      const { error } = input.accept
        ? await requireSupabase().rpc('accept_service_request', { p_request_id: input.id })
        : await requireSupabase().rpc('decline_service_request', { p_request_id: input.id, p_response: input.reply });
      if (error) throw error;
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['service-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['staff-activity'] }),
    ]),
  });
}
