'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createPoll } from '@/lib/actions';

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

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Add options to form data with proper keys
      options.forEach((option, index) => {
        formData.set(`option-${index}`, option);
      });

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
        <h1 className="text-2xl font-semibold mb-6">Create a new poll</h1>
        
        {error && (
          <div role="alert" className="bg-red-50 text-red-600 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <form action={handleSubmit}>
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
                    <div key={index} className="flex items-center gap-2">
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
            </CardContent>
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Poll'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </ProtectedRoute>
  );
}