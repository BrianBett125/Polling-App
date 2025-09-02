// Script to apply database migrations
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and service role key are required.');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to migrations directory
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

// Function to apply a migration file
async function applyMigration(filePath) {
  try {
    console.log(`Applying migration: ${path.basename(filePath)}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Execute the SQL using Supabase's RPC call
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error(`Error applying migration ${path.basename(filePath)}:`, error);
      return false;
    }
    
    console.log(`Successfully applied migration: ${path.basename(filePath)}`);
    return true;
  } catch (error) {
    console.error(`Error reading or applying migration ${path.basename(filePath)}:`, error);
    return false;
  }
}

// Function to apply all migrations
async function applyAllMigrations() {
  try {
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      console.error(`Migrations directory not found: ${migrationsDir}`);
      return;
    }
    
    // Get all SQL files in the migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations are applied in order
    
    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }
    
    console.log(`Found ${files.length} migration files.`);
    
    // Create a function to execute raw SQL if RPC method is not available
    const createExecSqlFunction = async () => {
      const createFunctionSql = `
        CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$
        BEGIN
          EXECUTE sql;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `;
      
      const { error } = await supabase.from('_rpc').select('*').limit(1);
      
      if (error) {
        // Try to create the function directly
        const { error: execError } = await supabase.rpc('exec_sql', { 
          sql: createFunctionSql 
        });
        
        if (execError) {
          console.log('Creating exec_sql function...');
          // If RPC fails, we need to use raw REST API to execute SQL
          const response = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            },
            body: JSON.stringify({
              query: createFunctionSql
            })
          });
          
          if (!response.ok) {
            console.error('Failed to create exec_sql function:', await response.text());
            return false;
          }
        }
      }
      
      return true;
    };
    
    // Create the exec_sql function if needed
    const functionCreated = await createExecSqlFunction();
    if (!functionCreated) {
      console.error('Failed to create exec_sql function. Cannot proceed with migrations.');
      return;
    }
    
    // Apply each migration file
    let successCount = 0;
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const success = await applyMigration(filePath);
      if (success) successCount++;
    }
    
    console.log(`Applied ${successCount} out of ${files.length} migrations.`);
  } catch (error) {
    console.error('Error applying migrations:', error);
  }
}

// Run the migration process
applyAllMigrations().then(() => {
  console.log('Migration process completed.');
  process.exit(0);
}).catch(error => {
  console.error('Migration process failed:', error);
  process.exit(1);
});