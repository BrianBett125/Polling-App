import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Shown for unknown URLs and for polls that are deleted or never existed (poll pages call notFound()). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center py-8 text-center">
      <p aria-hidden="true" className="text-brand font-display text-[8rem] font-extrabold leading-none sm:text-[10rem]">
        404
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Page not found</h1>
      <p className="mt-4 text-pretty text-lg text-muted-foreground">
        If you followed a poll link, the poll may have been deleted or the link is incorrect. Ask the person who shared it for a fresh link.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" asChild>
          <Link href="/polls">Go to my polls</Link>
        </Button>
        <Button size="lg" asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
