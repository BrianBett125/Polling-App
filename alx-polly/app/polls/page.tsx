import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';

export default async function PollsPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient<Database>({ cookies: () => cookieStore });
  // Fetch polls from Supabase
  const { data: polls, error } = await supabase
    .from('polls')
    .select(`
      id,
      title,
      poll_options (votes)
    `)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching polls:', error);
  }
  
  // Process polls to calculate total votes
  const processedPolls = polls?.map((poll: any) => {
    const totalVotes = poll.poll_options?.reduce(
      (sum: number, option: { votes: number }) => sum + (option.votes || 0), 
      0
    ) || 0;
    
    return {
      id: poll.id,
      title: poll.title,
      votes: totalVotes
    };
  }) || [];

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
              <CardFooter>
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/polls/${poll.id}`}>View poll</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}