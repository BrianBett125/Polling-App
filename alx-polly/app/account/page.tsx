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
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>
      <AccountSettings email={user.email} />
    </div>
  );
}
