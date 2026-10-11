import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getPublicPoll } from '@/lib/poll-view';
import { isUuid } from '@/lib/route-protection';
import { SITE_NAME, truncate } from '@/lib/seo';

export const alt = `A poll on ${SITE_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/** Title for the card, or null for the generic card (unknown id, lookup failure, no env). */
async function loadTitle(id: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !isUuid(id)) return null;
  try {
    // Anonymous client on purpose: the preview must not depend on (or vary with) a visitor's session.
    const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { poll } = await getPublicPoll(supabase, id);
    return poll?.title ?? null;
  } catch {
    return null;
  }
}

/** 1200x630 share card: title, app name, call to action. Never shows vote counts. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawTitle = await loadTitle(id);
  const title = rawTitle ? truncate(rawTitle, 120) : 'Vote on this poll';
  const fontSize = title.length > 80 ? 56 : title.length > 40 ? 68 : 84;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0a0a0b',
          color: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#a1a1aa' }}>{SITE_NAME}</div>
        <div
          style={{
            display: 'flex',
            fontSize,
            fontWeight: 700,
            lineHeight: 1.15,
            lineClamp: 3,
            wordBreak: 'break-word',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              background: '#fafafa',
              color: '#0a0a0b',
              fontSize: 40,
              fontWeight: 700,
              padding: '16px 40px',
              borderRadius: 16,
            }}
          >
            Vote now
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // Titles can be edited, so do not take Next's default one-year immutable cache for a
      // dynamic card. Short shared-cache life for a real poll, shorter for the generic card.
      headers: {
        'Cache-Control': rawTitle
          ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600'
          : 'public, max-age=0, s-maxage=60',
      },
    },
  );
}
