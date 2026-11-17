import { requireSupabase } from '@/lib/supabase';
import { profileSchema, validatePhoto } from './validation';

export const PROFILE_PHOTOS_BUCKET = 'profile-photos';
export async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await requireSupabase().storage.from(PROFILE_PHOTOS_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveProfile(userId: string, input: { displayName: string; dateOfBirth: string; phoneNumber: string }) {
  const values = profileSchema.parse(input);
  const { data, error } = await requireSupabase().from('profiles').update({
    display_name: values.displayName,
    date_of_birth: values.dateOfBirth || null,
    phone_number: values.phoneNumber || null,
  }).eq('auth_user_id', userId).select('auth_user_id').single();
  if (error) throw error;
  return data;
}

/** New paths avoid cached replacements. Keep the previous photo until its replacement is saved. */
export async function changePhoto(userId: string, previousPath: string | null, file: File | null) {
  const supabase = requireSupabase();
  const storage = supabase.storage.from(PROFILE_PHOTOS_BUCKET);
  let path: string | null = null;
  if (file) {
    validatePhoto(file);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
  }
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('auth_user_id', userId).select('auth_user_id').single();
  if (error) {
    if (path) await storage.remove([path]);
    throw error;
  }
  if (previousPath) {
    const cleanup = await storage.remove([previousPath]);
    if (cleanup.error) return 'Your profile picture was updated, but the previous file could not be deleted from storage.';
  }
  return null;
}
