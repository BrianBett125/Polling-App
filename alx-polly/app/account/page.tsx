import { redirect } from 'next/navigation';
import { getComponentSupabase, getCurrentUser } from '@/lib/supabase-server';
import { AccountSettings } from '@/components/AccountSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const supabase = await getComponentSupabase();
  const user = await getCurrentUser(supabase);
  // Middleware already guards /account; this covers a session that expired between checks.
  if (!user || !user.email) redirect('/auth?next=/account');

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="animate-fade-up">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Account</h1>
        <p className="mt-2 text-lg text-muted-foreground">Manage how you sign in, and your data.</p>
      </div>
      <AccountSettings email={user.email} />
    </div>
  );
}
