'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { voteForOption } from '@/lib/actions';

type Option = { id: string; text: string };

/**
 * Radio list + submit. "Thank you" is shown only after the server confirms the
 * vote was stored. A duplicate or failure shows its real message and no success.
 */
export function VoteForm({ pollId, options }: { pollId: string; options: Option[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await voteForOption(selected, pollId);
      if (result.success || result.code === 'already_voted') {
        if (!result.success) setError(result.error);
        // Re-render the server component: it now knows this browser voted.
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
      <fieldset className="space-y-3" disabled={pending}>
        <legend className="sr-only">Choose one option</legend>
        {options.map((option) => (
          <label
            key={option.id}
            htmlFor={`opt-${option.id}`}
            className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground has-[:checked]:border-primary"
          >
            <input
              id={`opt-${option.id}`}
              type="radio"
              name="option"
              value={option.id}
              checked={selected === option.id}
              onChange={() => setSelected(option.id)}
              className="h-4 w-4 shrink-0"
            />
            <span className="font-medium break-words min-w-0">{option.text}</span>
          </label>
        ))}
      </fieldset>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full sm:w-auto" disabled={!selected || pending}>
        {pending ? 'Submitting…' : 'Submit vote'}
      </Button>
    </form>
  );
}
