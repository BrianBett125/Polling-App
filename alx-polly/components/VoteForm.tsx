'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, LogIn } from 'lucide-react';
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
  // The refresh that swaps the form for "Your vote is in" is occasionally dropped when it races another
  // update. Retry while this form is still on screen; the timers die with the form once the page updates.
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => retryTimers.current.forEach(clearTimeout), []);

  if (requireLogin && !signedIn) {
    return (
      <div className="space-y-4 rounded-2xl border border-primary/30 bg-accent/50 p-5" data-testid="login-required-panel">
        <span className="bg-brand inline-flex size-10 items-center justify-center rounded-xl text-white" aria-hidden="true">
          <LogIn className="size-5" />
        </span>
        <h3 className="text-lg font-bold">This poll is for signed-in voters</h3>
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
      if (outcome.refresh) {
        router.refresh();
        retryTimers.current = [1500, 3500].map((ms) => setTimeout(() => router.refresh(), ms));
      }
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
      <fieldset className="space-y-3.5" disabled={pending}>
        <legend className="sr-only">Choose one option</legend>
        {options.map((option, i) => (
          <label
            key={option.id}
            htmlFor={`opt-${option.id}`}
            className="group relative flex min-h-[4.5rem] cursor-pointer items-center gap-4 rounded-2xl border-2 border-input bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-accent/30 hover:shadow-soft active:scale-[0.99] has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:shadow-glow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background sm:p-5"
          >
            <input
              id={`opt-${option.id}`}
              type="radio"
              name="option"
              value={option.id}
              checked={selected === option.id}
              onChange={() => setSelected(option.id)}
              className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-base font-bold text-secondary-foreground transition-colors peer-checked:bg-brand peer-checked:text-white"
            >
              {String.fromCharCode(65 + (i % 26))}
            </span>
            <span className="min-w-0 flex-1 break-words text-[17px] font-semibold leading-snug">{option.text}</span>
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/60 text-transparent transition-all peer-checked:animate-pop peer-checked:border-transparent peer-checked:bg-brand peer-checked:text-white"
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
          </label>
        ))}
      </fieldset>

      {captchaEnabled && <Turnstile onToken={setToken} resetKey={resetKey} />}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3.5 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Sticks to the bottom of a phone screen so the button stays in reach on a long poll. */}
      <div className="sticky bottom-3 z-20 -mx-2 rounded-2xl bg-background/85 p-2 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button
          type="submit"
          size="lg"
          className="w-full disabled:border disabled:border-input disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
          disabled={!canSubmit({ selected, pending, captchaRequired: captchaEnabled, token })}
        >
          {pending ? 'Submitting…' : 'Submit vote'}
        </Button>
        {!selected && (
          <p className="mt-2 text-center text-sm text-muted-foreground">Pick an option above, then tap Submit vote.</p>
        )}
      </div>
    </form>
  );
}
