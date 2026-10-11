'use client';

import { QRCodeSVG } from 'qrcode.react';

/** A real, scannable QR code for the landing page mock-up (it points at this site). Decorative. */
export function HeroQr({ value }: { value: string }) {
  return (
    <div aria-hidden="true" className="rounded-xl bg-white p-2 shadow-sm">
      <QRCodeSVG value={value} size={64} marginSize={0} fgColor="#1e1b4b" bgColor="#ffffff" />
    </div>
  );
}
