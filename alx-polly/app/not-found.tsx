import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Shown for unknown URLs and for polls that are deleted or never existed (poll pages call notFound()). */
export default function NotFound() {
  return (
    <div className="max-w-md mx-auto py-12 text-center space-y-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        If you followed a poll link, the poll may have been deleted or the link is incorrect. Ask the person who shared it for a fresh link.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/polls">Go to my polls</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
