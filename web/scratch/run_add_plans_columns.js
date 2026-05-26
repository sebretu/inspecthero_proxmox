const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSql() {
  console.log('Adding missing columns (min_zoom, magnification) to plans table...');
  
  const sql = `
    ALTER TABLE public.plans 
    ADD COLUMN IF NOT EXISTS min_zoom integer,
    ADD COLUMN IF NOT EXISTS magnification integer DEFAULT 0;

    -- Reload PostgREST schema cache
    NOTIFY pgrst, 'reload schema';
  `;

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Error running SQL via RPC:', error);
    return;
  }

  console.log('Successfully added columns and notified schema reload!');
}

runSql();
