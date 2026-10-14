import { enqueueMedia } from '@/lib/offlineDB';
import { processMediaQueue } from '@/lib/mediaUploadQueue';

const DATA_URL = /^data:(image\/[^;,]+|video\/[^;,]+)(?:;charset=[^;,]+)?;base64,/i;

/** Queues every inline image/video in an inspection for durable Storage upload. */
export async function queueInspectionMedia(
  inspectionId: string,
  data: Record<string, unknown>
): Promise<void> {
  const seen = new Set<string>();

  const visit = async (value: unknown, fieldPath: string): Promise<void> => {
    if (typeof value === 'string') {
      const match = DATA_URL.exec(value);
      if (!match || seen.has(value)) return;
      seen.add(value);
      const mimeType = match[1].toLowerCase();
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
      await enqueueMedia({
        inspectionId,
        fieldPath,
        dataUrl: value,
        mimeType,
        fileName: fieldPath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'media',
        fileSize: Math.ceil((value.length - value.indexOf(',') - 1) * 0.75),
      });
      return;
    }
    if (Array.isArray(value)) {
      await Promise.all(value.map((item, index) => visit(item, `${fieldPath}[${index}]`)));
      return;
    }
    if (value && typeof value === 'object') {
      await Promise.all(
        Object.entries(value).map(([key, item]) =>
          visit(item, fieldPath ? `${fieldPath}.${key}` : key)
        )
      );
    }
  };

  await visit(data, '');
  if (typeof navigator !== 'undefined' && navigator.onLine) await processMediaQueue();
}
