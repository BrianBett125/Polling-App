'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Option = { id: string; text: string };

interface VoteFormProps {
  options: Option[];
  pollId: string;
}

export default function VoteForm({ options, pollId }: VoteFormProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    // Placeholder behavior only; no persistence yet
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border p-4 bg-green-50 text-green-900">Thank you for voting!</div>
        <div className="text-sm text-muted-foreground">
          This is a placeholder. Wire this form to a Server Action to persist votes and render real results.
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {options.map((option) => (
        <label
          key={option.id}
          htmlFor={`opt-${option.id}`}
          className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
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
        </label>
      ))}

      <div className="pt-2">
        <Button type="submit" className="w-full sm:w-auto" disabled={!selected}>
          Submit vote
        </Button>
      </div>
    </form>
  );
}