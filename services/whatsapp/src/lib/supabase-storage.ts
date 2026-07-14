import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Reuses the 'chat-media' bucket already reserved for this purpose in
// apps/web/src/lib/storage.ts (StorageBucket union) but never wired up.
// Requires the service-role key (not the anon key) since this is a trusted
// backend service writing arbitrary contacts' media, not a user's own upload.
const CHAT_MEDIA_BUCKET = 'chat-media';

let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.warn('[supabase-storage] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — falling back to local media disk');
    client = null;
    return client;
  }

  client = createClient(url, serviceRoleKey);
  return client;
}

/**
 * Upload a downloaded WhatsApp media buffer to Supabase Storage and return its
 * public URL. Returns null if Supabase isn't configured or the upload fails —
 * callers should fall back to writing the buffer to local disk.
 */
export async function uploadChatMedia(
  userId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const path = `${userId}/${fileName}`;
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    console.error('[supabase-storage] upload failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
