import { notFound, redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
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

  // Row level security lets the owner read their own poll and its vote counts; anyone else gets no row.
  const [{ data: poll, error }, { data: optionRows, error: optionsError }] = await Promise.all([
    supabase
      .from('polls')
      .select('id, title, description, created_by, closes_at, closed_at, require_login, results_visibility')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('poll_options').select('id, text, votes, position, created_at').eq('poll_id', id),
  ]);

  if (error || optionsError) {
    const e = error ?? optionsError;
    console.error('Error loading poll for edit:', { code: e?.code, message: e?.message });
    return (
      <div role="alert" className="max-w-2xl mx-auto rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
        <h1 className="text-base font-semibold">We could not load this poll</h1>
        <p>Reload the page to try again.</p>
      </div>
    );
  }
  if (!poll) notFound();
  // Only the owner can edit. RLS enforces it again on write.
  if (poll.created_by !== user.id) redirect(`/polls/${id}`);

  const options = [...(optionRows ?? [])].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const hasVotes = options.some((o) => o.votes > 0);
  const closedByTime = !!poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="animate-fade-up mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Edit poll</h1>
        <p className="mt-2 text-lg text-muted-foreground">Change the wording, the settings, or close it early.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <EditPollForm
            poll={poll}
            options={options.map(({ id, text }) => ({ id, text }))}
            optionsLocked={hasVotes}
            closedByTime={closedByTime}
          />
        </CardContent>
      </Card>
    </div>
  );
}
