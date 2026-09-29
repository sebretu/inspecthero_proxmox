import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "db031d88-22d0-4e6f-8cf2-243177686302";
  const { data: plan } = await s.from('plans').select('project_id, floor_id').eq('id', plan_id).single();
  const url = `https://api.inspecthero.pl/storage/v1/object/authenticated/plans/projects/${plan.project_id}/floors/${plan.floor_id}/v1.pdf`;
  console.log("URL:", url);
}
run();
