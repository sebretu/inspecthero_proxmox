import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "a2f83bfb-98c5-4866-909d-8fbb8c672632";
  const { data: markers } = await s.from('stromkreise')
    .select('x_norm, y_norm, circuit_code')
    .eq('plan_id', plan_id);
    
  fs.writeFileSync('/tmp/markers.json', JSON.stringify(markers, null, 2));
  console.log(`Dumped ${markers.length} markers to /tmp/markers.json`);
}
run();
