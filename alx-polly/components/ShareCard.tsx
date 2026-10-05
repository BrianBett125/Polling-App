'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Link + QR code for a poll. The absolute URL is built in the browser from the
 * origin the page was actually loaded from, so it is correct on localhost, preview
 * deployments and production alike, and no domain is hardcoded.
 */
export function ShareCard({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(new URL(path, window.location.origin).toString());
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, [path]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied to clipboard.');
    } catch {
      // Clipboard API can be unavailable (insecure origin, denied permission): select the text so Ctrl+C works.
      inputRef.current?.select();
      setStatus('Press Ctrl+C (or Cmd+C) to copy the selected link.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setStatus('Sharing failed. Copy the link instead.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share this poll</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <label htmlFor="poll-link" className="text-sm font-medium">
            Poll link
          </label>
          <input
            id="poll-link"
            ref={inputRef}
            readOnly
            value={url}
            placeholder="Loading link…"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={copy} disabled={!url}>
              Copy link
            </Button>
            {canShare && (
              <Button type="button" variant="outline" onClick={share} disabled={!url}>
                Share…
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground min-h-5" role="status" aria-live="polite">
            {status}
          </p>
        </div>
        <div className="shrink-0 self-center rounded-md border bg-white p-3">
          {url ? (
            <QRCodeSVG value={url} size={160} marginSize={0} title={`QR code for ${title}`} role="img" aria-label="QR code linking to this poll" />
          ) : (
            <div className="h-40 w-40 animate-pulse rounded bg-muted" aria-hidden="true" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
