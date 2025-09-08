'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { PollInsert, PollOptionInsert, Database } from './database.types';
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';

// Types and small utilities to standardize behavior across actions
type ActionError = { message: string };

type PollFormParsed = {
  title: string;
  description: string;
  options: { text: string }[];
};

/** Create a typed Supabase client for Server Actions */
async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerActionClient<Database>({ cookies: () => cookieStore });
}

/** Retrieve the best-effort client IP for auditing/deduplication */
async function getClientIp() {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  return forwardedFor ? forwardedFor.split(',')[0]!.trim() : '127.0.0.1';
}

/** Get current user (may be null) */
async function getCurrentUser(supabase: Awaited<ReturnType<typeof getServerSupabase>>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/** Ensure a user is authenticated, otherwise throw a standardized error */
async function requireUser(supabase: Awaited<ReturnType<typeof getServerSupabase>>) {
  const user = await getCurrentUser(supabase);
  if (!user) throw new Error('Not authenticated');
  return user;
}

/** Consistent error factory */
function actionFailure(message: string): never {
  throw new Error(message);
}

/** Extract and validate Poll creation form data */
function parseAndValidatePollForm(formData: FormData): PollFormParsed {
  const title = (formData.get('title') as string) ?? '';
  const description = (formData.get('description') as string) ?? '';

  const optionKeys = Array.from(formData.keys()).filter(k => k.startsWith('option-'));
  const options = optionKeys
    .map(k => (formData.get(k) as string) ?? '')
    .map(text => text.trim())
    .filter(Boolean)
    .map(text => ({ text }));

  if (!title || !title.trim()) actionFailure('Title is required');
  if (options.length < 2) actionFailure('At least two options are required');

  return { title: title.trim(), description, options };
}

/** Data helpers for polls */
async function insertPoll(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>, 
  poll: PollInsert
) {
  const { data, error } = await supabase
    .from('polls')
    .insert(poll)
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertPollOptions(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>, 
  options: PollOptionInsert[]
) {
  const { error } = await supabase
    .from('poll_options')
    .insert(options);
  if (error) throw error;
}

async function deletePollOwnedBy(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>, 
  pollId: string,
  userId: string
) {
  const { error } = await supabase
    .from('polls')
    .delete()
    .eq('id', pollId)
    .eq('created_by', userId);
  if (error) throw error;
}

async function updatePollOwnedBy(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>, 
  pollId: string,
  userId: string,
  payload: Pick<PollInsert, 'title' | 'description'>
) {
  const { error } = await supabase
    .from('polls')
    .update({ title: payload.title, description: payload.description })
    .eq('id', pollId)
    .eq('created_by', userId);
  if (error) throw error;
}

// Function to ensure tables exist
/**
 * DEVELOPMENT ONLY: Initializes base tables with a sample row if they are missing.
 * Not used in production; prefer running the SQL migrations in supabase/migrations.
 */
async function ensureTablesExist() {
  const cookieStore = await cookies();
  const supabase = createServerActionClient<Database>({ cookies: () => cookieStore });
  try {
    // Check if polls table exists
    const { error: pollsError } = await supabase.from('polls').select('id').limit(1);
    
    if (pollsError && pollsError.code === 'PGRST205') {
      console.log('Tables do not exist. Creating them...');
      
      // Create polls table using direct SQL
      const pollData: PollInsert = { 
        title: 'Sample Poll', 
        description: 'This is a sample poll to initialize the table',
        created_by: null 
      };
      
      const { data: pollsData, error: createPollsError } = await supabase
        .from('polls')
        .insert([pollData])
        .select();
      
      if (createPollsError) {
        console.error('Error creating polls table:', createPollsError);
      } else {
        console.log('Polls table created successfully!');
        
        // Create poll_options table by adding options to the sample poll
        if (pollsData && pollsData.length > 0) {
          const pollOptions: PollOptionInsert[] = [
            { poll_id: pollsData[0].id, text: 'Option 1', votes: 0 },
            { poll_id: pollsData[0].id, text: 'Option 2', votes: 0 }
          ];
          
          const { error: createOptionsError } = await supabase
            .from('poll_options')
            .insert(pollOptions);
          
          if (createOptionsError) {
            console.error('Error creating poll_options table:', createOptionsError);
          } else {
            console.log('Poll_options table created successfully!');
          }
        }
      }
    }
  } catch (error) {
    console.error('Error ensuring tables exist:', error);
    // Continue execution even if table creation fails
  }
}

// Function to vote for a poll option
/**
 * Registers a vote for a poll option using the `vote_for_option` Postgres function.
 * Reads the client IP from the x-forwarded-for header for deduplication/auditing and revalidates the poll detail page.
 * @param optionId - The UUID of the selected poll option.
 * @param pollId - The UUID of the poll being voted on.
 * @returns Success flag and the created vote id on success; otherwise a failure with message.
 */
export async function voteForOption(optionId: string, pollId: string) {
  const supabase = await getServerSupabase();
  try {
    const ipAddress = await getClientIp();
    
    // Call the Supabase function to register the vote
    const { data, error } = await supabase.rpc('vote_for_option', {
      p_option_id: optionId,
      p_poll_id: pollId,
      p_ip_address: ipAddress
    });
    
    if (error) throw error;
    
    // Revalidate the poll page to show updated vote counts
    revalidatePath(`/polls/${pollId}`);
    
    return { success: true, voteId: data } as const;
  } catch (error: any) {
    console.error('Error voting for option:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to register vote. Please try again.'
    } as const;
  }
}

export async function createPoll(formData: FormData) {
  const supabase = await getServerSupabase();
  const { title, description, options } = parseAndValidatePollForm(formData);
  
  let newPollId: string | null = null;
  try {
    // DO NOT auto-create tables here; assume migrations applied
    // Get current user if authenticated
    const user = await getCurrentUser(supabase);
    
    // Insert poll into database
    const pollData: PollInsert = {
      title,
      description,
      created_by: user?.id || null, // Allow null for anonymous users
    };
    
    const pollId = await insertPoll(supabase, pollData);
    newPollId = pollId;
    
    // Insert options
    const pollOptions: PollOptionInsert[] = options.map(option => ({
      poll_id: pollId,
      text: option.text,
      votes: 0,
    }));
    
    await insertPollOptions(supabase, pollOptions);
    
    // Revalidate the polls page to show the new poll
    revalidatePath('/polls');
  } catch (error: any) {
    console.error('Error creating poll:', error);
    actionFailure('Failed to create poll. Please try again.');
  }

  // Perform redirect OUTSIDE the try/catch so it is not swallowed
  if (newPollId) {
    return redirect(`/polls?created=1`);
  }
  
  actionFailure('Failed to create poll. Please try again.');
}

export async function deletePollAction(formData: FormData) {
  const supabase = await getServerSupabase();
  const pollId = formData.get('id') as string;

  if (!pollId) actionFailure('Missing poll id');

  // Ensure user is authenticated
  const user = await requireUser(supabase);

  try {
    // Restrict deletion to polls owned by the user
    await deletePollOwnedBy(supabase, pollId, user.id);
  } catch (error) {
    console.error('Error deleting poll:', error);
    actionFailure('Failed to delete poll');
  }

  revalidatePath('/polls');
}

export async function updatePollAction(formData: FormData) {
  const supabase = await getServerSupabase();
  const id = formData.get('id') as string;
  const title = ((formData.get('title') as string) || '').trim();
  const description = (formData.get('description') as string) || '';

  if (!id) actionFailure('Missing poll id');
  if (!title) actionFailure('Title is required');

  const user = await requireUser(supabase);

  try {
    await updatePollOwnedBy(supabase, id, user.id, { title, description });
  } catch (error) {
    console.error('Error updating poll:', error);
    actionFailure('Failed to update poll');
  }

  revalidatePath('/polls');
  revalidatePath(`/polls/${id}`);
  redirect('/polls');
}