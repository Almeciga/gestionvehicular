import { createClient } from '@/lib/supabase/client';
import { getPendingMediaItems, updateMediaItem, type MediaUploadItem } from '@/lib/offlineDB';


// ─── Upload a single media item to Supabase Storage ───────────────────────

async function uploadMediaItem(item: MediaUploadItem): Promise<{ success: boolean; url?: string; storagePath?: string; error?: string }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Convert base64 data URL to Blob
    const response = await fetch(item.dataUrl);
    const blob = await response.blob();

    // Validate size (max 10MB for photos, 200MB for videos)
    const maxSize = item.mimeType.startsWith('video/') ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    if (blob.size > maxSize) {
      return { success: false, error: `File too large: ${Math.round(blob.size / 1024 / 1024)}MB` };
    }

    // Use the "uploads" bucket as required
    const ext = item.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const isVideo = item.mimeType.startsWith('video/');
    const bucket = 'uploads';
    const folder = isVideo ? 'videos' : 'photos';
    // Path: inspections/{inspectionId}/{photos|videos}/{fileName}-{timestamp}.{ext}
    const storagePath = `inspections/${item.inspectionId}/${folder}/${item.fileName}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, blob, {
        contentType: item.mimeType,
        upsert: false,
      });

    if (uploadError) return { success: false, error: uploadError.message };

    // Return the storage path (key) — signed URLs are generated server-side for PDF
    // Also return the public URL for immediate display if bucket allows it
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return {
      success: true,
      url: urlData.publicUrl,
      storagePath,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

// ─── Background Upload Processor ─────────────────────────────────────────

let isProcessing = false;

export async function processMediaQueue(): Promise<{ uploaded: number; failed: number }> {
  if (isProcessing) return { uploaded: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { uploaded: 0, failed: 0 };

  isProcessing = true;
  let uploaded = 0;
  let failed = 0;

  try {
    const pending = await getPendingMediaItems();
    const eligible = pending.filter((i) => i.retries < i.maxRetries);

    for (const item of eligible) {
      await updateMediaItem(item.id, { status: 'uploading', lastAttempt: Date.now() });

      const result = await uploadMediaItem(item);

      if (result.success && result.url) {
        await updateMediaItem(item.id, {
          status: 'done',
          uploadedUrl: result.url,
          // Store the storage path (key) for server-side signed URL generation
          ...(result.storagePath ? { storagePath: result.storagePath } : {}),
        });
        uploaded++;
      } else {
        const newRetries = item.retries + 1;
        const newStatus = newRetries >= item.maxRetries ? 'failed' : 'retrying';
        await updateMediaItem(item.id, {
          status: newStatus,
          retries: newRetries,
          errorMessage: result.error,
        });
        failed++;
      }
    }
  } finally {
    isProcessing = false;
  }

  return { uploaded, failed };
}

export { type MediaUploadItem };
