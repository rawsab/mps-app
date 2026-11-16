import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ServiceKind } from '@/domain/programs/contract';
import { requireSupabase } from '@/lib/supabase';

export type Viewer = {
  userId: string;
  email: string;
  displayName: string;
  staffRole: 'admin' | 'coach' | null;
  /** Null when the user is not a client, or is a disabled client (RLS hides the record). */
  client: { id: string; fullName: string; status: string } | null;
  services: ServiceKind[];
};

type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; session: Session };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = requireSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? { status: 'signed_in', session: data.session } : { status: 'signed_out' });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState(session ? { status: 'signed_in', session } : { status: 'signed_out' });
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Resolves what the signed-in user may see. Each read goes through RLS, so this reflects the
 * database's authorization rather than deciding it.
 */
async function loadViewer(session: Session): Promise<Viewer> {
  const supabase = requireSupabase();
  const userId = session.user.id;
  const [role, client, profile] = await Promise.all([
    supabase.from('staff_roles').select('role').eq('auth_user_id', userId).maybeSingle(),
    supabase.from('clients').select('id, full_name, status').eq('auth_user_id', userId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('auth_user_id', userId).maybeSingle(),
  ]);
  for (const r of [role, client, profile]) if (r.error) throw r.error;

  let services: ServiceKind[] = [];
  if (client.data) {
    const enrollments = await supabase.from('service_enrollments').select('service, status').eq('client_id', client.data.id).neq('status', 'ended');
    if (enrollments.error) throw enrollments.error;
    services = enrollments.data.map((e) => e.service as ServiceKind);
    if (client.data.status === 'invited') {
      const { error } = await supabase.rpc('mark_client_active');
      if (error) throw error;
    }
  }
  return {
    userId,
    email: session.user.email ?? '',
    displayName: profile.data?.display_name ?? '',
    staffRole: (role.data?.role as Viewer['staffRole']) ?? null,
    client: client.data ? { id: client.data.id, fullName: client.data.full_name, status: client.data.status } : null,
    services,
  };
}

export function useViewer() {
  const auth = useAuth();
  const session = auth.status === 'signed_in' ? auth.session : null;
  return useQuery({
    queryKey: ['viewer', session?.user.id],
    queryFn: () => loadViewer(session!),
    enabled: !!session,
    staleTime: 60_000,
  });
}

export async function signOut() {
  await requireSupabase().auth.signOut();
}
