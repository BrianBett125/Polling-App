import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';
import { deletePollAction } from '@/lib/actions';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';

export default async function PollsPage({
  searchParams,
}: {
  searchParams?: Promise<{ mine?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient<Database>({ cookies: () => cookieStore });

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = searchParams ? await searchParams : undefined;
  const onlyMine = sp?.mine === '1' || sp?.mine === 'true';

  // Fetch polls with pre-aggregated total votes from the DB view (with fallback)
  let processedPolls: { id: string; title: string; votes: number; created_by: string | null; isOwner: boolean }[] = [];

  try {
    let viewQuery = supabase
      .from('polls_with_totals')
      .select('id, title, created_by, created_at, total_votes')
      .order('created_at', { ascending: false });

    if (onlyMine && user?.id) {
      viewQuery = viewQuery.eq('created_by', user.id);
    }

    const { data: pollsView, error: viewError } = await viewQuery;

    if (!viewError && pollsView) {
      processedPolls = (pollsView || []).map((poll: any) => ({
        id: poll.id,
        title: poll.title,
        votes: poll.total_votes ?? 0,
        created_by: poll.created_by as string | null,
        isOwner: !!user && poll.created_by === user?.id,
      }));
    } else {
      // Fallback: fetch polls and sum votes from poll_options
      if (viewError) {
        console.error('Error fetching polls_with_totals:', viewError);
      }

      let fbQuery = supabase
        .from('polls')
        .select(
          `
        id, title, created_by, created_at,
        poll_options ( votes )
      `,
        )
        .order('created_at', { ascending: false });

      if (onlyMine && user?.id) {
        fbQuery = fbQuery.eq('created_by', user.id);
      }

      const { data: pollsFallback, error: fallbackError } = await fbQuery;

      if (fallbackError) {
        console.error('Error fetching polls (fallback):', fallbackError);
      }

      const safe = (pollsFallback || []) as any[];
      processedPolls = safe.map((p: any) => {
        const votes = Array.isArray(p.poll_options)
          ? (p.poll_options as any[]).reduce((sum, po: any) => sum + (po?.votes ?? 0), 0)
          : 0;
        return {
          id: p.id,
          title: p.title,
          votes,
          created_by: p.created_by as string | null,
          isOwner: !!user && p.created_by === user?.id,
        };
      });
    }
  } catch (e) {
    console.error('Unexpected error loading polls:', e);
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Polls</h1>
            <div className="flex items-center gap-2">
              <Button variant={!(onlyMine) ? 'default' : 'outline'} size="sm" asChild>
                <Link href="/polls">All</Link>
              </Button>
              <Button variant={onlyMine ? 'default' : 'outline'} size="sm" asChild>
                <Link href="/polls?mine=1">My Polls</Link>
              </Button>
            </div>
          </div>
          <Button asChild>
            <Link href="/polls/new">Create poll</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {processedPolls.length === 0 && (
            <div className="col-span-full text-center py-10">
              <p className="text-muted-foreground">No polls found. Create your first poll!</p>
            </div>
          )}
          {processedPolls.map((poll) => (
            <Card key={poll.id}>
              <CardHeader>
                <CardTitle className="line-clamp-2">{poll.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{poll.votes} votes</p>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" asChild className="flex-1">
                  <Link href={`/polls/${poll.id}`}>View</Link>
                </Button>
                {poll.isOwner && (
                  <>
                    <Button variant="secondary" asChild className="flex-1">
                      <Link href={`/polls/${poll.id}/edit`}>Edit</Link>
                    </Button>
                    <form action={deletePollAction} className="flex-1">
                      <input type="hidden" name="id" value={poll.id} />
                      <ConfirmDeleteButton className="w-full" />
                    </form>
                  </>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}