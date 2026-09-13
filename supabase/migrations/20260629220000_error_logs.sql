-- Error Logs table — admin-only visibility
-- Stores all application errors captured by the global error logger

CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level TEXT NOT NULL DEFAULT 'error',          -- 'error' | 'warn' | 'info'
    message TEXT NOT NULL,
    stack TEXT,
    context TEXT,                                  -- page / component / action
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON public.error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
DROP POLICY IF EXISTS "admin_read_error_logs" ON public.error_logs;
CREATE POLICY "admin_read_error_logs"
ON public.error_logs
FOR SELECT
TO authenticated
USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Any authenticated user can insert (so errors from all users are captured)
DROP POLICY IF EXISTS "authenticated_insert_error_logs" ON public.error_logs;
CREATE POLICY "authenticated_insert_error_logs"
ON public.error_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Anon users can also insert (capture pre-login errors)
DROP POLICY IF EXISTS "anon_insert_error_logs" ON public.error_logs;
CREATE POLICY "anon_insert_error_logs"
ON public.error_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- Admins can delete logs
DROP POLICY IF EXISTS "admin_delete_error_logs" ON public.error_logs;
CREATE POLICY "admin_delete_error_logs"
ON public.error_logs
FOR DELETE
TO authenticated
USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
