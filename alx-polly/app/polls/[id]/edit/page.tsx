import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EditPollForm from '@/components/EditPollForm';
import { isUuid } from '@/lib/route-protection';
import { getComponentSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function EditPollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await getComponentSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=/polls/${id}/edit`);

  const { data: poll, error } = await supabase
    .from('polls')
    .select('id, title, description, created_by')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error loading poll for edit:', { code: error.code, message: error.message });
    return (
      <div role="alert" className="max-w-2xl mx-auto rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        We could not load this poll. Reload the page to try again.
      </div>
    );
  }
  if (!poll) notFound();
  // Only the owner can edit. RLS enforces it again on write.
  if (poll.created_by !== user.id) redirect(`/polls/${id}`);

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit poll</CardTitle>
        </CardHeader>
        <CardContent>
          <EditPollForm poll={poll} />
        </CardContent>
      </Card>
    </div>
  );
}
