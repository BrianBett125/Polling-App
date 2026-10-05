'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updatePollAction } from '@/lib/actions';
import { LIMITS } from '@/lib/poll-form';
import type { Poll } from '@/lib/types';

interface EditPollFormProps {
  poll: Pick<Poll, 'id' | 'title' | 'description'>;
}

export default function EditPollForm({ poll }: EditPollFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await updatePollAction(new FormData(e.currentTarget));
      if (result.success) {
        router.push(`/polls/${poll.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="id" value={poll.id} />
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium">Title</label>
        <Input id="title" name="title" defaultValue={poll.title} maxLength={LIMITS.title} required />
      </div>
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <Textarea id="description" name="description" defaultValue={poll.description ?? ''} maxLength={LIMITS.description} />
      </div>
      <p className="text-xs text-muted-foreground">Options and votes cannot be changed after a poll is created.</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" asChild>
          <Link href="/polls">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
