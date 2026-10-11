'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from './types/action-result';
import { getCurrentUser, getServerSupabase } from './supabase-server';
import { cleanOptions, parsePollSettings, validateOptions } from './poll-form';
import { isUuid } from './route-protection';
import { messageForDbError } from './vote-errors';

// Owner-only poll administration. Server Actions only: every export must be an async action.
// Ownership is enforced three ways: the verified user id from Supabase Auth, `.eq('created_by', user.id)`
// on every write, and row level security in the database.

const SIGN_IN_REQUIRED: ActionResult = { success: false, error: 'Please sign in to continue.', code: 'not_authenticated' };
const BAD_ID: ActionResult = { success: false, error: 'Missing poll id' };
const NOT_FOUND: ActionResult = { success: false, error: 'Poll not found, or you do not own it.' };
const GENERIC_ADMIN_ERROR = 'Something went wrong. Please try again.';

function refresh(pollId: string) {
  revalidatePath('/polls');
  revalidatePath(`/polls/${pollId}`);
}

/** Stops voting now. Results stay visible according to the poll's visibility setting (and become visible if "after close"). */
export async function closePollAction(pollId: string): Promise<ActionResult> {
  if (!isUuid(pollId)) return BAD_ID;
  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const { data, error } = await supabase
    .from('polls')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', pollId)
    .eq('created_by', user.id)
    .select('id');

  if (error) {
    console.error('Error closing poll:', { code: error.code, message: error.message });
    return { success: false, error: 'Failed to close voting. Please try again.' };
  }
  if (!data || data.length === 0) return NOT_FOUND;

  refresh(pollId);
  return { success: true };
}

/**
 * Opens voting again. A poll can be closed two ways: by hand (closed_at) or by its closing time
 * (closes_at in the past). Clearing only closed_at would leave the second kind closed, so reopening
 * also removes a closing time that has already passed. A closing time still in the future is kept.
 */
export async function reopenPollAction(pollId: string): Promise<ActionResult> {
  if (!isUuid(pollId)) return BAD_ID;
  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const { data: current, error: readError } = await supabase
    .from('polls')
    .select('closes_at')
    .eq('id', pollId)
    .eq('created_by', user.id)
    .maybeSingle();

  if (readError) {
    console.error('Error reading poll to reopen:', { code: readError.code, message: readError.message });
    return { success: false, error: 'Failed to reopen voting. Please try again.' };
  }
  if (!current) return NOT_FOUND;

  const passed = !!current.closes_at && new Date(current.closes_at).getTime() <= Date.now();
  const patch = passed ? { closed_at: null, closes_at: null } : { closed_at: null };

  const { data, error } = await supabase
    .from('polls')
    .update(patch)
    .eq('id', pollId)
    .eq('created_by', user.id)
    .select('id');

  if (error) {
    console.error('Error reopening poll:', { code: error.code, message: error.message });
    return { success: false, error: 'Failed to reopen voting. Please try again.' };
  }
  if (!data || data.length === 0) return NOT_FOUND;

  refresh(pollId);
  return { success: true };
}

export type PollSettingsInput = {
  /** UTC ISO instant or null to remove the closing time. Leave undefined to keep the stored value. */
  closesAt?: string | null;
  requireLogin: boolean;
  resultsVisibility: 'always' | 'after_close';
};

/** Changes closing time, sign-in requirement and results visibility. A new closing time must be in the future. */
export async function updatePollSettingsAction(pollId: string, input: PollSettingsInput): Promise<ActionResult> {
  if (!isUuid(pollId)) return BAD_ID;

  const parsed = parsePollSettings({
    closesAt: input?.closesAt,
    requireLogin: input?.requireLogin,
    resultsVisibility: input?.resultsVisibility,
  });
  if (!parsed.ok) return { success: false, error: parsed.error };

  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const patch: { require_login: boolean; results_visibility: 'always' | 'after_close'; closes_at?: string | null } = {
    require_login: parsed.value.requireLogin,
    results_visibility: parsed.value.resultsVisibility,
  };
  if (input.closesAt !== undefined) patch.closes_at = parsed.value.closesAt;

  const { data, error } = await supabase
    .from('polls')
    .update(patch)
    .eq('id', pollId)
    .eq('created_by', user.id)
    .select('id');

  if (error) {
    console.error('Error updating poll settings:', { code: error.code, message: error.message });
    return { success: false, error: messageForDbError(error, 'Failed to save settings. Please try again.') };
  }
  if (!data || data.length === 0) return NOT_FOUND;

  refresh(pollId);
  return { success: true };
}

/** Rewrites the option list (order = array order). The database refuses once the first vote exists. */
export async function replacePollOptionsAction(pollId: string, options: string[]): Promise<ActionResult> {
  if (!isUuid(pollId)) return BAD_ID;
  if (!Array.isArray(options)) return { success: false, error: 'At least two options are required' };

  const cleaned = cleanOptions(options);
  const problem = validateOptions(cleaned);
  if (problem) return { success: false, error: problem };

  const supabase = await getServerSupabase();
  const user = await getCurrentUser(supabase);
  if (!user) return SIGN_IN_REQUIRED;

  const { error } = await supabase.rpc('replace_poll_options', { p_poll_id: pollId, p_options: cleaned });
  if (error) {
    console.error('Error replacing poll options:', { code: error.code, message: error.message });
    return { success: false, error: messageForDbError(error, GENERIC_ADMIN_ERROR) };
  }

  refresh(pollId);
  return { success: true };
}
