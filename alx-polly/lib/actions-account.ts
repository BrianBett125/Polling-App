'use server';

import { revalidatePath } from 'next/cache';
import { getServerSupabase, getAdminSupabase, getCurrentUser } from './supabase-server';
import { withinRateLimit, RATE_LIMITED_MESSAGE } from './rate-limit';
import type { ActionResult } from './types/action-result';

/** Case-insensitive, whitespace-trimmed email comparison used for the delete confirmation. */
function sameEmail(typed: unknown, actual: string | undefined): boolean {
  return typeof typed === 'string' && !!actual && typed.trim().toLowerCase() === actual.trim().toLowerCase();
}

/**
 * Permanently deletes the signed-in user's account. The database cascades to their polls
 * (see the robustness migration); nothing is deleted by hand here.
 * The typed email is re-checked on the server against the verified user, so a forged
 * client cannot skip the confirmation.
 */
export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return { success: false, error: 'Please sign in to continue.', code: 'not_authenticated' };
  }

  if (!sameEmail(confirmEmail, user.email)) {
    return { success: false, error: 'The email you typed does not match your account email.' };
  }

  if (!(await withinRateLimit('deleteAccount', user.id))) {
    return { success: false, error: RATE_LIMITED_MESSAGE, code: 'rate_limited' };
  }

  const admin = getAdminSupabase();
  if (!admin) {
    console.error('Account deletion unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured');
    return { success: false, error: 'Account deletion is not available right now. Please contact support.' };
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('Error deleting account:', { code: error.code, status: error.status });
    return { success: false, error: 'We could not delete your account. Please try again.' };
  }

  // The auth user is gone; clear the browser's session cookies. A failure here is not fatal.
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Sign-out after account deletion failed:', e);
  }
  revalidatePath('/polls');
  return { success: true };
}
