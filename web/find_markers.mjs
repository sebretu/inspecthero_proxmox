import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: markers } = await s.from('stromkreise').select('plan_id, circuit_code');
  
  const counts = {};
  for (const m of markers) {
      counts[m.plan_id] = (counts[m.plan_id] || 0) + 1;
  }
  
  for (const [plan_id, count] of Object.entries(counts)) {
      console.log(`Plan ${plan_id} has ${count} markers.`);
  }
}
run();
