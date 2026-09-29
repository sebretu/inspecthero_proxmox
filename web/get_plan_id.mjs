import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: plans } = await s.from('plans').select('id, name').ilike('name', '%test%');
  console.log(plans);
  
  for (const p of plans) {
    const { data: m } = await s.from('stromkreise').select('id, circuit_code').eq('plan_id', p.id);
    console.log(`Plan ${p.name} (${p.id}) has ${m.length} markers`);
  }
}
run();
