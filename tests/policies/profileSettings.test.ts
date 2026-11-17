/** FR-01 / NFR-01: real Storage requests and profile writes with ordinary user tokens. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function localConfig() {
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_PUBLISHABLE_KEY) {
    return { url: process.env.SUPABASE_TEST_URL, key: process.env.SUPABASE_TEST_PUBLISHABLE_KEY };
  }
  const config = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (key: string) => new RegExp(`^${key}="?([^"\\n]+)"?`, 'm').exec(config)?.[1] ?? '';
  return { url: get('API_URL'), key: get('PUBLISHABLE_KEY') || get('ANON_KEY') };
}

const { url, key } = localConfig();
const bucket = 'profile-photos';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=', 'base64');

async function signIn(email: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'local-dev-only-password' });
  if (error) throw error;
  return { client, id: data.user!.id };
}

async function roundTrip(client: SupabaseClient, id: string, other: SupabaseClient) {
  const path = `${id}/${crypto.randomUUID()}.png`;
  const original = await client.from('profiles').select('display_name, date_of_birth, phone_number, avatar_path').eq('auth_user_id', id).single();
  expect(original.error).toBeNull();
  try {
    const upload = await client.storage.from(bucket).upload(path, png, { contentType: 'image/png' });
    expect(upload.error).toBeNull();
    const save = await client.from('profiles').update({ display_name: 'Preferred test name', date_of_birth: '2000-02-29', phone_number: '+1 416 555 0101', avatar_path: path }).eq('auth_user_id', id).select('display_name, date_of_birth, phone_number, avatar_path').single();
    expect(save.error).toBeNull();
    expect(save.data).toEqual({ display_name: 'Preferred test name', date_of_birth: '2000-02-29', phone_number: '+1 416 555 0101', avatar_path: path });
    expect((await client.storage.from(bucket).download(path)).error).toBeNull();
    expect((await client.storage.from(bucket).createSignedUrl(path, 60)).error).toBeNull();
    expect((await other.storage.from(bucket).download(path)).error).not.toBeNull();
    expect((await other.storage.from(bucket).createSignedUrl(path, 60)).error).not.toBeNull();
    await other.storage.from(bucket).remove([path]);
    expect((await client.storage.from(bucket).download(path)).error).toBeNull();
    const cleared = await client.from('profiles').update({ avatar_path: null, date_of_birth: null, phone_number: null }).eq('auth_user_id', id).select('avatar_path, date_of_birth, phone_number').single();
    expect(cleared.data).toEqual({ avatar_path: null, date_of_birth: null, phone_number: null });
    expect((await client.storage.from(bucket).remove([path])).error).toBeNull();
    expect((await client.storage.from(bucket).download(path)).error).not.toBeNull();
    const foreignUpload = await other.storage.from(bucket).upload(`${id}/${crypto.randomUUID()}.png`, png, { contentType: 'image/png' });
    expect(foreignUpload.error).not.toBeNull();
    const svgUpload = await client.storage.from(bucket).upload(`${id}/${crypto.randomUUID()}.png`, '<svg/>', { contentType: 'image/svg+xml' });
    expect(svgUpload.error).not.toBeNull();
  } finally {
    if (original.data) await client.from('profiles').update(original.data).eq('auth_user_id', id);
    await client.storage.from(bucket).remove([path]);
  }
}

describe('profile settings API', () => {
  it('client can save, upload, read and remove; another client cannot access the photo', async () => {
    const [a, b] = await Promise.all([signIn('maya.chen@example.test'), signIn('daniel.okafor@example.test')]);
    await roundTrip(a.client, a.id, b.client);
  });
  it('coach can save, upload, read and remove; another coach cannot access the photo', async () => {
    const [a, b] = await Promise.all([signIn('priya.nair@example.test'), signIn('liam.oconnor@example.test')]);
    await roundTrip(a.client, a.id, b.client);
  });
});
