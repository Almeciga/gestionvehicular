import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCorsHeaders, corsOptionsResponse } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return corsOptionsResponse(origin);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Verify the caller is an authenticated admin
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check admin role from user_metadata (no DB query needed)
    const role_caller = user.user_metadata?.role;
    const isActive = user.user_metadata?.is_active ?? true;

    if (role_caller !== 'admin' || !isActive) {
      return NextResponse.json(
        { error: 'Sin permisos: se requiere rol admin' },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { email, password, full_name, role } = body;

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Correo inválido' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener mínimo 8 caracteres' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate role
    const allowedRoles = ['admin', 'inspector', 'comercial'];

    if (role && !allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Environment variables
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    console.log({
      urlLoaded: !!supabaseUrl,
      anonLoaded: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceLoaded: !!serviceRoleKey,
    });

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY missing' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_SUPABASE_URL missing' },
        { status: 500, headers: corsHeaders }
      );
    }

    const adminSupabase = createAdminClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const assignedRole = role || 'inspector';

    // Create user — metadata is set here, no duplicate updateUserById needed
    const { data: newUser, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role: assignedRole,
          must_reset_password: true,
        },
        app_metadata: {
          role: assignedRole,
        },
      });

    if (createError) {
      console.error('Create user error:', createError);

      return NextResponse.json(
        { error: createError.message },
        { status: 400, headers: corsHeaders }
      );
    }

    // Upsert profile — handles the case where the trigger hasn't run yet
    if (newUser.user) {
      const profilePayload = {
        id: newUser.user.id,
        email,
        full_name,
        role: assignedRole,
        must_reset_password: true,
        is_active: true,
      };

      const { data: profileExists } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('id', newUser.user.id)
        .maybeSingle();

      if (profileExists) {
        const { error: profileUpdateError } = await adminSupabase
          .from('profiles')
          .update({
            full_name,
            role: assignedRole,
            must_reset_password: true,
          })
          .eq('id', newUser.user.id);

        if (profileUpdateError) {
          console.error('Profile update error:', profileUpdateError.message);
        }
      } else {
        const { error: profileInsertError } = await adminSupabase
          .from('profiles')
          .insert(profilePayload);

        if (profileInsertError) {
          console.error('Profile insert error:', profileInsertError.message);
        }
      }

      console.log('[create-user] profile upserted for:', newUser.user.id);
    }

    return NextResponse.json({
      success: true,
      userId: newUser.user?.id,
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error';

    console.error('Create user error:', message);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}