import { UTF8_BOM, buildPollCsv, csvFilename } from '@/lib/csv';
import { getPublicPoll, optionsForResults } from '@/lib/poll-view';
import { isUuid } from '@/lib/route-protection';
import { getComponentSupabase, getCurrentUser } from '@/lib/supabase-server';

// Per-user data behind a cookie: never cached, never prerendered.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * Results as CSV, for the poll's owner only. Signed out gets 401. A poll that is missing and a poll that
 * belongs to someone else both get the same 404, so the endpoint cannot be used to probe which ids exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', { status: 404, headers: NO_STORE });

  const supabase = await getComponentSupabase();
  const user = await getCurrentUser(supabase).catch(() => null);
  if (!user) return new Response('Sign in to export results.', { status: 401, headers: NO_STORE });

  // get_poll reports is_owner from the verified session and shows the owner real counts.
  const { poll, error } = await getPublicPoll(supabase, id);
  if (error) {
    console.error('Export: loading poll failed:', { code: error.code, message: error.message });
    return new Response('Could not export right now. Try again.', { status: 500, headers: NO_STORE });
  }
  if (!poll || !poll.is_owner) return new Response('Not found', { status: 404, headers: NO_STORE });

  const sorted = [...poll.options].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const csv = buildPollCsv({
    title: poll.title,
    isClosed: poll.is_closed,
    closesAt: poll.closes_at,
    options: optionsForResults({ ...poll, options: sorted }),
  });

  return new Response(UTF8_BOM + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(poll.title, poll.id)}"`,
      'X-Content-Type-Options': 'nosniff',
      ...NO_STORE,
    },
  });
}
