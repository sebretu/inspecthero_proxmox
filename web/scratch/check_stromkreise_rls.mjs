import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { table_name: 'stromkreise' });
  console.log("Stromkreise policies:", data);
  const { data: d2 } = await supabase.rpc('get_policies_for_table', { table_name: 'stromkreis_snapshots' });
  console.log("Snapshots policies:", d2);
}

main();
