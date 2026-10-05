import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { isProtectedPath, safeNextPath } from '@/lib/route-protection';
import { VOTER_COOKIE, voterCookieOptions, voterCookieToIssue } from '@/lib/voter-cookie';

/** Redirect that keeps any cookies (refreshed auth session) already set on `res`. */
function redirectKeepingCookies(to: URL, res: NextResponse) {
  const out = NextResponse.redirect(to);
  res.cookies.getAll().forEach((c) => out.cookies.set(c));
  return out;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });
  const { pathname, search } = req.nextUrl;
  const protectedPath = isProtectedPath(pathname);

  if (!protectedPath && pathname !== '/auth') {
    // Public pages (poll links, voting): keep the session cookie fresh and, on a poll
    // page load, give this browser its server-signed voter identity.
    await supabase.auth.getSession();
    const issue = await voterCookieToIssue(pathname, req.cookies.get(VOTER_COOKIE)?.value);
    if (issue) {
      res.cookies.set(VOTER_COOKIE, issue, voterCookieOptions());
      res.headers.set('Cache-Control', 'private, no-store'); // never let a shared cache hand one identity to many browsers
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
    return redirectKeepingCookies(url, res);
  }
  if (pathname === '/auth' && user) {
    const dest = new URL(safeNextPath(req.nextUrl.searchParams.get('next')), req.url);
    return redirectKeepingCookies(dest, res);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
