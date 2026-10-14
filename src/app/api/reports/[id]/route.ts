import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
// Type-only import: erased at compile time, so it does not pull
// @react-pdf/renderer/pdfkit into this route's module graph. The renderer itself
// is loaded lazily inside GET below.
import type { InspectionData } from '@/lib/pdf/inspection-document';

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Skip auth check in preview mode
    const isPreview =  process.env.PREVIEW_SKIP_AUTH === 'true' &&  process.env.NODE_ENV !== 'production';

    const supabase = await createClient();

    if (!isPreview) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not found');
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY missing' },
        { status: 500 }
      );
    }

    if (!supabaseUrl) {
      console.error('NEXT_PUBLIC_SUPABASE_URL not found');
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_SUPABASE_URL missing' },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminSupabase: ReturnType<typeof createAdminClient<any, 'public', any>> = createAdminClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch through the caller's session first so RLS authorizes the row.
    // The service-role client below is limited to signing already-authorized media.
    const inspectionQuery = isPreview ? adminSupabase : supabase;
    const { data: inspection, error: inspError } = await inspectionQuery
      .from('inspections')
      .select('*')
      .eq('id', id)
      .single();

    if (inspError || !inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // Resolve signed URLs for all images in inspection data
    const inspectionData = inspection.data as Record<string, unknown>;
    const signedData = await resolveSignedUrls(adminSupabase, inspectionData);

    const inspectionWithSignedUrls: InspectionData = {
      ...inspection,
      data: signedData,
    };

    // Check if client wants JSON (for debugging) or PDF
    const accept = request.headers.get('accept') || '';
    if (accept.includes('application/json')) {
      return NextResponse.json({ inspection: inspectionWithSignedUrls });
    }

    // Generate PDF buffer. The renderer is imported here rather than at module
    // scope so pdfkit is only initialized when a PDF is actually requested —
    // every other route shares this serverless function.
    let pdfBuffer: Buffer;
    try {
      const { renderInspectionPdf } = await import('@/lib/pdf/inspection-document');
      pdfBuffer = await renderInspectionPdf(inspectionWithSignedUrls);
    } catch (pdfErr) {
      console.error('PDF render failed for inspection', id, pdfErr);
      return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
    }

    const placa = ((signedData as Record<string, unknown>)?.placa as string) || id;
    const filename = `BT-inspeccion-${placa.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Signed URL Resolution ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabaseClient = ReturnType<typeof createAdminClient<any, 'public', any>>;

async function resolveSignedUrls(
  adminSupabase: AdminSupabaseClient,
  data: unknown
): Promise<unknown> {
  if (Array.isArray(data)) {
    return Promise.all(data.map((item) => resolveSignedUrls(adminSupabase, item)));
  }

  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (
        (key === 'fotos' || key === 'imagen' || key === 'inspectorSignature' || key === 'clienteSignature') &&
        value
      ) {
        if (Array.isArray(value)) {
          result[key] = await Promise.all(
            value.map((url) => getSignedUrl(adminSupabase, url as string))
          );
        } else if (typeof value === 'string') {
          result[key] = await getSignedUrl(adminSupabase, value);
        } else {
          result[key] = value;
        }
      } else {
        result[key] = await resolveSignedUrls(adminSupabase, value);
      }
    }
    return result;
  }

  return data;
}

async function getSignedUrl(
  adminSupabase: AdminSupabaseClient,
  url: string
): Promise<string> {
  if (!url) return url;

  // data URLs and blob URLs pass through as-is
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Extract bucket and path from Supabase Storage URL
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
  if (!storageMatch) return url;

  const bucket = storageMatch[1];
  const path = storageMatch[2].split('?')[0];

  try {
    const { data, error } = await adminSupabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600); // 1 hour

    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  } catch {
    return url;
  }
}
