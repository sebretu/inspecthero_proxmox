import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "a2f83bfb-98c5-4866-909d-8fbb8c672632";
  const { data: markers } = await s.from('stromkreise')
    .select('created_at, x_norm, y_norm, circuit_code, metadata')
    .eq('plan_id', plan_id)
    .order('created_at', { ascending: false })
    .limit(200);
    
  if (markers.length === 0) {
      console.log("No markers found.");
      return;
  }
  
  const latest_time = new Date(markers[0].created_at);
  console.log(`Latest marker time: ${latest_time.toISOString()}`);
  
  let count = 0;
  for (const m of markers) {
     const m_time = new Date(m.created_at);
     if (latest_time - m_time < 5000) { // within 5 seconds of the latest
         console.log(`Marker ${m.circuit_code} at (${m.x_norm.toFixed(4)}, ${m.y_norm.toFixed(4)}) - sig: ${m.metadata?.geometry_signature}`);
         count++;
     }
  }
  console.log(`Total markers in the latest run: ${count}`);
}
run();
