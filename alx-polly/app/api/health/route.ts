import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Uptime check: answers without touching the database, so it reports "the app is serving". */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
