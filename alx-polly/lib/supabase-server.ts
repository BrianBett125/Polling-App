import { cookies } from 'next/headers';
import { createServerActionClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// The casts: auth-helpers 0.10 predates supabase-js 2.57's SupabaseClient generics, so its
// return type collapses to `never` row types. At runtime it is a plain SupabaseClient.
// auth-helpers 0.10 types `cookies` as the Promise returned by Next 15's cookies(),
// but reads it synchronously at runtime, so we hand it the already-awaited store.
type CookiesArg = () => ReturnType<typeof cookies>;

/** Supabase client bound to the visitor's session, for Server Actions and Route Handlers. */
export async function getServerSupabase(): Promise<SupabaseClient<Database>> {
  const store = await cookies();
  return createServerActionClient<Database>({ cookies: (() => store) as unknown as CookiesArg }) as unknown as SupabaseClient<Database>;
}

/** Supabase client bound to the visitor's session, for Server Components. */
export async function getComponentSupabase(): Promise<SupabaseClient<Database>> {
  const store = await cookies();
  return createServerComponentClient<Database>({ cookies: (() => store) as unknown as CookiesArg }) as unknown as SupabaseClient<Database>;
}

/**
 * Service-role client. Server only: SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_
 * prefix, so it is never sent to browsers. Used for the vote RPC and for reading
 * the private votes table. Returns null when not configured.
 */
export function getAdminSupabase(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Signed-in user verified with Supabase Auth (not just read from the cookie), or null. */
export async function getCurrentUser(supabase: SupabaseClient<Database>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
