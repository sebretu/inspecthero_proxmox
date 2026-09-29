import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s
    .from('stromkreise')
    .select('id, x_norm, y_norm, type')
    .eq('plan_id', '1d5e5455-5baf-47c1-86a0-567e5fedc58b')
    .limit(10);
  console.log("Error:", error);
  console.log("Markers for plan 1d5e5455-5baf-47c1-86a0-567e5fedc58b:");
  console.log(data);
  
  const { count } = await s
    .from('stromkreise')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', '1d5e5455-5baf-47c1-86a0-567e5fedc58b');
  console.log("Total markers:", count);
}
run();
