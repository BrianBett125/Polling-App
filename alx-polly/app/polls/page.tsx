import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DeletePollButton } from '@/components/DeletePollButton';
import { getComponentSupabase } from '@/lib/supabase-server';
import { formatVotes } from '@/lib/results';

export const dynamic = 'force-dynamic';

/** The signed-in creator's own polls. Middleware already blocks signed-out visitors; this re-checks. */
export default async function PollsPage() {
  const supabase = await getComponentSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth?next=/polls');

  const { data: polls, error } = await supabase
    .from('polls_with_totals')
    .select('id, title, total_votes, created_at')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) console.error('Error loading polls:', { code: error.code, message: error.message });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My polls</h1>
        <Button asChild>
          <Link href="/polls/new">Create poll</Link>
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We could not load your polls. Reload the page to try again.
        </div>
      ) : !polls || polls.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-muted-foreground">You have not created any polls yet.</p>
          <Button asChild className="mt-4">
            <Link href="/polls/new">Create your first poll</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {polls.map((poll) => (
            <Card key={poll.id}>
              <CardHeader>
                <CardTitle className="line-clamp-2 break-words">{poll.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{formatVotes(poll.total_votes ?? 0)}</p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button variant="outline" asChild className="flex-1">
                  <Link href={`/polls/${poll.id}`}>View &amp; share</Link>
                </Button>
                <Button variant="secondary" asChild className="flex-1">
                  <Link href={`/polls/${poll.id}/edit`}>Edit</Link>
                </Button>
                <DeletePollButton pollId={poll.id} className="flex-1" />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
