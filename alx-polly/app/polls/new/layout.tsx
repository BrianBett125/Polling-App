import { redirect } from 'next/navigation';
import { getComponentSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** Server-side guard for the create page (the page itself is a client component). */
export default async function NewPollLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getComponentSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth?next=/polls/new');
  return <>{children}</>;
}
