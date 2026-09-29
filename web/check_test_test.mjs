import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = 'db031d88-22d0-4e6f-8cf2-243177686302';
  const { data: markers } = await s.from('stromkreise').select('metadata').eq('plan_id', plan_id);
  console.log("Found", markers.length, "markers.");
  if (markers.length > 0) {
      const sigs = {};
      for (const m of markers) {
          const sig = m.metadata?.geometry_signature || 'Unknown';
          sigs[sig] = (sigs[sig] || 0) + 1;
      }
      console.log("Signatures:");
      console.log(sigs);
  }
}
run();
