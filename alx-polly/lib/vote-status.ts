import { cookies } from 'next/headers';
import { getAdminSupabase, getCurrentUser, getServerSupabase } from './supabase-server';
import { VOTER_COOKIE, verifyVoterCookie, voterToken } from './voter';

export type VoteStatus = { hasVoted: boolean; optionId: string | null };

type Admin = NonNullable<ReturnType<typeof getAdminSupabase>>;

/** Signed-in viewer's id, or null. Any failure counts as signed out. */
async function viewerId(): Promise<string | null> {
  try {
    return (await getCurrentUser(await getServerSupabase()))?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Login-only polls allow one vote per account across browsers, so a signed-in viewer who
 * voted elsewhere must see "voted" here too. Anonymous polls stay cookie-only.
 */
async function accountVote(admin: Admin, pollId: string, userId: string): Promise<VoteStatus | null> {
  const poll = await admin.from('polls').select('require_login').eq('id', pollId).maybeSingle();
  if (poll.error || !poll.data?.require_login) return null;
  const vote = await admin
    .from('votes')
    .select('option_id')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (vote.error) {
    console.error('Account vote lookup failed:', { code: vote.error.code });
    return null;
  }
  return vote.data ? { hasVoted: true, optionId: vote.data.option_id } : null;
}

/**
 * Whether this browser (or, on login-only polls, this account) already voted, and for which option.
 * Reads the private votes table with the service role, keyed by the hashed cookie
 * secret. When that cannot be checked (no cookie yet, or a database error) the
 * answer is "not voted"; the database still rejects a duplicate on submit.
 */
export async function getVoteStatus(pollId: string): Promise<VoteStatus> {
  const none = { hasVoted: false, optionId: null };
  const admin = getAdminSupabase();
  if (!admin) return none;

  const secret = await verifyVoterCookie((await cookies()).get(VOTER_COOKIE)?.value);
  if (secret) {
    const { data, error } = await admin
      .from('votes')
      .select('option_id')
      .eq('poll_id', pollId)
      .eq('voter_token', voterToken(secret))
      .maybeSingle();

    if (error) {
      console.error('Vote status lookup failed:', { code: error.code });
    } else if (data) {
      return { hasVoted: true, optionId: data.option_id };
    }
  }

  const userId = await viewerId();
  if (!userId) return none;
  return (await accountVote(admin, pollId, userId)) ?? none;
}
