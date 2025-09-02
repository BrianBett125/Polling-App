// Script to apply database schema to Supabase
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and key are required.');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to schema file
const schemaFilePath = path.join(__dirname, '..', 'supabase', 'migrations', '20250905_create_schema.sql');

async function applySchema() {
  try {
    // Check if schema file exists
    if (!fs.existsSync(schemaFilePath)) {
      console.error(`Schema file not found: ${schemaFilePath}`);
      process.exit(1);
    }

    // Read the SQL schema file
    const sql = fs.readFileSync(schemaFilePath, 'utf8');
    console.log('Applying database schema...');

    // Try to execute the SQL using Supabase's REST API
    try {
      // First attempt: Try using the exec_sql RPC function if available
      const { error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        console.error('Error applying schema using RPC:', error);
        console.log('The exec_sql function may not be available. Please apply the schema manually:');
        console.log('1. Go to your Supabase dashboard');
        console.log('2. Navigate to the SQL Editor');
        console.log('3. Copy and paste the contents of the schema file');
        console.log('4. Execute the SQL');
        
        // Output the schema file path for reference
        console.log(`\nSchema file path: ${schemaFilePath}`);
      } else {
        console.log('Database schema applied successfully!');
      }
    } catch (error) {
      console.error('Error executing SQL:', error);
      console.log('Please apply the schema manually through the Supabase dashboard.');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

applySchema();