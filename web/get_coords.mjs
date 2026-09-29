import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const plan_id = "86ec8e25-655a-4fac-b77b-e650ba17f6c0";
  const { data: markers } = await s.from('stromkreise')
    .select('x_norm, y_norm, short_label, circuit_code, metadata')
    .eq('plan_id', plan_id)
    .eq('circuit_code', '1F1.1');
    
  console.log("Found:", markers);
  
  if (markers.length > 0) {
      const { data: plan } = await s.from('plans').select('project_id, floor_id').eq('id', plan_id).single();
      console.log(`URL: https://api.inspecthero.pl/storage/v1/object/authenticated/plans/projects/${plan.project_id}/floors/${plan.floor_id}/v1.pdf`);
  }
}
run();
