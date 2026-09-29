import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "a2f83bfb-98c5-4866-909d-8fbb8c672632";
  const { data: markers } = await s.from('stromkreise')
    .select('created_at, updated_at, x_norm, y_norm, circuit_code')
    .eq('plan_id', plan_id);
    
  console.log(`Current markers on plan: ${markers.length}`);
  for (const m of markers) {
     console.log(`Marker ${m.circuit_code} at (${m.x_norm.toFixed(4)}, ${m.y_norm.toFixed(4)}) - updated: ${m.updated_at}`);
  }
}
run();
