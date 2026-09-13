'use client';

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { initialDataDownload, incrementalSync } from '@/lib/syncService';
import { ProfilesRepo } from '@/lib/repositories';


export type UserRole = 'admin' | 'inspector' | 'comercial';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  is_active: boolean;
  must_reset_password: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAdmin: boolean;
  isInspector: boolean;
  isComercial: boolean;
  loading: boolean;
  profileLoading: boolean;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<unknown>;
  signIn: (email: string, password: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  getCurrentUser: () => Promise<User | null>;
  isEmailVerified: () => boolean;
  getUserProfile: () => Promise<UserProfile | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Singleton client — outside the component so it's never recreated on re-render
const supabase = createClient();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

/**
 * Build a UserProfile from JWT user_metadata — NO database query needed.
 * Falls back to IndexedDB profile if metadata is incomplete.
 */
function profileFromJWT(user: User): UserProfile {
  const meta = user.user_metadata ?? {};
  const appMeta = (user as unknown as { app_metadata?: Record<string, unknown> }).app_metadata ?? {};
  const role = (meta.role || appMeta.role || 'inspector') as UserRole;
  const isActive = meta.is_active !== undefined ? Boolean(meta.is_active) : true;

  return {
    id: user.id,
    email: user.email ?? '',
    role,
    full_name: (meta.full_name as string) || (user.email?.split('@')[0] ?? ''),
    is_active: isActive,
    must_reset_password: Boolean(meta.must_reset_password),
    created_at: user.created_at ?? new Date().toISOString(),
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const initialSyncDoneRef = useRef(false);
  const syncInProgressRef = useRef(false);

  /**
   * Get profile from JWT metadata first (instant, no DB query).
   * Then enrich from IndexedDB if available.
   */
  const resolveProfile = async (u: User): Promise<UserProfile> => {
    // Immediately build from JWT — zero latency
    const jwtProfile = profileFromJWT(u);

    // Enrich from IndexedDB in background (non-blocking)
    try {
      const dbProfile = await ProfilesRepo.getById(u.id);
      if (dbProfile) {
        return {
          id: dbProfile.id,
          email: dbProfile.email,
          role: dbProfile.role,
          full_name: dbProfile.full_name,
          is_active: dbProfile.is_active,
          must_reset_password: dbProfile.must_reset_password,
          created_at: dbProfile.created_at,
        };
      }
    } catch {
      // IndexedDB not available yet — use JWT profile
    }

    return jwtProfile;
  };

  /**
   * Trigger initial data download after login.
   * Only runs once per session.
   */
  const triggerInitialSync = async (u: User) => {
    if (initialSyncDoneRef.current || syncInProgressRef.current) return;

    // Check if we already have data in IndexedDB
    try {
      const count = await ProfilesRepo.count();
      if (count > 0) {
        // Already have data — do incremental sync instead
        if (!syncInProgressRef.current) {
          syncInProgressRef.current = true;
          incrementalSync().finally(() => {
            syncInProgressRef.current = false;
            initialSyncDoneRef.current = true;
          });
        }
        return;
      }
    } catch {
      // IndexedDB not ready
    }

    // First time — do full download
    syncInProgressRef.current = true;
    initialDataDownload().then(({ success }) => {
      if (success) {
        initialSyncDoneRef.current = true;
        // Re-resolve profile from IndexedDB after download
        resolveProfile(u).then((p) => setProfile(p));
      }
    }).finally(() => {
      syncInProgressRef.current = false;
    });
  };

  useEffect(() => {
    // Initialize auth state — check session first, only call getUser if session exists
    supabase.auth.getSession().then(async (result: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
      const currentSession = result.data.session;
      const sessionError = result.error;
      if (sessionError) {
        console.warn('[AuthContext] getSession error:', sessionError.message);
        setLoading(false);
        return;
      }

      if (!currentSession) {
        // No active session — set loading false without calling getUser()
        setLoading(false);
        return;
      }

      // Session exists — use the user from the session (no extra network call needed)
      const u = currentSession.user;
      setSession(currentSession);
      setUser(u);

      // Build profile from JWT immediately (no DB query)
      const jwtProfile = profileFromJWT(u);
      setProfile(jwtProfile);
      setLoading(false);

      // Trigger background sync
      triggerInitialSync(u);

      // Enrich profile from IndexedDB in background
      resolveProfile(u).then((enriched) => {
        setProfile(enriched);
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: import('@supabase/supabase-js').AuthChangeEvent, newSession: import('@supabase/supabase-js').Session | null) => {
        setSession(newSession);
        const u = newSession?.user ?? null;
        setUser(u);

        // Handle token refresh failure — session is invalid, force sign out
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          console.warn('[AuthContext] Token refresh failed — signing out');
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore signOut errors
          }
          setProfile(null);
          setUser(null);
          setSession(null);
          initialSyncDoneRef.current = false;
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          setLoading(false);
          return;
        }

        if (u && event !== 'PASSWORD_RECOVERY') {
          // Instant profile from JWT
          const jwtProfile = profileFromJWT(u);
          setProfile(jwtProfile);

          if (event === 'SIGNED_IN') {
            initialSyncDoneRef.current = false;
            triggerInitialSync(u);
          }

          // Enrich from IndexedDB in background
          resolveProfile(u).then((enriched) => setProfile(enriched));
        } else if (!u) {
          setProfile(null);
          initialSyncDoneRef.current = false;
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, metadata: Record<string, unknown> = {}) => {
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? '');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: (metadata?.fullName as string) || (metadata?.full_name as string) || '',
          role: (metadata?.role as string) || 'inspector',
          must_reset_password: metadata?.must_reset_password || false,
        },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
    initialSyncDoneRef.current = false;
  };

  const getCurrentUser = async (): Promise<User | null> => {
    const { data: { user: u } } = await supabase.auth.getUser();
    return u;
  };

  const isEmailVerified = (): boolean => {
    return user?.email_confirmed_at != null;
  };

  /**
   * getUserProfile — reads from IndexedDB first, falls back to JWT.
   * Never queries Supabase directly.
   */
  const getUserProfile = async (): Promise<UserProfile | null> => {
    if (!user) return null;
    setProfileLoading(true);
    try {
      const p = await resolveProfile(user);
      setProfile(p);
      return p;
    } finally {
      setProfileLoading(false);
    }
  };

  /**
   * refreshProfile — triggers incremental sync and re-reads from IndexedDB.
   */
  const refreshProfile = async (): Promise<void> => {
    if (!user) return;
    const p = await resolveProfile(user);
    setProfile(p);
  };

  const role = profile?.role ?? null;
  const isAdmin = role === 'admin';
  const isInspector = role === 'inspector';
  const isComercial = role === 'comercial';

  const value: AuthContextType = {
    user,
    session,
    profile,
    role,
    isAdmin,
    isInspector,
    isComercial,
    loading,
    profileLoading,
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
