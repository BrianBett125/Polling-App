import { getServerSupabase } from '@/lib/supabase-server';
import { safeNextPath } from '@/lib/route-protection';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeNextPath(requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // An expired or already-used recovery link should land where the user can ask for a new one.
      const failure = next.startsWith('/auth/reset') ? '/auth/forgot?error=expired' : '/auth?error=callback';
      return NextResponse.redirect(new URL(failure, request.url));
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(next, request.url));
}