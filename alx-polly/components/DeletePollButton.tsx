'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { deletePollAction } from '@/lib/actions';

export function DeletePollButton({ pollId, className }: { pollId: string; className?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = async () => {
    if (!window.confirm('Delete this poll and all its votes? This cannot be undone.')) return;
    setPending(true);
    setError(null);
    try {
      const result = await deletePollAction(pollId);
      if (result.success) router.refresh();
      else setError(result.error);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={className}>
      <Button variant="ghost" type="button" className="w-full text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-950 dark:hover:text-red-200" onClick={onClick} disabled={pending}>
        {pending ? 'Deleting…' : 'Delete'}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
