import { createClient } from '@/lib/supabase/client';
import { getPendingMediaItems, updateMediaItem, type MediaUploadItem } from '@/lib/offlineDB';

// ─── Upload a single media item to Supabase Storage ───────────────────────

async function uploadMediaItem(
    item: MediaUploadItem
): Promise<{ success: boolean; url?: string; storagePath?: string; error?: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // The metadata row has an FK to inspections. Do not upload an orphaned
    // object while the offline inspection INSERT is still waiting in its queue.
    const { data: inspection, error: inspectionError } = await supabase
        .from('inspections')
        .select('id')
        .eq('id', item.inspectionId)
        .maybeSingle();
    if (inspectionError || !inspection) {
      return {
        success: false,
        error: inspectionError?.message ?? 'La inspección aún no está sincronizada',
      };
    }

    // Deduplicate by checksum if available
    if (item.checksum) {
      const { data: existing } = await supabase
          .from('media_uploads')
          .select('storage_path, storage_bucket')
          .eq('inspection_id', item.inspectionId)
          .eq('field_path', item.fieldPath)
          .eq('checksum', item.checksum)
          .eq('status', 'uploaded')
          .maybeSingle();
      if (existing) {
        const bucket = existing.storage_bucket || 'inspection-photos';
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(existing.storage_path);
        return { success: true, url: urlData.publicUrl, storagePath: existing.storage_path };
      }
    }

    // Convert base64 data URL to Blob
    const response = await fetch(item.dataUrl);
    const blob = await response.blob();

    // Validate size (max 10MB for photos, 200MB for videos)
    const maxSize = item.mimeType.startsWith('video/') ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    if (blob.size > maxSize) {
      return { success: false, error: `File too large: ${Math.round(blob.size / 1024 / 1024)}MB` };
    }

    const ext = item.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const isVideo = item.mimeType.startsWith('video/');
    const bucket = 'inspection-photos';
    const folder = isVideo ? 'videos' : 'photos';

    // Ruta determinística: un único archivo por inspección + campo.
    // Sin timestamp: cada reintento o foto nueva SOBRESCRIBE la anterior
    // en vez de dejar objetos huérfanos en el bucket.
    const storagePath = `inspections/${item.inspectionId}/${folder}/${item.fieldPath}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, blob, {
      contentType: item.mimeType,
      upsert: true, // sobrescribe si ya existe una foto/video de ese campo
    });

    if (uploadError) return { success: false, error: uploadError.message };

    // Upsert de metadata: si ya existía un registro para (inspection_id, field_path),
    // se actualiza en vez de duplicarse.
    const { error: metadataError } = await supabase.from('media_uploads').upsert(
        {
          inspection_id: item.inspectionId,
          uploaded_by: user.id,
          storage_path: storagePath,
          storage_bucket: bucket,
          mime_type: item.mimeType,
          file_size_bytes: blob.size,
          field_path: item.fieldPath,
          checksum: item.checksum ?? null,
          status: 'uploaded',
        },
        { onConflict: 'inspection_id, field_path' }
    );

    if (metadataError) {
      return { success: false, error: metadataError.message };
    }

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