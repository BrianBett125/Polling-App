import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';

export default function PollsPage() {
  // Sample polls data - in a real app, this would come from Supabase
  const samplePolls = [
    { id: '1', title: 'Favorite Programming Language', votes: 42 },
    { id: '2', title: 'Best Frontend Framework', votes: 36 },
    { id: '3', title: 'Most Useful Developer Tool', votes: 28 },
  ];

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
          {samplePolls.map((poll) => (
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