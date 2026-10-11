import type { Metadata } from 'next';
import { getComponentSupabase } from '@/lib/supabase-server';
import { getPublicPoll } from '@/lib/poll-view';
import { isUuid } from '@/lib/route-protection';
import { DEFAULT_POLL_DESCRIPTION, pollDescription, SITE_NAME, truncate } from '@/lib/seo';

const GENERIC: Metadata = {
  title: 'Poll',
  description: DEFAULT_POLL_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: { type: 'website', siteName: SITE_NAME, title: 'Poll', description: DEFAULT_POLL_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: 'Poll', description: DEFAULT_POLL_DESCRIPTION },
};

/**
 * Link-preview metadata for a poll. Polls are unlisted, so every poll page is noindex; the
 * Open Graph and Twitter tags exist so a shared link looks right in chat apps. No vote counts
 * go in here (the preview image does not show them either).
 * Unknown, deleted or malformed ids, and any lookup failure, get the generic tags.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return GENERIC;

  try {
    const supabase = await getComponentSupabase();
    const { poll } = await getPublicPoll(supabase, id);
    if (!poll) return GENERIC;

    const title = truncate(poll.title, 70);
    const description = pollDescription(poll.description);
    // Next resolves the file-based opengraph-image route (with its cache-busting query) and
    // fills openGraph.images / twitter.images from it, so no image URL is hardcoded here.
    return {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: { type: 'website', siteName: SITE_NAME, title, description, url: `/polls/${poll.id}` },
      twitter: { card: 'summary_large_image', title, description },
    };
  } catch {
    return GENERIC;
  }
}

export default function PollLayout({ children }: { children: React.ReactNode }) {
  return children;
}
