import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NutritionData, type NutritionTargetInput } from '@/domain/nutrition';
import { requireSupabase } from '@/lib/supabase';

export function useNutrition(clientId: string | undefined, through?: string) {
  return useQuery({
    queryKey: ['nutrition', clientId, through ?? 'current'], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_nutrition', { p_client_id: clientId!, p_through: through || null });
      if (error) throw error;
      return NutritionData.parse(data);
    },
  });
}

export type NutritionSave = { kind: 'weight' | 'nutrition'; date: string; value: Record<string, unknown>; expectedVersion: number; requestId: string };
export function useSaveNutrition(clientId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (input: NutritionSave) => {
      const { error } = await requireSupabase().rpc('save_nutrition_entry', {
        p_client_id: clientId, p_kind: input.kind, p_date: input.date, p_value: input.value,
        p_expected_version: input.expectedVersion, p_request_id: input.requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['nutrition', clientId] }),
  });
}
export function useAssignNutrition(clientId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async ({ value, requestId }: { value: NutritionTargetInput; requestId: string }) => {
      const { error } = await requireSupabase().rpc('assign_nutrition_target', { p_client_id: clientId, p_value: value, p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['nutrition', clientId] }),
  });
}
export function nutritionError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'PT409' || e?.code === '22023' || e?.code === '55000') return e.message ?? 'Check your entry.';
  if (e?.code === '42501') return 'You don’t have access to change or view this nutrition record.';
  if (e?.code === '23514' || e?.code === '22P02' || e?.code === '22003' || e?.code === '23502') return 'Check the dates and values. Calories must be between 0 and 30,000; weight must be greater than 0 and at most 1,500.';
  return 'Couldn’t reach the nutrition service. Your unsaved entry is kept here; try again.';
}
