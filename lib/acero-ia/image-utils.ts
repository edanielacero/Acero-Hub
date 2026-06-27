import { type SupabaseClient } from '@supabase/supabase-js'
import { calculateImageCost } from './cost-calculator'
import { type ImageSize, type ImageQuality } from './models'

export function generateStoragePath(userId: string, imageId: string): string {
  return `${userId}/${imageId}.png`
}

export async function uploadImageToStorage(
  supabase: SupabaseClient,
  storagePath: string,
  imageData: Buffer
): Promise<string> {
  const { error } = await supabase.storage
    .from('acero-ia-images')
    .upload(storagePath, imageData, {
      contentType: 'image/png',
      upsert: false,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return storagePath
}

export function getSignedUrl(supabase: SupabaseClient, storagePath: string): Promise<string> {
  return supabase.storage
    .from('acero-ia-images')
    .createSignedUrl(storagePath, 3600)
    .then(({ data, error }) => {
      if (error || !data) throw new Error('Failed to create signed URL')
      return data.signedUrl
    })
}

export function getImageCost(size: ImageSize, quality: ImageQuality): number {
  return calculateImageCost(size, quality)
}
