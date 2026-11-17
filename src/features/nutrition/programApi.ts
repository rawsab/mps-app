import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { NutritionProgramSnapshot, NutritionProgramSummary, NutritionRevision, type NutritionProgramDraft } from '@/domain/nutritionProgram';
import { requireSupabase } from '@/lib/supabase';

export const nutritionProgramKey = ['nutrition-programs'];
export async function fetchNutritionProgram(id: string, published = false) {
  const { data, error } = await requireSupabase().rpc('get_nutrition_program', { p_program_id: id, p_published: published });
  if (error) throw error;
  return NutritionProgramSnapshot.parse(data);
}
export function useNutritionProgram(id: string | undefined, published = false) {
  return useQuery({ queryKey: [...nutritionProgramKey, id, published], enabled: !!id, queryFn: () => fetchNutritionProgram(id!, published) });
}
export function useNutritionPrograms(clientId: string | undefined) {
  return useQuery({ queryKey: [...nutritionProgramKey, 'client', clientId], enabled: !!clientId, queryFn: async () => {
    const { data, error } = await requireSupabase().rpc('list_nutrition_programs', { p_client_id: clientId! });
    if (error) throw error;
    return z.array(NutritionProgramSummary).parse(data);
  } });
}
export function useCreateNutritionProgram() {
  const cache = useQueryClient();
  return useMutation({ mutationFn: async ({ enrollmentId, programId }: { enrollmentId: string; programId: string }) => {
    const { data, error } = await requireSupabase().rpc('create_nutrition_program', { p_enrollment_id: enrollmentId, p_program_id: programId });
    if (error) throw error;
    return data as string;
  }, onSuccess: () => cache.invalidateQueries({ queryKey: ['programs'] }) });
}
export async function saveNutritionDraft(programId: string, version: number | null, draft: NutritionProgramDraft) {
  const { data, error } = await requireSupabase().rpc('save_nutrition_program_draft', { p_program_id: programId, p_expected_version: version, p_value: draft });
  if (error) throw error;
  return NutritionRevision.parse(data);
}
export type SheetEntry = { row_date: string; kind: 'weight' | 'nutrition'; value: Record<string, unknown>; expected_version: number; request_id: string };
export function useSaveNutritionCells(programId: string, revisionId: string) {
  const cache = useQueryClient();
  return useMutation({ mutationFn: async (rows: SheetEntry[]) => {
    const { error } = await requireSupabase().rpc('save_nutrition_program_entries', { p_program_id: programId, p_revision_id: revisionId, p_rows: rows });
    if (error) throw error;
  }, onSuccess: async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: nutritionProgramKey }),
      cache.invalidateQueries({ queryKey: ['nutrition'] }),
      cache.invalidateQueries({ queryKey: ['staff-activity'] }),
      cache.invalidateQueries({ queryKey: ['client-activity'] }),
    ]);
  }, onError: () => { void cache.invalidateQueries({ queryKey: [...nutritionProgramKey, programId] }); } });
}
export async function publishNutritionProgram(programId: string, version: number) {
  const { error } = await requireSupabase().rpc('publish_nutrition_program', { p_program_id: programId, p_expected_version: version });
  if (error) throw error;
}
