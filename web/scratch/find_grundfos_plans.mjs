import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: plans, error } = await supabase
    .from('plans')
    .select('id, project_id, floor_id, pdf_path, storage_path');
  
  if (error) {
    console.error("Error fetching plans:", error);
    return;
  }
  
  console.log("All plans in DB:");
  for (const plan of plans) {
    console.log(`- ID: ${plan.id} | Project ID: ${plan.project_id} | Floor ID: ${plan.floor_id} | PDF Path: ${plan.pdf_path} | Storage Path: ${plan.storage_path}`);
  }
}

run().catch(console.error);
