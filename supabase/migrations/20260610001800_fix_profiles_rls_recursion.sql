-- ============================================================
-- FIX: Infinite recursion in profiles RLS policies
-- Root cause: is_admin() queries profiles table, which triggers
-- the same SELECT policy, causing "permission denied" loop.
-- Solution:
--   1. Replace is_admin() to read from auth.users metadata (no recursion)
--   2. Replace profiles SELECT policy with direct auth.uid() = id check
--   3. Keep is_admin() for non-profiles tables (vehicles, inspections, materials)
-- ============================================================

-- 1. Replace is_admin() — now reads from auth.users metadata, NOT profiles
--    This breaks the recursion for ALL tables that use is_admin() in their policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (
        raw_user_meta_data->>'role' = 'admin'
        OR raw_app_meta_data->>'role' = 'admin'
    )
)
$$;

-- 2. Replace profiles SELECT policy — use direct id check, no function call
--    This prevents any recursion on the profiles table itself.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

-- 3. Also fix profiles UPDATE/INSERT/DELETE to use the new non-recursive is_admin()
--    (They already call is_admin(), which is now fixed above — no policy changes needed)
--    But re-create them to ensure they pick up the new function behavior cleanly.

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());
