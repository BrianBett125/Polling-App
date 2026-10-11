'use client';

import { useEffect, useState } from 'react';
import { formatLocal, formatUtc } from '@/lib/time-format';

const utcText = formatUtc;
const localText = (date: Date) => formatLocal(date);

/**
 * A moment in the visitor's timezone. The server (and the first client render) print an explicit UTC
 * time, so server and browser markup always match; right after mount the text switches to local time.
 * Without JavaScript the reader still gets an unambiguous "... UTC".
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const date = new Date(iso);
  const valid = !Number.isNaN(date.getTime());
  const [text, setText] = useState(() => (valid ? utcText(date) : ''));

  useEffect(() => {
    if (valid) setText(localText(new Date(iso)));
  }, [iso, valid]);

  if (!valid) return null;
  return (
    <time dateTime={date.toISOString()} className={className}>
      {text}
    </time>
  );
}
