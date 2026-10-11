'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { friendlyAuthError } from '@/lib/auth-errors';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/password-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function ResetPasswordPage() {
  const { session, isLoading, updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setError(friendlyAuthError(error));
        return;
      }
      router.push('/polls');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="max-w-md mx-auto py-8 text-sm text-muted-foreground">Checking your reset link...</div>;
  }

  // No session means the link was never opened, has expired, or was already used.
  if (!session) {
    return (
      <div className="max-w-md mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle as="h1">Link expired</CardTitle>
            <CardDescription>
              This password reset link has expired or was already used. Request a new one to continue.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-4">
            <Button className="w-full" asChild>
              <Link href="/auth/forgot">Request a new link</Link>
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/auth">Back to sign in</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle as="h1">Choose a new password</CardTitle>
          <CardDescription>At least {MIN_PASSWORD_LENGTH} characters.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Set new password'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
