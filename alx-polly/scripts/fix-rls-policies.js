// Script to fix RLS policies for anonymous poll creation
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
let supabaseUrl, supabaseKey;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n');
  
  for (const line of envLines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1];
    } else if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
      supabaseKey = line.split('=')[1];
    }
  }
}

// Fallback to process.env if not found in file
supabaseUrl = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
supabaseKey = supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and anon key are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixRlsPolicies() {
  try {
    console.log('Updating RLS policies to allow anonymous poll creation...');
    
    // SQL to update the RLS policies
    const sql = `
      -- Drop existing policies
      DROP POLICY IF EXISTS "Polls can be created by authenticated users." ON public.polls;
      DROP POLICY IF EXISTS "Poll options can be created by authenticated users." ON public.poll_options;
      
      -- Create updated policies that allow anonymous users
      CREATE POLICY "Polls can be created by authenticated or anonymous users." 
        ON public.polls FOR INSERT 
        TO authenticated, anon 
        WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
      
      CREATE POLICY "Poll options can be created by authenticated or anonymous users." 
        ON public.poll_options FOR INSERT 
        TO authenticated, anon 
        WITH CHECK (poll_id IN (SELECT id FROM public.polls WHERE created_by = auth.uid() OR created_by IS NULL));
    `;
    
    // Execute the SQL directly
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      // If exec_sql RPC doesn't exist, try direct SQL execution
      console.error('Error updating RLS policies:', error);
      console.log('Trying alternative approach...');
      
      // Try to execute SQL statements one by one using raw queries
      // Note: This might not work with all Supabase configurations
      const { error: dropError } = await supabase
        .from('_sql')
        .select('*')
        .eq('query', 'DROP POLICY IF EXISTS "Polls can be created by authenticated users." ON public.polls;');
      
      if (dropError) {
        console.error('Cannot execute raw SQL. Please update RLS policies manually in the Supabase dashboard.');
        console.log('Instructions:');
        console.log('1. Go to your Supabase dashboard');
        console.log('2. Navigate to Authentication > Policies');
        console.log('3. Update the INSERT policy for the "polls" table to allow created_by IS NULL');
        console.log('4. Update the INSERT policy for the "poll_options" table similarly');
        process.exit(1);
      }
      
      // Continue with other statements if the first one worked
      // ...
    } else {
      console.log('RLS policies updated successfully!');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixRlsPolicies();