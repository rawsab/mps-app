import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ProgramDraft, WorkoutDay, type ServiceKind } from '@/domain/programs/contract';
import type { FeedbackAnswers } from '@/domain/training/feedback';
import type { LoggedSet, MuscleFeedback, SessionStatus, TrainingSession } from '@/domain/training/volume';
import { requireSupabase } from '@/lib/supabase';

/** Published content only (migration 00014). Drafts never reach the client. */
export type PublishedProgramSummary = {
  programId: string;
  service: Exclude<ServiceKind, 'nutrition'>;
  revisionNumber: number;
  publishedAt: string;
  title: string;
  programTheme: string;
  weekCount: number;
  /** The service's current program (decision 0039). */
  isCurrent: boolean;
  /** Only in the archived list (decision 0060). */
  archivedAt?: string | null;
};

export type PublishedProgram = {
  programId: string;
  service: Exclude<ServiceKind, 'nutrition'>;
  revisionNumber: number;
  publishedAt: string;
  archivedAt: string | null;
  document: ProgramDraft;
};

export function usePublishedPrograms() {
  return useQuery({
    queryKey: ['training', 'programs'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('list_published_programs');
      if (error) throw error;
      return data as PublishedProgramSummary[];
    },
  });
}

/** The client's archived programs that were published at least once, newest archive first (decision 0060). */
export function useArchivedPrograms() {
  return useQuery({
    queryKey: ['training', 'programs', 'archived'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('list_archived_programs');
      if (error) throw error;
      return data as PublishedProgramSummary[];
    },
  });
}

export function usePublishedProgram(programId: string | undefined) {
  return useQuery({
    queryKey: ['training', 'programs', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_published_program', { p_program_id: programId! });
      if (error) throw error;
      const d = data as Omit<PublishedProgram, 'document'> & { document: unknown };
      // Parsing guards the view against a document it can't represent.
      return { ...d, document: ProgramDraft.parse(d.document) } satisfies PublishedProgram;
    },
  });
}

export function trainingErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42501') return 'This program is not available. It may have been removed or not published yet.';
  if (e?.message === 'Failed to fetch') return 'Could not reach the server. Check your connection and try again.';
  return 'Something went wrong loading your program.';
}

// ---------------------------------------------------------------------------------------------
// Mesocycle set logging (migration 00016, decision 0021). The client and staff with access write
// through the same functions; set ids are generated here so a retried save never duplicates.

const LoggedSetSchema = z.object({
  id: z.string(), exerciseId: z.string(), setNumber: z.number().int(),
  loadMode: z.enum(['external', 'assisted', 'bodyweight']).nullable(), loadValue: z.number().nullable(),
  loadUnit: z.enum(['lb', 'kg']).nullable(), reps: z.number().nullable(), muscles: z.array(z.string()),
  updatedAt: z.string(), updatedByStaff: z.boolean(),
});
const score = z.number().int().min(0).max(3).nullable();
const FeedbackSchema = z.object({
  muscleKey: z.string(), muscleName: z.string(), challenge: score, pump: score, disruption: score, soreness: score, performance: score,
  comparedSessionId: z.string().nullable(), updatedAt: z.string(), updatedByStaff: z.boolean(),
});
const SessionSchema = z.object({
  id: z.string(), dayId: z.string(), revisionId: z.string(), status: z.enum(['in_progress', 'completed', 'skipped']),
  performedOn: z.string().nullable(), startedAt: z.string(), completedAt: z.string().nullable(), notes: z.string(),
  updatedAt: z.string(), updatedByStaff: z.boolean(), useSections: z.boolean(), day: WorkoutDay, sets: z.array(LoggedSetSchema),
  feedback: z.array(FeedbackSchema),
});

const logKey = (programId: string) => ['training', 'log', programId];

export function useTrainingLog(programId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: logKey(programId ?? ''),
    enabled: !!programId && enabled,
    queryFn: async (): Promise<TrainingSession[]> => {
      const { data, error } = await requireSupabase().rpc('get_training_log', { p_program_id: programId! });
      if (error) throw error;
      return z.array(SessionSchema).parse(data);
    },
  });
}

export function useStartSession(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dayId: string) => {
      const { error } = await requireSupabase().rpc('start_session', { p_program_id: programId, p_day_id: dayId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: logKey(programId) }),
  });
}

export type SetInput = { id: string; sessionId: string; exerciseId: string; setNumber: number; loadMode: LoggedSet['loadMode']; loadValue: number | null; loadUnit: LoggedSet['loadUnit']; reps: number | null };

/** Saves one set and merges the server's row into the cached log without refetching. */
export function useSaveSet(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetInput) => {
      const { data, error } = await requireSupabase().rpc('save_logged_set', {
        p_set_id: input.id, p_session_id: input.sessionId, p_exercise_id: input.exerciseId, p_set_number: input.setNumber,
        p_load_mode: input.loadMode, p_load_value: input.loadValue, p_load_unit: input.loadUnit, p_reps: input.reps,
      });
      if (error) throw error;
      return data as { updated_at: string };
    },
    onSuccess: (row, input) => {
      queryClient.setQueryData<TrainingSession[]>(logKey(programId), (sessions) => sessions?.map((session) => {
        if (session.id !== input.sessionId) return session;
        const existing = session.sets.find((set) => set.id === input.id);
        const muscles = existing?.muscles ?? session.day.sections.flatMap((s) => s.exercises).find((e) => e.id === input.exerciseId)?.muscles ?? [];
        const saved: LoggedSet = { id: input.id, exerciseId: input.exerciseId, setNumber: input.setNumber, loadMode: input.loadMode,
          loadValue: input.loadValue, loadUnit: input.loadUnit, reps: input.reps, muscles, updatedAt: row.updated_at, updatedByStaff: existing?.updatedByStaff ?? false };
        return { ...session, sets: existing ? session.sets.map((set) => (set.id === input.id ? saved : set)) : [...session.sets, saved] };
      }));
    },
  });
}

export function useDeleteSet(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; sessionId: string }) => {
      const { error } = await requireSupabase().rpc('delete_logged_set', { p_set_id: id });
      if (error) throw error;
    },
    onSuccess: (_, { id, sessionId }) => {
      queryClient.setQueryData<TrainingSession[]>(logKey(programId), (sessions) => sessions?.map((session) =>
        session.id === sessionId ? { ...session, sets: session.sets.filter((set) => set.id !== id) } : session));
    },
  });
}

export type FeedbackInput = { sessionId: string; muscleName: string; answers: FeedbackAnswers; comparedSessionId: string | null };

/** Saves one muscle's Stimulus & Fatigue answers (migration 00017) and merges the row into the cached log. */
export function useSaveFeedback(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FeedbackInput) => {
      const { answers: a } = input;
      const { data, error } = await requireSupabase().rpc('save_muscle_feedback', {
        p_session_id: input.sessionId, p_muscle_name: input.muscleName, p_challenge: a.challenge, p_pump: a.pump,
        p_disruption: a.disruption, p_soreness: a.soreness, p_performance: a.performance, p_compared_session_id: input.comparedSessionId,
      });
      if (error) throw error;
      return data as { muscle_key: string; muscle_name: string; updated_at: string };
    },
    onSuccess: (row, input) => {
      queryClient.setQueryData<TrainingSession[]>(logKey(programId), (sessions) => sessions?.map((session) => {
        if (session.id !== input.sessionId) return session;
        const existing = session.feedback.find((f) => f.muscleKey === row.muscle_key);
        const saved: MuscleFeedback = { muscleKey: row.muscle_key, muscleName: row.muscle_name, ...input.answers,
          comparedSessionId: input.comparedSessionId, updatedAt: row.updated_at, updatedByStaff: existing?.updatedByStaff ?? false };
        return { ...session, feedback: existing ? session.feedback.map((f) => (f === existing ? saved : f)) : [...session.feedback, saved] };
      }));
    },
  });
}

export function useUpdateSession(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; status: SessionStatus; performedOn: string | null; notes: string }) => {
      const { error } = await requireSupabase().rpc('update_session', {
        p_session_id: input.sessionId, p_status: input.status, p_performed_on: input.performedOn, p_notes: input.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: logKey(programId) }),
  });
}

export function logErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42501') return 'You can’t change this log.';
  if (e?.code === '22023' || e?.code === 'PT409' || e?.code === '55000') return e.message ?? 'The server refused this change.';
  if (e?.message === 'Failed to fetch') return 'Couldn’t reach the server. Your entry is kept here; try again.';
  return 'Couldn’t save. Try again.';
}
