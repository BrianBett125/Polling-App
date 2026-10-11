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
    // Reserve the space so the header does not jump when the session resolves.
    return <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />;
  }

  if (user) {
    const initial = (user.email ?? '?').trim().charAt(0).toUpperCase();
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/account"
          className="group flex items-center gap-2 rounded-full border border-border/70 bg-card/70 py-1 pl-1 pr-1 text-sm shadow-sm transition-colors hover:border-primary/40 md:pr-3"
        >
          <span aria-hidden="true" className="bg-brand flex size-8 items-center justify-center rounded-full text-xs font-bold text-white">
            {initial}
          </span>
          <span className="hidden max-w-[16rem] truncate text-muted-foreground group-hover:text-foreground md:block">
            <span className="sr-only">Signed in as </span>
            {user.email}
          </span>
          <span className="sr-only md:hidden">Account</span>
        </Link>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" asChild>
      <Link href="/auth">Sign in</Link>
    </Button>
  );
}
