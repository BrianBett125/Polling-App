'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { friendlyAuthError, isSharedRateLimitError } from '@/lib/auth-errors';
import { Turnstile, captchaEnabled } from '@/components/Turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

/** Same text for every address, so the form cannot be used to find out who has an account. */
const NEUTRAL_MESSAGE =
  'If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'expired') {
      setError('That reset link has expired or was already used. Enter your email to get a new one.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the human check before continuing.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await resetPassword(email.trim(), captchaToken ?? undefined);
      if (error && isSharedRateLimitError(error)) {
        setError(friendlyAuthError(error));
      } else {
        // Every other outcome, including "no such user", looks identical on purpose.
        if (error) console.error('Password reset request failed:', error.code ?? error.status);
        setSent(true);
      }
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle as="h1">Reset your password</CardTitle>
          <CardDescription>Enter your account email and we will send you a link to choose a new password.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div role="alert" className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 p-3 rounded-md text-sm">
                {error}
              </div>
            )}
            {sent && (
              <div role="status" className="bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 p-3 rounded-md text-sm">
                {NEUTRAL_MESSAGE}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || (captchaEnabled && !captchaToken)}>
              {loading ? 'Sending...' : sent ? 'Send again' : 'Send reset link'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" asChild>
              <Link href="/auth">Back to sign in</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
