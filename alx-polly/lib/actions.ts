'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { ActionResult } from './types/action-result';
import { getAdminSupabase, getCurrentUser, getServerSupabase } from './supabase-server';
import { parsePollEdit, parsePollForm } from './poll-form';
import { isUuid } from './route-protection';
import { GENERIC_CREATE_ERROR, GENERIC_VOTE_ERROR, isAlreadyVoted, messageForDbError } from './vote-errors';
import { VOTER_COOKIE, isVoterSecret, voterToken } from './voter';

// Server Actions only: every export in a 'use server' file must be an async action.
// Helpers live in ./supabase-server, ./poll-form, ./voter and friends.

const SIGN_IN_REQUIRED: ActionResult = { success: false, error: 'Please sign in to continue.', code: 'not_authenticated' };

/**
 * Records one vote for the visiting browser.
 *
 * Voter identity is a random secret in an httpOnly cookie that only this server
 * issues (middleware, on poll page load); the database stores its SHA-256 and enforces one vote per (poll, token).
 * No client-supplied identity and no IP address is used. This is best effort: a
 * visitor who clears cookies or switches browser can vote again.
 *
 * The cast_vote RPC is executable only by the service role, so the browser cannot
 * call it with a token of its choosing.
 */
export async function voteForOption(optionId: string, pollId: string): Promise<ActionResult<{ voteId: string }>> {
  if (!isUuid(optionId) || !isUuid(pollId)) {
    return { success: false, error: 'That poll or option is not valid.' };
  }

  const admin = getAdminSupabase();
  if (!admin) {
    console.error('Voting unavailable: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not set');
    return { success: false, error: 'Voting is not available right now. Please try again later.' };
  }

  try {
    // The cookie is issued by middleware when the poll page loads. Never minted here:
    // a request without one would get a fresh identity per call, defeating the limit.
    const secret = (await cookies()).get(VOTER_COOKIE)?.value;
    if (!isVoterSecret(secret)) {
      return { success: false, error: messageForDbError({ code: 'VT001' }, GENERIC_VOTE_ERROR) };
    }

    // Optional: remember which account voted, verified by Supabase Auth, never from the client.
    const user = await getCurrentUser(await getServerSupabase()).catch(() => null);

    const { data, error } = await admin.rpc('cast_vote', {
      p_poll_id: pollId,
      p_option_id: optionId,
      p_voter_token: voterToken(secret),
      p_user_id: user?.id ?? null,
    });

    if (error) {
      if (isAlreadyVoted(error)) {
        revalidatePath(`/polls/${pollId}`);
        return { success: false, error: messageForDbError(error, GENERIC_VOTE_ERROR), code: 'already_voted' };
      }
      console.error('cast_vote failed:', { code: error.code, message: error.message });
      return { success: false, error: messageForDbError(error, GENERIC_VOTE_ERROR) };
    }

    revalidatePath(`/polls/${pollId}`);
    revalidatePath('/polls');
    return { success: true, voteId: data as string };
  } catch (error) {
    console.error('Error voting for option:', error);
    return { success: false, error: GENERIC_VOTE_ERROR };
  }
}

/** Creates a poll and its options atomically for the signed-in user, then redirects to the poll page. */
export async function createPoll(formData: FormData): Promise<ActionResult> {
  const parsed = parsePollForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const { data, error } = await supabase.rpc('create_poll_with_options', {
    p_title: parsed.value.title,
    p_description: parsed.value.description || null,
    p_options: parsed.value.options,
  });

  if (error || !data) {
    if (error) console.error('Error creating poll:', { code: error.code, message: error.message });
    return { success: false, error: messageForDbError(error, GENERIC_CREATE_ERROR) };
  }

  revalidatePath('/polls');
  // redirect() throws by design, so it stays outside any try/catch.
  redirect(`/polls/${data}?created=1`);
}

/** Deletes a poll the signed-in user owns. Fails visibly if the poll is missing or not theirs. */
export async function deletePollAction(pollId: string): Promise<ActionResult> {
  if (!isUuid(pollId)) return { success: false, error: 'Missing poll id' };

  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const { data, error } = await supabase
    .from('polls')
    .delete()
    .eq('id', pollId)
    .eq('created_by', user.id)
    .select('id');

  if (error) {
    console.error('Error deleting poll:', { code: error.code, message: error.message });
    return { success: false, error: 'Failed to delete poll. Please try again.' };
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Poll not found, or you do not own it.' };
  }

  revalidatePath('/polls');
  revalidatePath(`/polls/${pollId}`);
  return { success: true };
}

/** Updates title and description of a poll the signed-in user owns. */
export async function updatePollAction(formData: FormData): Promise<ActionResult> {
  const parsed = parsePollEdit(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { id, title, description } = parsed.value;
  if (!isUuid(id)) return { success: false, error: 'Missing poll id' };

  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const { data, error } = await supabase
    .from('polls')
    .update({ title, description: description || null })
    .eq('id', id)
    .eq('created_by', user.id)
    .select('id');

  if (error) {
    console.error('Error updating poll:', { code: error.code, message: error.message });
    return { success: false, error: 'Failed to update poll. Please try again.' };
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Poll not found, or you do not own it.' };
  }

  revalidatePath('/polls');
  revalidatePath(`/polls/${id}`);
  return { success: true };
}
