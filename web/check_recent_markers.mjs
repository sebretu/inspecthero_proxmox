import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = '3f8b08ff-b74f-49ae-83ae-4437e18771de';
  const { data: markers, error } = await s.from('stromkreise').select('id, x_norm, y_norm, circuit_code').eq('plan_id', plan_id).limit(10);
  console.log("Markers for plan:", plan_id);
  console.log(markers);
}
run();
