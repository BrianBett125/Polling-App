'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PollSettingsFields } from '@/components/PollSettingsFields';
import { createPoll } from '@/lib/actions';
import { localInputToIso } from '@/lib/poll-form';

export default function CreatePollPage() {
  const [options, setOptions] = useState(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOption = () => {
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return; // Maintain at least 2 options
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  // onSubmit instead of a form action: React 19 resets the fields after an action, which would wipe
  // everything the user typed when the server rejects it (rate limit, validation).
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    const formData = new FormData(e.currentTarget);
    setIsSubmitting(true);
    setError(null);

    try {
      // Add options to form data with proper keys
      options.forEach((option, index) => {
        formData.set(`option-${index}`, option);
      });

      // The date field is wall-clock time in THIS browser. Convert here, where the user's timezone is known;
      // the server only ever sees an absolute UTC instant.
      const local = String(formData.get('closes_at_local') ?? '').trim();
      formData.delete('closes_at_local');
      if (local) {
        const iso = localInputToIso(local);
        if (!iso) {
          setError('Enter the closing time as a valid date and time.');
          setIsSubmitting(false);
          return;
        }
        if (new Date(iso).getTime() <= Date.now()) {
          setError('The closing time must be in the future.');
          setIsSubmitting(false);
          return;
        }
        formData.set('closes_at', iso);
      }

      // On success the server action redirects to the new poll, so this only returns on failure.
      const result = await createPoll(formData);
      if (result && !result.success) {
        setError(result.error);
        setIsSubmitting(false);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto">
        <div className="animate-fade-up mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Create a new poll</h1>
          <p className="mt-2 text-lg text-muted-foreground">Ask a question, add the options, and share the link.</p>
        </div>
        
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Poll details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input 
                  id="title" 
                  name="title" 
                  placeholder="Enter poll title" 
                  maxLength={200}
                  required 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  name="description"
                  placeholder="Provide details about your poll" 
                  className="min-h-[100px]" 
                />
              </div>
              
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-secondary-foreground">
                        {String.fromCharCode(65 + (index % 26))}
                      </span>
                      <Input 
                        placeholder={`Option ${index + 1}`} 
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        maxLength={200}
                        required
                      />
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="shrink-0"
                        onClick={() => removeOption(index)}
                        disabled={options.length <= 2}
                      >
                        <span className="sr-only">Remove option {index + 1}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </Button>
                    </div>
                  ))}
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={addOption}
                  disabled={options.length >= 20}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus mr-1"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  Add option
                </Button>
              </div>

              <PollSettingsFields />
            </CardContent>
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create poll'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </ProtectedRoute>
  );
}