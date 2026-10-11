'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';

const ITEMS = [
  { href: '/polls', label: 'My polls', match: (p: string) => p === '/polls' },
  { href: '/polls/new', label: 'Create poll', match: (p: string) => p.startsWith('/polls/new') },
];

export default function MainNav() {
  const pathname = usePathname() ?? '';
  const { user } = useAuth();

  return (
    <nav aria-label="Main" className={cn('items-center gap-1 text-sm font-medium', user ? 'flex' : 'hidden sm:flex')}>
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-1.5 transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
