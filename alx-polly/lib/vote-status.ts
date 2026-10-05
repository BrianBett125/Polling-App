import { cookies } from 'next/headers';
import { getAdminSupabase } from './supabase-server';
import { VOTER_COOKIE, isVoterSecret, voterToken } from './voter';

export type VoteStatus = { hasVoted: boolean; optionId: string | null };

/**
 * Whether this browser already voted on the poll, and for which option.
 * Reads the private votes table with the service role, keyed by the hashed cookie
 * secret. When that cannot be checked (no cookie yet, or a database error) the
 * answer is "not voted"; the database still rejects a duplicate on submit.
 */
export async function getVoteStatus(pollId: string): Promise<VoteStatus> {
  const none = { hasVoted: false, optionId: null };
  const secret = (await cookies()).get(VOTER_COOKIE)?.value;
  if (!isVoterSecret(secret)) return none;

  const admin = getAdminSupabase();
  if (!admin) return none;

  const { data, error } = await admin
    .from('votes')
    .select('option_id')
    .eq('poll_id', pollId)
    .eq('voter_token', voterToken(secret))
    .maybeSingle();

  if (error) {
    console.error('Vote status lookup failed:', { code: error.code });
    return none;
  }
  return data ? { hasVoted: true, optionId: data.option_id } : none;
}
