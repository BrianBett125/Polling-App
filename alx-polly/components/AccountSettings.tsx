'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { deleteAccountAction } from '@/lib/actions-account';
import { friendlyAuthError } from '@/lib/auth-errors';
import { validateNewPassword, emailMatches, MIN_PASSWORD_LENGTH } from '@/lib/password-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

/** Email, change-password form and the delete-account danger zone. */
export function AccountSettings({ email }: { email: string }) {
  const { updatePassword, signOut } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const [typedEmail, setTypedEmail] = useState('');
  const [delError, setDelError] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setPwError(problem);
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setPwError(friendlyAuthError(error));
        return;
      }
      setPwDone(true);
      setPassword('');
      setConfirm('');
    } finally {
      setPwBusy(false);
    }
  };

  const signInAgain = async () => {
    await signOut();
    window.location.assign('/auth?next=%2Faccount');
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelError(null);
    setNeedsReauth(false);
    if (!emailMatches(typedEmail, email)) {
      setDelError('Type your account email exactly to confirm.');
      return;
    }
    setDelBusy(true);
    try {
      const res = await deleteAccountAction(typedEmail);
      if (!res.success) {
        setDelError(res.error);
        setNeedsReauth(res.code === 'reauth_required');
        return;
      }
      // Full navigation so every client-side cache of the old session is dropped.
      window.location.assign('/');
    } catch {
      setDelError('We could not delete your account. Please try again.');
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Your email</CardTitle>
          <CardDescription>The address you sign in with.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-medium" data-testid="account-email">{email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>At least {MIN_PASSWORD_LENGTH} characters.</CardDescription>
        </CardHeader>
        <form onSubmit={changePassword}>
          <CardContent className="space-y-4">
            {pwError && (
              <div role="alert" className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 p-3 rounded-md text-sm">
                {pwError}
              </div>
            )}
            {pwDone && (
              <div role="status" className="bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 p-3 rounded-md text-sm">
                Password updated.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
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
            <Button type="submit" disabled={pwBusy}>
              {pwBusy ? 'Saving...' : 'Change password'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="border-red-300">
        <CardHeader>
          <CardTitle className="text-red-700 dark:text-red-300">Delete account</CardTitle>
          <CardDescription>
            This permanently deletes your account and every poll you created, along with their options and votes. It
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <form onSubmit={deleteAccount}>
          <CardContent className="space-y-4">
            {delError && (
              <div role="alert" className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 p-3 rounded-md text-sm">
                {delError}
                {needsReauth && (
                  <Button type="button" variant="outline" size="sm" className="mt-2 block" onClick={signInAgain}>
                    Sign out and sign in again
                  </Button>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="confirm-email">
                Type <span className="font-mono">{email}</span> to confirm
              </Label>
              <Input
                id="confirm-email"
                type="email"
                autoComplete="off"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" variant="destructive" disabled={delBusy || !emailMatches(typedEmail, email)}>
              {delBusy ? 'Deleting...' : 'Delete my account'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </>
  );
}
