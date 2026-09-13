-- ============================================================
-- Seed admin user: Martinmontoya081@gmail.com / 12345
-- Fixes: admin user not created in auth.users + missing profile
-- ============================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_admin_email TEXT := 'martinmontoya081@gmail.com';
    v_admin_email_original TEXT := 'Martinmontoya081@gmail.com';
BEGIN
    -- Step 1: Check if admin already exists in auth.users (case-insensitive)
    SELECT id INTO v_admin_id
    FROM auth.users
    WHERE lower(email) = lower(v_admin_email)
    LIMIT 1;

    -- Step 2: If not found, create the auth user
    IF v_admin_id IS NULL THEN
        v_admin_id := gen_random_uuid();

        INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            raw_user_meta_data,
            raw_app_meta_data,
            is_sso_user,
            is_anonymous,
            confirmation_token,
            confirmation_sent_at,
            recovery_token,
            recovery_sent_at,
            email_change_token_new,
            email_change,
            email_change_sent_at,
            email_change_token_current,
            email_change_confirm_status,
            reauthentication_token,
            reauthentication_sent_at,
            phone,
            phone_change,
            phone_change_token,
            phone_change_sent_at
        ) VALUES (
            v_admin_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            v_admin_email_original,
            crypt('12345', gen_salt('bf', 10)),
            now(),
            now(),
            now(),
            jsonb_build_object(
                'full_name', 'Martin Montoya',
                'role', 'admin',
                'must_reset_password', true
            ),
            jsonb_build_object(
                'provider', 'email',
                'providers', ARRAY['email']::TEXT[]
            ),
            false,
            false,
            '', null, '', null, '', '', null, '', 0, '', null,
            null, '', '', null
        );

        RAISE NOTICE 'Admin user created in auth.users with id: %', v_admin_id;
    ELSE
        -- Step 2b: User exists — update password and metadata to ensure correct values
        UPDATE auth.users
        SET
            encrypted_password = crypt('12345', gen_salt('bf', 10)),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_user_meta_data = jsonb_build_object(
                'full_name', 'Martin Montoya',
                'role', 'admin',
                'must_reset_password', true
            ),
            updated_at = now()
        WHERE id = v_admin_id;

        RAISE NOTICE 'Admin user already exists, password reset to 12345. id: %', v_admin_id;
    END IF;

    -- Step 3: Ensure auth.identities entry exists (required for email/password login)
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_admin_id,
        jsonb_build_object('sub', v_admin_id::TEXT, 'email', v_admin_email_original),
        'email',
        v_admin_email_original,
        now(),
        now(),
        now()
    )
    ON CONFLICT (provider, provider_id) DO UPDATE
        SET
            user_id = v_admin_id,
            identity_data = jsonb_build_object('sub', v_admin_id::TEXT, 'email', v_admin_email_original),
            updated_at = now();

    -- Step 4: Ensure profile row exists with role = admin
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        is_active,
        must_reset_password,
        created_at,
        updated_at
    ) VALUES (
        v_admin_id,
        v_admin_email_original,
        'Martin Montoya',
        'admin'::public.user_role,
        true,
        true,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
        SET
            role = 'admin'::public.user_role,
            is_active = true,
            must_reset_password = true,
            full_name = 'Martin Montoya',
            email = v_admin_email_original,
            updated_at = now();

    RAISE NOTICE 'Admin profile ensured with role=admin for id: %', v_admin_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Admin seed error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END $$;
