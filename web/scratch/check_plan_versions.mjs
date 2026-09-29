import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PLAN_ID = "990da539-ab71-42da-a501-45bf840a8d99";

async function run() {
  const { data: versions, error } = await supabase
    .from('plan_versions')
    .select('*')
    .eq('plan_id', PLAN_ID);
  
  if (error) {
    console.error("Error fetching versions:", error);
    return;
  }
  
  console.log("Versions for plan:", PLAN_ID);
  for (const v of versions) {
    console.log(`Version ID: ${v.id} | Status: ${v.status} | File URL: ${v.file_url} | Created At: ${v.created_at}`);
  }
}

run().catch(console.error);
