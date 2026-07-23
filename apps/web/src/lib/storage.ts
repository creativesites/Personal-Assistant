/**
 * Supabase Storage helpers.
 *
 * Buckets (all public, 50MB limit): brands · chat-media · products · knowledge-base · documents · assets
 *
 * NOTE: Public buckets need an INSERT policy to allow anonymous uploads.
 * In the Supabase dashboard add: Storage → <bucket> → New policy → "Allow anonymous uploads":
 *   CREATE POLICY "Allow anon uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = '<bucket>');
 */

import { supabase } from './supabase'

export type StorageBucket = 'brands' | 'chat-media' | 'products' | 'knowledge-base' | 'documents' | 'assets'

export interface UploadResult {
  url: string
  path: string
}

/** Upload a file to Supabase storage and return the public URL. */
export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  file: File,
): Promise<UploadResult> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type,
  })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

/** Build a unique storage path using timestamp to avoid collisions. */
export function buildPath(prefix: string, filename: string): string {
  const ts = Date.now()
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${prefix}/${ts}-${safe}`
}

/** Upload a brand logo and return the public URL with cache-busting timestamp. */
export async function uploadBrandLogo(profileId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${profileId}/logo-${Date.now()}.${ext}`
  const { url } = await uploadFile('brands', path, file)
  return `${url}?t=${Date.now()}`
}

/** Upload a product image and return the public URL. */
export async function uploadProductImage(productId: string, file: File): Promise<string> {
  const path = buildPath(`products/${productId}`, file.name)
  const { url } = await uploadFile('products', path, file)
  return url
}

/** Upload a knowledge base document and return the public URL. */
export async function uploadKBFile(userId: string, file: File): Promise<string> {
  const path = buildPath(`kb/${userId}`, file.name)
  const { url } = await uploadFile('knowledge-base', path, file)
  return url
}
