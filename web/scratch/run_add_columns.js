const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSql() {
  console.log('Adding missing columns...');
  
  const sql = `
    ALTER TABLE trommels 
    ADD COLUMN IF NOT EXISTS pickup_requested_at timestamptz,
    ADD COLUMN IF NOT EXISTS pickup_requested_email_sent boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS pickup_email_sent boolean DEFAULT false;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Error running SQL via RPC:', error);
    console.log('Trying to run via REST API (this might fail if not allowed)...');
    // If RPC fails, we can't really run arbitrary SQL via REST unless there's a specific endpoint.
    return;
  }

  console.log('Success!');
}

runSql();
