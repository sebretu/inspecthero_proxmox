import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { table_name: 'stromkreis_snapshots' });
  if (error) {
    console.log("No RPC, using raw query");
    // We can't do raw queries directly with supabase-js easily unless we use postgres connection
    // But we can just use `psql` if we have connection string.
  } else {
    console.log("Policies:", data);
  }
}

main();
