-- ============================================================
-- FIX: "permission denied for table profiles" (error 42501)
-- Root cause: is_admin() and is_active_user() both query the
-- profiles table. When these functions are called from RLS
-- policies on profiles (or on tables whose policies call them),
-- PostgreSQL enters a recursive policy evaluation loop and
-- returns "permission denied" before any row is returned.
--
-- Solution:
--   1. Replace is_admin() to read from auth.users metadata only
--   2. Replace is_active_user() to read from auth.users metadata only
--   3. Re-create all RLS policies that reference these functions
--      so they pick up the new non-recursive implementations
-- ============================================================

-- -------------------------------------------------------
-- 1. Non-recursive is_admin() — reads auth.users metadata
--    Works for ALL tables including profiles itself
-- -------------------------------------------------------
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

-- -------------------------------------------------------
-- 2. Non-recursive is_active_user() — reads auth.users metadata
--    Previously queried profiles table causing recursion on
--    vehicles/inspections/materials policies
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (
        -- Active if no explicit is_active=false in metadata
        -- (defaults to true for all authenticated users)
        (raw_user_meta_data->>'is_active') IS DISTINCT FROM 'false'
    )
)
$$;

-- -------------------------------------------------------
-- 3. Re-create profiles RLS policies (non-recursive)
--    SELECT: direct id check OR admin via auth metadata
-- -------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

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

-- -------------------------------------------------------
-- 4. Re-create vehicles RLS policies
--    (is_active_user() now reads auth.users — no recursion)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "vehicles_select_all" ON public.vehicles;
CREATE POLICY "vehicles_select_all"
ON public.vehicles FOR SELECT
TO authenticated
USING (public.is_active_user());

DROP POLICY IF EXISTS "vehicles_insert_admin" ON public.vehicles;
CREATE POLICY "vehicles_insert_admin"
ON public.vehicles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vehicles_update_admin" ON public.vehicles;
CREATE POLICY "vehicles_update_admin"
ON public.vehicles FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vehicles_delete_admin" ON public.vehicles;
CREATE POLICY "vehicles_delete_admin"
ON public.vehicles FOR DELETE
TO authenticated
USING (public.is_admin());

-- -------------------------------------------------------
-- 5. Re-create inspections RLS policies
-- -------------------------------------------------------
DROP POLICY IF EXISTS "inspections_select_all" ON public.inspections;
CREATE POLICY "inspections_select_all"
ON public.inspections FOR SELECT
TO authenticated
USING (public.is_active_user());

DROP POLICY IF EXISTS "inspections_insert_active" ON public.inspections;
CREATE POLICY "inspections_insert_active"
ON public.inspections FOR INSERT
TO authenticated
WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "inspections_update_own_or_admin" ON public.inspections;
CREATE POLICY "inspections_update_own_or_admin"
ON public.inspections FOR UPDATE
TO authenticated
USING (inspector_id = auth.uid() OR public.is_admin())
WITH CHECK (inspector_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "inspections_delete_admin" ON public.inspections;
CREATE POLICY "inspections_delete_admin"
ON public.inspections FOR DELETE
TO authenticated
USING (public.is_admin());

-- -------------------------------------------------------
-- 6. Re-create materials RLS policies
-- -------------------------------------------------------
DROP POLICY IF EXISTS "materials_select_all" ON public.materials;
CREATE POLICY "materials_select_all"
ON public.materials FOR SELECT
TO authenticated
USING (public.is_active_user());

DROP POLICY IF EXISTS "materials_insert_admin" ON public.materials;
CREATE POLICY "materials_insert_admin"
ON public.materials FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "materials_update_admin" ON public.materials;
CREATE POLICY "materials_update_admin"
ON public.materials FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "materials_delete_admin" ON public.materials;
CREATE POLICY "materials_delete_admin"
ON public.materials FOR DELETE
TO authenticated
USING (public.is_admin());

-- -------------------------------------------------------
-- 7. Sync profiles.role → auth.users metadata on UPDATE
--    This ensures is_admin() stays accurate when an admin
--    changes a user's role via the profiles table.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_auth_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only sync when role or is_active changes
    IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
        UPDATE auth.users
        SET
            raw_user_meta_data = raw_user_meta_data
                || jsonb_build_object('role', NEW.role::TEXT, 'is_active', NEW.is_active),
            raw_app_meta_data  = raw_app_meta_data
                || jsonb_build_object('role', NEW.role::TEXT, 'is_active', NEW.is_active)
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_role_trigger ON public.profiles;
CREATE TRIGGER sync_profile_role_trigger
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_role_to_auth_metadata();

-- -------------------------------------------------------
-- 8. Back-fill existing profiles → auth.users metadata
--    Run once so current users have correct metadata
-- -------------------------------------------------------
DO $$
BEGIN
    UPDATE auth.users au
    SET
        raw_user_meta_data = COALESCE(au.raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object(
                'role',      p.role::TEXT,
                'is_active', p.is_active
            ),
        raw_app_meta_data  = COALESCE(au.raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object(
                'role',      p.role::TEXT,
                'is_active', p.is_active
            )
    FROM public.profiles p
    WHERE au.id = p.id;

    RAISE NOTICE 'Back-filled role/is_active metadata for % users', (SELECT COUNT(*) FROM public.profiles);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Back-fill failed (non-fatal): %', SQLERRM;
END $$;
