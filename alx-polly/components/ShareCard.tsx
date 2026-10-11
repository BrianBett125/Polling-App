'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const EXPORT_PX = 1024;
const QUIET_ZONE_MODULES = 4; // the QR spec's minimum quiet zone

/**
 * Standalone SVG text for the rendered QR: the live element is cloned (never mutated), its viewBox is
 * widened by a 4 module quiet zone, a white background fills it, and an explicit size and xmlns are set
 * so the file opens on its own in a browser, an editor or a print workflow.
 */
function qrSvgMarkup(svg: SVGSVGElement, px: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const modules = Number(clone.getAttribute('viewBox')?.split(/\s+/)[2]);
  if (!Number.isFinite(modules) || modules <= 0) throw new Error('QR code not rendered');
  const total = modules + QUIET_ZONE_MODULES * 2;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${-QUIET_ZONE_MODULES} ${-QUIET_ZONE_MODULES} ${total} ${total}`);
  clone.setAttribute('width', String(px));
  clone.setAttribute('height', String(px));
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(-QUIET_ZONE_MODULES));
  bg.setAttribute('y', String(-QUIET_ZONE_MODULES));
  bg.setAttribute('width', String(total));
  bg.setAttribute('height', String(total));
  bg.setAttribute('fill', '#FFFFFF');
  clone.insertBefore(bg, clone.firstChild);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Rasterises the SVG markup onto a white square canvas of `px` pixels. */
function svgToPngBlob(markup: string, px: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      URL.revokeObjectURL(svgUrl);
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('QR image failed to load'));
    };
    img.src = svgUrl;
  });
}

/**
 * Link + QR code for a poll. The absolute URL is built in the browser from the
 * origin the page was actually loaded from, so it is correct on localhost, preview
 * deployments and production alike, and no domain is hardcoded.
 */
export function ShareCard({ path, title, quiet = false }: { path: string; title: string; quiet?: boolean }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

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

  const downloadQr = async (format: 'png' | 'svg') => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    try {
      const markup = qrSvgMarkup(svg, EXPORT_PX);
      if (format === 'svg') {
        saveBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), 'poll-qr.svg');
      } else {
        saveBlob(await svgToPngBlob(markup, EXPORT_PX), 'poll-qr.png');
      }
      setStatus(`QR code saved as poll-qr.${format}.`);
    } catch {
      setStatus('Could not save the QR code. Take a screenshot of it instead.');
    }
  };

  return (
    <Card className="overflow-hidden">
      {quiet ? (
        <div className="px-6 pt-6">
          <h2 className="text-lg font-bold leading-tight">Share this poll</h2>
          <p className="mt-1 text-sm text-muted-foreground">Know someone who should vote? Send them the link.</p>
        </div>
      ) : (
        <div className="bg-brand relative px-6 pb-16 pt-6 text-white">
          <div aria-hidden="true" className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
          <h2 className="relative text-xl font-extrabold leading-tight">Share this poll</h2>
          <p className="relative mt-1 text-sm text-white/90">Scan the code or send the link.</p>
        </div>
      )}
      <CardContent className={`space-y-4 ${quiet ? "pt-5" : "-mt-12"}`}>
        <div ref={qrRef} className={`relative mx-auto w-fit rounded-2xl border border-border/60 bg-white ${quiet ? "p-3 shadow-sm" : "p-4 shadow-lift"}`}>
          {url ? (
            <QRCodeSVG value={url} size={quiet ? 132 : 168} marginSize={0} fgColor="#1e1b4b" bgColor="#ffffff" title={`QR code for ${title}`} role="img" aria-label="QR code linking to this poll" />
          ) : (
            <div className={`animate-pulse rounded bg-muted ${quiet ? "size-[132px]" : "size-[168px]"}`} aria-hidden="true" />
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="poll-link" className="text-sm font-semibold">
            Poll link
          </label>
          <input
            id="poll-link"
            ref={inputRef}
            readOnly
            value={url}
            placeholder="Loading link…"
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-xl border border-input bg-muted/60 px-3.5 text-sm text-muted-foreground transition-colors focus:bg-background focus:text-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={copy} disabled={!url} className="flex-1">
              <Copy className="size-4" aria-hidden="true" /> Copy link
            </Button>
            {canShare && (
              <Button type="button" variant="outline" onClick={share} disabled={!url}>
                <Share2 className="size-4" aria-hidden="true" /> Share…
              </Button>
            )}
          </div>
        </div>

        <div role="group" aria-label="Download QR code" className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <span className="text-sm font-semibold" aria-hidden="true">
            Download QR
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => downloadQr('png')} disabled={!url} aria-label="Download QR code as PNG">
            <Download className="size-3.5" aria-hidden="true" /> PNG
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => downloadQr('svg')} disabled={!url} aria-label="Download QR code as SVG">
            <Download className="size-3.5" aria-hidden="true" /> SVG
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {status}
        </p>
      </CardContent>
    </Card>
  );
}
