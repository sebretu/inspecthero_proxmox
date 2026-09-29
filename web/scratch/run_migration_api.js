const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = `
    ALTER TABLE public.aufmass_sessions DROP CONSTRAINT IF EXISTS aufmass_sessions_session_type_check;
    ALTER TABLE public.aufmass_sessions ADD CONSTRAINT aufmass_sessions_session_type_check CHECK (session_type IN ('aufmass', 'zusatz', 'baubehinderung', 'bestellung'));
    NOTIFY pgrst, 'reload schema';
  `;
  console.log("Executing DDL via Supabase RPC...");
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error("SQL execution error:", error);
  } else {
    console.log("SQL execution success! Constraint updated!");
  }
}

run();
