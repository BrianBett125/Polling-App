import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/protected-route';
import VoteForm from './vote-button';

// Simple mock fetcher to simulate server-side data fetching
type MockOption = { id: string; text: string };
interface MockPoll {
  id: string;
  title: string;
  options: MockOption[];
}

async function fetchMockPoll(id: string): Promise<MockPoll> {
  // Simulate latency so we keep a fetch-like shape that's easy to replace later
  await new Promise((r) => setTimeout(r, 120));
  return {
    id,
    title: "What's your favorite language?",
    options: [
      { id: 'ts', text: 'TypeScript' },
      { id: 'py', text: 'Python' },
      { id: 'go', text: 'Go' },
      { id: 'rs', text: 'Rust' },
    ],
  };
}

export default async function PollDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const poll = await fetchMockPoll(id);

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{poll.title}</h1>
          <p className="text-muted-foreground">Poll ID: {poll.id}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Choose one option</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <VoteForm options={poll.options} pollId={poll.id} />
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}