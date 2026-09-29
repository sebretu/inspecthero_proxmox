import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "a2f83bfb-98c5-4866-909d-8fbb8c672632";
  const { data: markers } = await s.from('stromkreise')
    .select('metadata')
    .eq('plan_id', plan_id)
    .order('created_at', { ascending: false })
    .limit(50);
    
  const sigs = {};
  for (const m of markers) {
      const sig = m.metadata?.geometry_signature || 'Unknown';
      sigs[sig] = (sigs[sig] || 0) + 1;
  }
  console.log("Latest markers signatures for new plan:");
  console.log(sigs);
}
run();
