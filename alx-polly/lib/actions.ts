'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { PollInsert, PollOptionInsert, Database } from './database.types';
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';

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
  const cookieStore = await cookies();
  const supabase = createServerActionClient<Database>({ cookies: () => cookieStore });
  try {
    // Get client IP address from headers
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : '127.0.0.1';
    
    // Call the Supabase function to register the vote
    const { data, error } = await supabase.rpc('vote_for_option', {
      p_option_id: optionId,
      p_poll_id: pollId,
      p_ip_address: ipAddress
    });
    
    if (error) throw error;
    
    // Revalidate the poll page to show updated vote counts
    revalidatePath(`/polls/${pollId}`);
    
    return { success: true, voteId: data };
  } catch (error: any) {
    console.error('Error voting for option:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to register vote. Please try again.'
    };
  }
}

export async function createPoll(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient<Database>({ cookies: () => cookieStore });
  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  
  // Get all options from form data
  const optionKeys = Array.from(formData.keys())
    .filter(key => key.startsWith('option-'));
  
  const options = optionKeys
    .map(key => formData.get(key) as string)
    .filter(option => option.trim() !== '')
    .map(text => ({ text }));
  
  // Validate form data
  if (!title || title.trim() === '') {
    throw new Error('Title is required');
  }
  
  if (options.length < 2) {
    throw new Error('At least two options are required');
  }
  
  let newPollId: string | null = null;
  try {
    // DO NOT auto-create tables here; assume migrations applied
    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    // Insert poll into database
    const pollData: PollInsert = {
      title,
      description,
      created_by: user?.id || null, // Allow null for anonymous users
    };
    
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert(pollData)
      .select('id')
      .single();
    
    if (pollError) throw pollError;
    newPollId = poll.id;
    
    // Insert options
    const pollOptions: PollOptionInsert[] = options.map(option => ({
      poll_id: poll.id,
      text: option.text,
      votes: 0,
    }));
    
    const { error: optionsError } = await supabase
      .from('poll_options')
      .insert(pollOptions);
    
    if (optionsError) throw optionsError;
    
    // Revalidate the polls page to show the new poll
    revalidatePath('/polls');
  } catch (error: any) {
    console.error('Error creating poll:', error);
    throw new Error('Failed to create poll. Please try again.');
  }

  // Perform redirect OUTSIDE the try/catch so it is not swallowed
  if (newPollId) {
    return redirect(`/polls?created=1`);
  }
  
  throw new Error('Failed to create poll. Please try again.');
}

export async function deletePollAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient<Database>({ cookies: () => cookieStore });
  const pollId = formData.get('id') as string;

  if (!pollId) throw new Error('Missing poll id');

  // Ensure user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Restrict deletion to polls owned by the user
  const { error } = await supabase
    .from('polls')
    .delete()
    .eq('id', pollId)
    .eq('created_by', user.id);

  if (error) {
    console.error('Error deleting poll:', error);
    throw new Error('Failed to delete poll');
  }

  revalidatePath('/polls');
}

export async function updatePollAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient<Database>({ cookies: () => cookieStore });
  const id = formData.get('id') as string;
  const title = (formData.get('title') as string) || '';
  const description = (formData.get('description') as string) || '';

  if (!id) throw new Error('Missing poll id');
  if (!title.trim()) throw new Error('Title is required');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('polls')
    .update({ title, description })
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) {
    console.error('Error updating poll:', error);
    throw new Error('Failed to update poll');
  }

  revalidatePath('/polls');
  revalidatePath(`/polls/${id}`);
  redirect('/polls');
}