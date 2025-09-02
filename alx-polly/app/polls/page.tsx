import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';
import { deletePollAction } from '@/lib/actions';

export default async function PollsPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient<Database>({ cookies: () => cookieStore });

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch polls including owner id
  const { data: polls, error } = await supabase
    .from('polls')
    .select(`
      id,
      title,
      created_by,
      poll_options (votes)
    `)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching polls:', error);
  }
  
  const processedPolls = (polls || []).map((poll: any) => {
    const totalVotes = poll.poll_options?.reduce(
      (sum: number, option: { votes: number }) => sum + (option.votes || 0), 
      0
    ) || 0;
    return {
      id: poll.id,
      title: poll.title,
      votes: totalVotes,
      created_by: poll.created_by as string | null,
      isOwner: !!user && poll.created_by === user.id,
    };
  });

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Polls</h1>
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
                      <Button variant="destructive" className="w-full" type="submit">
                        Delete
                      </Button>
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