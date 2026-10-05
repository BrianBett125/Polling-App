import { getServerSupabase } from '@/lib/supabase-server';
import { safeNextPath } from '@/lib/route-protection';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/auth?error=callback', request.url));
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(safeNextPath(requestUrl.searchParams.get('next')), request.url));
}