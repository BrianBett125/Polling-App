'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/database.types';

// High-level: Client-side auth context backed by Supabase; hydrates session and subscribes to auth state changes.
const NOT_CONFIGURED = new Error('This site is not configured yet: the Supabase environment variables are missing.');
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Shape of the authentication context exposed to client components.
 * - user/session reflect the current Supabase auth state
 * - isLoading indicates whether the initial auth state is being resolved
 * - signIn/signUp/signOut wrap Supabase helpers for convenience
 */
type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any, data: any }>;
  signOut: () => Promise<void>;
};

/**
 * AuthProvider
 * Initializes auth state on mount by reading the persisted session and listening for auth state changes.
 * Wrap your application with this provider to access `useAuth()` in client components.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Created lazily and guarded: with the NEXT_PUBLIC_SUPABASE_* variables missing the client
  // constructor throws, which would crash every page (and the build) instead of showing a clear message.
  const supabase = useMemo(() => {
    try {
      return createClientComponentClient<Database>();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    // Get session from storage
    const getSession = async () => {
      setIsLoading(true);
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session:', error);
      }
      
      if (session) {
        setSession(session);
        setUser(session.user);
      }
      
      setIsLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  /** Sign in with email/password via Supabase. Returns an error field if the operation fails. */
  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: NOT_CONFIGURED };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  /** Sign up with email/password. Returns data (may include user) and error from Supabase. */
  const signUp = async (email: string, password: string) => {
    if (!supabase) return { data: null, error: NOT_CONFIGURED };
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  };

  /** Clears the current session and signs the user out. */
  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    isLoading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}