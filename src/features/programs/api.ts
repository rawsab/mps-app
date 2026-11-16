import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProgramDraft, type PublishProblem, type ServiceKind } from '@/domain/programs/contract';
import { requireSupabase } from '@/lib/supabase';

export type RevisionSummary = {
  id: string;
  revision_number: number;
  status: 'draft' | 'published';
  title: string;
  updated_at: string;
  published_at: string | null;
};

export type ProgramRow = {
  id: string;
  service: Exclude<ServiceKind, 'nutrition'>;
  enrollment_id: string;
  current_revision_id: string | null;
  archived_at: string | null;
  created_at: string;
  program_revisions: RevisionSummary[];
};

// programs ↔ program_revisions has two FKs (revision.program_id and programs.current_revision_id).
const PROGRAM_COLUMNS =
  'id, service, enrollment_id, current_revision_id, archived_at, created_at, program_revisions!program_revisions_program_id_client_id_fkey(id, revision_number, status, title, updated_at, published_at)';

export function useClientPrograms(clientId: string) {
  return useQuery({
    queryKey: ['programs', 'client', clientId],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('programs')
        .select(PROGRAM_COLUMNS)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProgramRow[];
    },
  });
}

export function useProgram(programId: string | undefined) {
  return useQuery({
    queryKey: ['programs', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('programs')
        .select(`${PROGRAM_COLUMNS}, client_id, clients(full_name)`)
        .eq('id', programId!)
        .maybeSingle();
      if (error) throw error;
      return data as (ProgramRow & { client_id: string; clients: { full_name: string } | null }) | null;
    },
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { data, error } = await requireSupabase().rpc('create_program', { p_enrollment_id: enrollmentId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programs'] }),
  });
}

/** The working draft, or the published revision to start one from (decision 0005). */
export type DraftSnapshot = {
  revisionNumber: number | null;
  status: 'draft' | 'published' | null;
  /** Null unless a draft exists: the next save then creates one. */
  lockVersion: number | null;
  draft: ProgramDraft | null;
};

export async function fetchProgramDraft(programId: string): Promise<DraftSnapshot> {
  const { data, error } = await requireSupabase().rpc('get_program_draft', { p_program_id: programId });
  if (error) throw error;
  const d = data as { revisionNumber: number | null; status: DraftSnapshot['status']; lockVersion: number | null; draft: unknown };
  return {
    revisionNumber: d.revisionNumber,
    status: d.status,
    lockVersion: d.lockVersion,
    // Parsing guards the editor against a document it can't represent.
    draft: d.draft === null ? null : ProgramDraft.parse(d.draft),
  };
}

export type SaveResult = { revisionId: string; revisionNumber: number; lockVersion: number };

/** Thrown for PT409: someone else saved (or published) first. Nothing was written. */
export class StaleDraftError extends Error {
  constructor(public currentVersion: number | null) {
    super('This draft was changed somewhere else since you opened it.');
  }
}

/** Thrown for PT422 with the same problem list `validateForPublish` produces. */
export class NotReadyError extends Error {
  constructor(public problems: PublishProblem[]) {
    super('The draft is not ready to publish.');
  }
}

function rpcError(error: { code?: string; message: string; details?: string }): Error {
  if (error.code === 'PT409') return new StaleDraftError(parseDetails<{ currentVersion: number | null }>(error.details)?.currentVersion ?? null);
  if (error.code === 'PT422') return new NotReadyError(parseDetails<PublishProblem[]>(error.details) ?? []);
  return Object.assign(new Error(error.message), { code: error.code });
}

function parseDetails<T>(details: string | undefined): T | null {
  try {
    return details ? (JSON.parse(details) as T) : null;
  } catch {
    return null;
  }
}

export async function saveProgramDraft(programId: string, expectedVersion: number | null, draft: ProgramDraft): Promise<SaveResult> {
  const { data, error } = await requireSupabase().rpc('save_draft', {
    p_program_id: programId,
    p_expected_version: expectedVersion,
    p_draft: draft,
  });
  if (error) throw rpcError(error);
  return data as SaveResult;
}

export async function publishProgram(programId: string, expectedVersion: number): Promise<{ revisionNumber: number; publishedAt: string }> {
  const { data, error } = await requireSupabase().rpc('publish_revision', {
    p_program_id: programId,
    p_expected_version: expectedVersion,
  });
  if (error) throw rpcError(error);
  return data as { revisionNumber: number; publishedAt: string };
}

export function programErrorMessage(err: unknown): string {
  if (err instanceof StaleDraftError || err instanceof NotReadyError) return err.message;
  const e = err as { code?: string; message?: string };
  if (e?.code === '42501') return 'You do not have permission to do that.';
  if (e?.code === '55000') return e.message ?? 'This program can no longer be changed.';
  if (e?.code === '22023') return `The server rejected the draft: ${e.message}`;
  if (e?.message === 'Failed to fetch') return 'Could not reach the server. Your edits are kept here.';
  return e?.message ?? 'Something went wrong. Your edits are kept here.';
}
