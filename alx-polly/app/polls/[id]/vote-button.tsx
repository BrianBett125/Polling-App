'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Option = { id: string; text: string; votes?: number };

interface VoteFormProps {
  options: Option[];
  action: (formData: FormData) => Promise<void>;
}

export default function VoteForm({ options, action }: VoteFormProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    if (!selected) return;
    setPending(true);
    setMessage(null);
    try {
      formData.set('option', selected);
      await action(formData);
      setMessage('Thank you for voting!');
    } catch (e: any) {
      setMessage(e?.message || 'Failed to submit vote');
    } finally {
      setPending(false);
    }
  };

  return (
    <form action={handleSubmit} className="space-y-3">
      {message && (
        <div className="rounded-md border p-3 text-sm">
          {message}
        </div>
      )}
      {options.map((option) => (
        <label
          key={option.id}
          htmlFor={`opt-${option.id}`}
          className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <input
              id={`opt-${option.id}`}
              type="radio"
              name="option"
              value={option.id}
              checked={selected === option.id}
              onChange={() => setSelected(option.id)}
              className="h-4 w-4"
            />
            <span className="font-medium">{option.text}</span>
          </div>
          {typeof option.votes === 'number' && (
            <span className="text-sm text-muted-foreground">{option.votes} votes</span>
          )}
        </label>
      ))}

      <div className="pt-2">
        <Button type="submit" className="w-full sm:w-auto" disabled={!selected || pending}>
          {pending ? 'Submitting...' : 'Submit vote'}
        </Button>
      </div>
    </form>
  );
}