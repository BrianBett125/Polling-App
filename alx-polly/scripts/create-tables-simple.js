// Simple script to create tables in Supabase
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTables() {
  try {
    // Create polls table
    console.log('Creating polls table...');
    const { error: pollsError } = await supabase.rpc('create_polls_table', {});
    
    if (pollsError) {
      console.error('Error creating polls table:', pollsError);
      
      // Try direct SQL execution
      console.log('Trying direct SQL execution...');
      const { error } = await supabase
        .from('_sql')
        .select('*')
        .eq('query', `
          CREATE TABLE IF NOT EXISTS public.polls (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title TEXT NOT NULL,
            description TEXT,
            created_by UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          CREATE TABLE IF NOT EXISTS public.poll_options (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            votes INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
      
      if (error) {
        console.error('Error with direct SQL execution:', error);
      } else {
        console.log('Tables created successfully via direct SQL!');
      }
    } else {
      console.log('Tables created successfully!');
    }
    
    // Test if tables exist
    const { data: polls, error: testError } = await supabase
      .from('polls')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('Error testing polls table:', testError);
    } else {
      console.log('Polls table exists and is accessible!');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createTables();