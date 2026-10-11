'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { safeNextPath } from '@/lib/route-protection';
import { useAuth } from '@/contexts/auth-context';
import { friendlyAuthError } from '@/lib/auth-errors';
import { Turnstile, captchaEnabled } from '@/components/Turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const { signIn, signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'callback') {
      setError('That link did not work or has expired. Please sign in, or request a new link.');
    }
  }, []);

  // Tokens are single use: after any attempt that did not navigate away, ask for a fresh challenge.
  const freshChallenge = () => {
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the human check before continuing.');
      return;
    }
    setLoading(true);
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));

    try {
      if (isLogin) {
        const { error } = await signIn(email, password, captchaToken ?? undefined);
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { data, error } = await signUp(email, password, captchaToken ?? undefined);
        if (error) throw error;
        if (data?.session) {
          // Email confirmation is off for this Supabase project: the user is already signed in.
          router.push(next);
          router.refresh();
        } else {
          setNotice('Account created. Check your email to confirm your address, then sign in.');
          setIsLogin(true);
          freshChallenge();
        }
      }
    } catch (err: any) {
      setError(friendlyAuthError(err));
      freshChallenge();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle as="h1">{isLogin ? 'Sign In' : 'Sign Up'}</CardTitle>
          <CardDescription>
            {isLogin 
              ? 'Enter your credentials to access your account' 
              : 'Create a new account to get started'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div role="alert" className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 p-3 rounded-md text-sm">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 p-3 rounded-md text-sm">
                {notice}
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={isLogin ? undefined : 6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
              {isLogin && (
                <div className="text-right">
                  <Link href="/auth/forgot" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                    Forgot password?
                  </Link>
                </div>
              )}
            </div>
            <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || (captchaEnabled && !captchaToken)}>
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="w-full font-semibold text-primary hover:text-primary" 
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                freshChallenge();
              }}
            >
              {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}