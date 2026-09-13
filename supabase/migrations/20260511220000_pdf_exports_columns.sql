-- ============================================================
-- PDF EXPORTS: Add filename and metadata columns
-- ============================================================

-- Add filename and notes columns to pdf_exports if not already present
ALTER TABLE public.pdf_exports
    ADD COLUMN IF NOT EXISTS filename TEXT,
    ADD COLUMN IF NOT EXISTS inspection_placa TEXT,
    ADD COLUMN IF NOT EXISTS inspection_data JSONB;

-- Index for quick lookup by inspection placa
CREATE INDEX IF NOT EXISTS idx_pdf_exports_placa ON public.pdf_exports(inspection_placa);
