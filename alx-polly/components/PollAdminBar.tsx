'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { closePollAction, reopenPollAction } from '@/lib/actions-poll-admin';

/** Owner toolbar on the poll page: edit, close or reopen voting, download results. */
export function PollAdminBar({
  pollId,
  isClosed,
  closedByTime,
}: {
  pollId: string;
  isClosed: boolean;
  /** Closed only because its closing time passed (reopening removes that time). */
  closedByTime: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const toggle = async () => {
    if (!isClosed && !window.confirm('Close voting now? Nobody can vote until you reopen it.')) return;
    setPending(true);
    setError(null);
    try {
      const result = await (isClosed ? reopenPollAction(pollId) : closePollAction(pollId));
      if (result.success) router.refresh();
      else setError(result.error);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2" aria-label="Owner tools" role="group">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground mr-1">Owner</span>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/polls/${pollId}/edit`}>Edit</Link>
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={toggle} disabled={pending}>
          {pending ? 'Working…' : isClosed ? 'Reopen voting' : 'Close voting'}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`/polls/${pollId}/export`} download>
            Export CSV
          </a>
        </Button>
      </div>
      {isClosed && closedByTime && (
        <p className="text-xs text-muted-foreground">
          This poll closed because its closing time passed. Reopening removes that closing time so voting is open again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
