import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updatePollAction } from '@/lib/actions';
import { ProtectedRoute } from '@/components/protected-route';

export default async function EditPollPage({ params }: { params: { id: string } }) {
  const awaitedParams = await params;
  const pollId = awaitedParams.id;

  const cookieStore = await cookies();
  const supabase = createServerComponentClient<Database>({ cookies: () => cookieStore });

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth');
  }

  // Fetch poll
  const { data: poll, error } = await supabase
    .from('polls')
    .select('id, title, description, created_by')
    .eq('id', pollId)
    .single();

  if (error || !poll) {
    redirect('/polls');
  }

  // Only owner can edit
  if (poll.created_by !== user.id) {
    redirect('/polls');
  }

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Edit poll</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updatePollAction} id="edit-poll-form" className="space-y-4">
              <input type="hidden" name="id" value={poll.id} />
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">Title</label>
                <Input id="title" name="title" defaultValue={poll.title} required />
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">Description</label>
                <Textarea id="description" name="description" defaultValue={poll.description ?? ''} />
              </div>
            </form>
          </CardContent>
          <CardFooter className="flex gap-2 justify-end">
            <Button variant="outline" asChild>
              <Link href="/polls">Cancel</Link>
            </Button>
            <Button type="submit" form="edit-poll-form">Save</Button>
          </CardFooter>
        </Card>
      </div>
    </ProtectedRoute>
  );
}