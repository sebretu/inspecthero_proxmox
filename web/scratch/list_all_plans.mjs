import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: plans, error } = await supabase
    .from('plans')
    .select('*, projects(name), floors(name)');
  
  if (error) {
    console.error("Error fetching plans:", error);
    return;
  }
  
  console.log("Plans found in system:");
  for (const plan of plans) {
    console.log(`Plan ID: ${plan.id} | Floor: ${plan.floors?.name} | Project: ${plan.projects?.name} | Path: ${plan.storage_path}`);
  }
}

run().catch(console.error);
