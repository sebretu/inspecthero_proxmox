import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('stromkreis_snapshots').select('id, name, project_id, plan_id, created_at').order('created_at', { ascending: false });
  console.log("Snapshots:", data);
}

main();
