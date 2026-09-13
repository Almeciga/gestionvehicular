import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCorsHeaders, corsOptionsResponse } from '@/lib/cors';

/**
 * POST /api/admin/seed-admin
 * Creates the test admin user via Supabase Admin API (auth.admin.createUser).
 * Uses hardcoded dev credentials — never call this in production.
 *
 * Requires ENABLE_DEV_ADMIN_SEED=true plus DEV_SEED_ADMIN_EMAIL and
 * DEV_SEED_ADMIN_PASSWORD. It must never be enabled in production.
 */

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return corsOptionsResponse(origin);
}

export async function POST(_request: NextRequest) {
  const origin = _request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Security: this endpoint must not be accessible in production
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_ADMIN_SEED !== 'true') {
    return new Response('Not found', { status: 404 });
  }

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const adminEmail = process.env.DEV_SEED_ADMIN_EMAIL;
    const adminPassword = process.env.DEV_SEED_ADMIN_PASSWORD;
    const adminFullName = process.env.DEV_SEED_ADMIN_FULL_NAME ?? 'Development Admin';

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: 'DEV_SEED_ADMIN_EMAIL and DEV_SEED_ADMIN_PASSWORD must be configured.' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!serviceRoleKey || serviceRoleKey === 'your-supabase-service-role-key-here') {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to your environment variables.' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_SUPABASE_URL is not configured.' },
        { status: 500, headers: corsHeaders }
      );
    }

    const adminSupabase = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1: Check if user already exists
    const { data: existingUsers, error: listError } = await adminSupabase.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json(
        { error: `Failed to list users: ${listError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase()
    );

    let adminUserId: string;
    let action: 'created' | 'updated';

    if (existingUser) {
      // User exists — reset password and ensure metadata is correct
      adminUserId = existingUser.id;
      action = 'updated';

      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(adminUserId, {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          role: 'admin',
          must_reset_password: false,
        },
        app_metadata: {
          role: 'admin',
          provider: 'email',
          providers: ['email'],
        },
      });

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update existing user: ${updateError.message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    } else {
      // User does not exist — create via Admin API (no crypt() needed)
      const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          role: 'admin',
          must_reset_password: false,
        },
        app_metadata: {
          role: 'admin',
          provider: 'email',
          providers: ['email'],
        },
      });

      if (createError) {
        return NextResponse.json(
          { error: `Failed to create admin user: ${createError.message}` },
          { status: 500, headers: corsHeaders }
        );
      }

      adminUserId = newUser.user!.id;
      action = 'created';

      // Explicitly sync app_metadata after creation to ensure raw_app_meta_data is set
      await adminSupabase.auth.admin.updateUserById(adminUserId, {
        app_metadata: {
          role: 'admin',
          provider: 'email',
          providers: ['email'],
        },
      });
    }

    // Step 2: Upsert the profile with role = admin
    const { error: profileError } = await adminSupabase.from('profiles').upsert(
      {
        id: adminUserId,
        email: adminEmail,
        full_name: adminFullName,
        role: 'admin',
        is_active: true,
        must_reset_password: false,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      return NextResponse.json(
        { error: `User ${action} but profile upsert failed: ${profileError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        action,
        message:
          action === 'updated' ?'Test admin already existed — password reset and metadata synced.' :'Test admin created successfully via auth.admin.createUser().',
        userId: adminUserId,
        email: adminEmail,
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500, headers: corsHeaders }
    );
  }
}
