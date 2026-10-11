import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ResultsVisibility } from './database.types';

/** One option as the public poll page sees it. `votes` is null while the owner hides results. */
export type PublicPollOption = {
  id: string;
  text: string;
  position: number;
  created_at: string;
  votes: number | null;
};

/** What `get_poll(poll_id)` returns: everything a visitor holding the link may see. */
export type PublicPoll = {
  id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  closes_at: string | null;
  closed_at: string | null;
  /** closed_at set, or closes_at in the past, decided by the database clock. */
  is_closed: boolean;
  require_login: boolean;
  results_visibility: ResultsVisibility;
  /** True when counts are withheld from this viewer (option.votes are all null). */
  results_hidden: boolean;
  /** True when the caller is signed in as the poll's owner. */
  is_owner: boolean;
  options: PublicPollOption[];
};

/**
 * Loads one poll through the database function, which is the only public read path
 * (polls are not listable with the public API key). Returns `poll: null` when the id is
 * unknown or deleted, and `error` when the call itself failed.
 */
export async function getPublicPoll(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ poll: PublicPoll | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await supabase.rpc('get_poll', { p_poll_id: id });
  if (error) return { poll: null, error };
  return { poll: (data as PublicPoll | null) ?? null, error: null };
}

/** Numbers for ResultsList: treats hidden counts as zero (the list is not rendered when hidden). */
export function optionsForResults(poll: PublicPoll): { id: string; text: string; votes: number }[] {
  return poll.options.map((o) => ({ id: o.id, text: o.text, votes: o.votes ?? 0 }));
}
