// Script to create tables in Supabase
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read the SQL migration file
const sqlFilePath = path.join(__dirname, '..', 'supabase', 'migrations', '20250902_create_polls_tables.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

async function createTables() {
  try {
    // Execute the SQL directly using the Supabase client
    const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      console.error('Error creating tables:', error);
      process.exit(1);
    }
    
    console.log('Tables created successfully!');
  } catch (error) {
    console.error('Error executing SQL:', error);
    process.exit(1);
  }
}

// Alternative approach using individual statements
async function createTablesManually() {
  try {
    console.log('Creating polls table...');
    const { error: pollsError } = await supabase.from('polls').select().limit(1);
    
    if (pollsError && pollsError.code === 'PGRST205') {
      // Table doesn't exist, create it
      const { error } = await supabase.rpc('exec_sql', { 
        sql: `
          CREATE TABLE IF NOT EXISTS public.polls (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title TEXT NOT NULL,
            description TEXT,
            created_by UUID REFERENCES auth.users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });
      
      if (error) {
        console.error('Error creating polls table:', error);
        return;
      }
      
      console.log('Polls table created successfully!');
    } else {
      console.log('Polls table already exists.');
    }
    
    console.log('Creating poll_options table...');
    const { error: optionsError } = await supabase.from('poll_options').select().limit(1);
    
    if (optionsError && optionsError.code === 'PGRST205') {
      // Table doesn't exist, create it
      const { error } = await supabase.rpc('exec_sql', { 
        sql: `
          CREATE TABLE IF NOT EXISTS public.poll_options (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            votes INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });
      
      if (error) {
        console.error('Error creating poll_options table:', error);
        return;
      }
      
      console.log('Poll_options table created successfully!');
    } else {
      console.log('Poll_options table already exists.');
    }
    
    console.log('All tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

// Try both approaches
async function run() {
  try {
    await createTables();
  } catch (error) {
    console.log('Falling back to manual table creation...');
    await createTablesManually();
  }
}

run();