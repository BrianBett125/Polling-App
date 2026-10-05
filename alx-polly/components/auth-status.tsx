'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';

export function AuthStatus() {
  const { user, signOut, isLoading } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
    router.refresh();
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm hidden sm:block">
          <span className="text-muted-foreground mr-1">Signed in as</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/auth">Sign in</Link>
      </Button>
    </div>
  );
}