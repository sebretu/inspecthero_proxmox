const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = `
    ALTER TABLE public.plans 
    ADD COLUMN IF NOT EXISTS min_zoom integer,
    ADD COLUMN IF NOT EXISTS magnification integer DEFAULT 0;

    NOTIFY pgrst, 'reload schema';
  `;
  console.log("Executing SQL via Supabase RPC...");
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error("SQL execution error:", error);
  } else {
    console.log("SQL execution success! Checking columns in 'plans' table...");
    const { data: plans, error: fetchError } = await supabase.from('plans').select('*').limit(1);
    if (fetchError) {
      console.error("Fetch error:", fetchError);
    } else if (plans && plans.length > 0) {
      console.log("Plans columns now:", Object.keys(plans[0]));
    } else {
      console.log("No plans found to show columns, but alter table succeeded!");
    }
  }
  process.exit(0);
}
run();
