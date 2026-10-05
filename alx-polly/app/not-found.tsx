import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto py-12 text-center space-y-4">
      <h1 className="text-2xl font-semibold">Poll not found</h1>
      <p className="text-muted-foreground">
        This poll may have been deleted, or the link is incorrect. Ask the person who shared it for a fresh link.
      </p>
      <Button asChild>
        <Link href="/polls">Go to my polls</Link>
      </Button>
    </div>
  );
}
