import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "6bc1c9a5-9669-436f-83d6-64f8389a820a";
  const { data: markers } = await s.from('stromkreise')
    .select('x_norm, y_norm, circuit_code')
    .eq('plan_id', plan_id);
    
  fs.writeFileSync('/tmp/markers_truth_final.json', JSON.stringify(markers, null, 2));
  console.log(`Dumped ${markers.length} markers to /tmp/markers_truth_final.json`);
}
run();
