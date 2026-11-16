import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { envResult } from './env';

/**
 * The single browser Supabase client. There is no mock fallback: when configuration is missing the
 * app shows a configuration error instead of pretending to work.
 */
export const supabase: SupabaseClient | null = envResult.ok
  ? createClient(envResult.env.supabaseUrl, envResult.env.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Admin-issued invitation links carry tokens in the URL fragment (implicit flow).
        flowType: 'implicit',
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}
