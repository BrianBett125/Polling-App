import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { isProtectedPath, isUuid, safeNextPath } from '@/lib/route-protection';
import { VOTER_COOKIE, isVoterSecret, newVoterSecret, voterCookieOptions } from '@/lib/voter-cookie';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });
  const { pathname, search } = req.nextUrl;
  const protectedPath = isProtectedPath(pathname);

  if (!protectedPath && pathname !== '/auth') {
    // Public pages (poll links, voting): only keep the session cookie fresh.
    await supabase.auth.getSession();
    // Poll page load: give this browser its voter identity before it can vote.
    const m = /^\/polls\/([^/]+)\/?$/.exec(pathname);
    if (m && isUuid(m[1]) && !isVoterSecret(req.cookies.get(VOTER_COOKIE)?.value)) {
      res.cookies.set(VOTER_COOKIE, newVoterSecret(), voterCookieOptions());
    }
    return res;
  }

  // getUser() asks Supabase Auth to validate the token instead of trusting the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (protectedPath && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (pathname === '/auth' && user) {
    const dest = new URL(safeNextPath(req.nextUrl.searchParams.get('next')), req.url);
    return NextResponse.redirect(dest);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
