'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PollSettingsFields } from '@/components/PollSettingsFields';
import { updatePollAction } from '@/lib/actions';
import { replacePollOptionsAction, updatePollSettingsAction } from '@/lib/actions-poll-admin';
import { LIMITS, cleanOptions, isoToLocalInput, localInputToIso, validateOptions } from '@/lib/poll-form';
import type { Poll } from '@/lib/types';

export const OPTIONS_LOCKED_MESSAGE = 'Options are locked because voting has started.';

interface EditPollFormProps {
  poll: Pick<Poll, 'id' | 'title' | 'description' | 'closes_at' | 'require_login' | 'results_visibility'>;
  /** Current options in display order. */
  options: { id: string; text: string }[];
  /** True once any vote exists: options become read-only (the database refuses changes too). */
  optionsLocked: boolean;
  /** The closing time already passed, so the poll is closed by time. */
  closedByTime: boolean;
}

export default function EditPollForm({ poll, options: initialOptions, optionsLocked, closedByTime }: EditPollFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [options, setOptions] = useState(() => initialOptions.map((o) => ({ key: o.id, text: o.text })));
  const router = useRouter();

  // A passed closing time is not pre-filled: leaving the field empty means "unchanged", a new future time reopens.
  const initialClosesLocal = closedByTime ? '' : isoToLocalInput(poll.closes_at);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
  };
  const remove = (index: number) => {
    if (options.length <= LIMITS.minOptions) return;
    setOptions(options.filter((_, i) => i !== index));
  };
  const add = () => {
    if (options.length >= LIMITS.maxOptions) return;
    setOptions([...options, { key: `new-${crypto.randomUUID()}`, text: '' }]);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    setError(null);

    // 1. Validate everything in the browser first, so nothing is half saved for a typo.
    let newOptions: string[] | null = null;
    if (!optionsLocked) {
      const cleaned = cleanOptions(options.map((o) => o.text));
      const problem = validateOptions(cleaned);
      if (problem) return setError(problem);
      const unchanged = cleaned.length === initialOptions.length && cleaned.every((t, i) => t === initialOptions[i].text);
      if (!unchanged) newOptions = cleaned;
    }

    const localClose = String(form.get('closes_at_local') ?? '').trim();
    let closesAt: string | null | undefined; // undefined = leave as stored
    if (localClose) {
      if (localClose !== initialClosesLocal) {
        const iso = localInputToIso(localClose);
        if (!iso) return setError('Enter the closing time as a valid date and time.');
        if (new Date(iso).getTime() <= Date.now()) return setError('The closing time must be in the future.');
        closesAt = iso;
      }
    } else if (!closedByTime && poll.closes_at) {
      closesAt = null; // the owner cleared an upcoming closing time
    }
    const requireLogin = form.get('require_login') === 'on';
    const resultsVisibility = form.get('results_visibility') === 'after_close' ? 'after_close' : 'always';
    const settingsChanged =
      closesAt !== undefined || requireLogin !== poll.require_login || resultsVisibility !== poll.results_visibility;

    const details = new FormData();
    details.set('id', poll.id);
    details.set('title', String(form.get('title') ?? ''));
    details.set('description', String(form.get('description') ?? ''));

    // 2. Save. Options first: it is the step that can lose a race with a first vote. Report partial saves.
    setPending(true);
    let saved = false;
    const fail = (message: string) => {
      setError(saved ? `${message} Earlier changes were saved.` : message);
      if (saved) router.refresh();
    };
    try {
      if (newOptions) {
        const r = await replacePollOptionsAction(poll.id, newOptions);
        if (!r.success) return fail(r.error);
        saved = true;
      }
      const d = await updatePollAction(details);
      if (!d.success) return fail(d.error);
      saved = true;
      if (settingsChanged) {
        const s = await updatePollSettingsAction(poll.id, { closesAt, requireLogin, resultsVisibility });
        if (!s.success) return fail(s.error);
      }
      router.push(`/polls/${poll.id}`);
      router.refresh();
    } catch {
      fail('Could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <div role="alert" className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
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

      <div className="space-y-2">
        <span id="options-label" className="block text-sm font-medium">
          Options
        </span>
        {optionsLocked ? (
          <>
            <p className="text-sm text-muted-foreground" role="note">
              {OPTIONS_LOCKED_MESSAGE}
            </p>
            <ol className="list-decimal space-y-1 pl-6 text-sm" aria-labelledby="options-label">
              {options.map((o) => (
                <li key={o.key} className="break-words">
                  {o.text}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {LIMITS.minOptions} to {LIMITS.maxOptions} options. You can change them until the first vote arrives.
            </p>
            <ul className="space-y-2" aria-labelledby="options-label">
              {options.map((o, i) => (
                <li key={o.key} className="flex items-center gap-2">
                  <Input
                    aria-label={`Option ${i + 1}`}
                    value={o.text}
                    maxLength={LIMITS.option}
                    onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                    <span aria-hidden="true">↑</span>
                    <span className="sr-only">Move option {i + 1} up</span>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === options.length - 1}>
                    <span aria-hidden="true">↓</span>
                    <span className="sr-only">Move option {i + 1} down</span>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} disabled={options.length <= LIMITS.minOptions}>
                    <span aria-hidden="true">✕</span>
                    <span className="sr-only">Remove option {i + 1}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={add} disabled={options.length >= LIMITS.maxOptions}>
              Add option
            </Button>
          </>
        )}
      </div>

      <PollSettingsFields
        defaults={{ closesAtLocal: initialClosesLocal, requireLogin: poll.require_login, resultsVisibility: poll.results_visibility }}
        closingTimeHint={
          closedByTime
            ? 'The closing time has passed, so voting is closed. Pick a new future time to reopen it, or leave this empty to keep it closed.'
            : undefined
        }
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" asChild>
          <Link href={`/polls/${poll.id}`}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
