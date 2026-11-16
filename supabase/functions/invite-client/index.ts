// Invite a client (FR-01). Runs server-side with the service role; the caller must be an admin.
// The auth user created by the invitation is bound to the intended client record here, so a
// browser-supplied email or id can never claim a client record.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('APP_ORIGINS') ?? 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply(401, { error: 'Sign in required' });

  // 1. Identify the caller with their own token and check the protected role table.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: 'Sign in required' });
  const { data: role } = await asCaller.from('staff_roles').select('role').eq('auth_user_id', userData.user.id).maybeSingle();
  if (role?.role !== 'admin') return reply(403, { error: 'Only an admin can invite clients' });

  // 2. Validate input.
  let body: { clientId?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request body' });
  }
  if (typeof body.clientId !== 'string' || !UUID.test(body.clientId)) return reply(400, { error: 'clientId must be a UUID' });
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : '';
  if (!ALLOWED_ORIGINS.some((origin) => redirectTo === `${origin}/auth/callback`)) {
    return reply(400, { error: 'redirectTo is not an allowed callback URL' });
  }

  // 3. Privileged work with the service role, scoped to the one validated client id.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, email, full_name, status, auth_user_id')
    .eq('id', body.clientId)
    .maybeSingle();
  if (clientError) return reply(500, { error: 'Could not load client' });
  if (!client) return reply(404, { error: 'Client not found' });
  if (client.status === 'disabled') return reply(409, { error: 'Client access is disabled. Reactivate before inviting.' });
  if (client.status === 'active') return reply(409, { error: 'Client already has an active account' });

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(client.email, {
    redirectTo,
    data: { display_name: client.full_name },
  });
  if (inviteError || !invited.user) {
    const exists = /already (been )?registered|already exists/i.test(inviteError?.message ?? '');
    // Never bind an existing account by matching email; that needs an explicit operator decision.
    return reply(exists ? 409 : 502, {
      error: exists ? 'An account with this email already exists and is not linked to this client.' : 'The invitation could not be sent',
    });
  }

  if (client.auth_user_id) {
    if (client.auth_user_id !== invited.user.id) return reply(409, { error: 'Client is linked to a different account' });
    console.log(JSON.stringify({ action: 'client_invite_resent', client_id: client.id, actor: userData.user.id }));
    return reply(200, { status: 'resent' });
  }

  // Bind only if still unbound, so two concurrent invitations cannot both claim the record.
  const { data: bound, error: bindError } = await admin
    .from('clients')
    .update({ auth_user_id: invited.user.id, status: 'invited' })
    .eq('id', client.id)
    .is('auth_user_id', null)
    .select('id');
  if (bindError || !bound?.length) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return reply(409, { error: 'Client was linked by another request; no new account was kept' });
  }
  // Operational log without personal data (NFR-08). A durable audit table arrives with M3/M8.
  console.log(JSON.stringify({ action: 'client_invited', client_id: client.id, actor: userData.user.id }));
  return reply(200, { status: 'invited' });
});
