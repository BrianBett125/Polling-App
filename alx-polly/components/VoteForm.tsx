'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Turnstile, captchaEnabled } from '@/components/Turnstile';
import { voteForOption } from '@/lib/actions';
import { canSubmit, outcomeOf, signInHref } from '@/lib/vote-form-logic';

type Option = { id: string; text: string };

/**
 * Radio list + submit. "Thank you" is shown only after the server confirms the
 * vote was stored. A duplicate or failure shows its real message and no success.
 * Login-only polls show a sign-in panel instead of the options to anonymous visitors
 * (the database enforces the rule either way).
 */
export function VoteForm({
  pollId,
  options,
  requireLogin = false,
  signedIn = false,
}: {
  pollId: string;
  options: Option[];
  requireLogin?: boolean;
  signedIn?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const router = useRouter();

  if (requireLogin && !signedIn) {
    return (
      <div className="space-y-3 rounded-md border p-4" data-testid="login-required-panel">
        <h3 className="font-semibold">This poll is for signed-in voters</h3>
        <p className="text-sm text-muted-foreground">Sign in to cast your vote. You can come back to this poll right after.</p>
        <Button asChild className="w-full sm:w-auto">
          <Link href={signInHref(pollId)}>Sign in to vote</Link>
        </Button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit({ selected, pending, captchaRequired: captchaEnabled, token })) return;
    setPending(true);
    setError(null);
    try {
      const result = await voteForOption(selected!, pollId, token);
      const outcome = outcomeOf(result);
      if (outcome.message) setError(outcome.message);
      // Re-render the server component: it now knows this browser voted, or that the poll closed.
      if (outcome.refresh) router.refresh();
      if (outcome.resetCaptcha) setResetKey((k) => k + 1);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setResetKey((k) => k + 1);
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

      {captchaEnabled && <Turnstile onToken={setToken} resetKey={resetKey} />}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={!canSubmit({ selected, pending, captchaRequired: captchaEnabled, token })}
      >
        {pending ? 'Submitting…' : 'Submit vote'}
      </Button>
    </form>
  );
}
