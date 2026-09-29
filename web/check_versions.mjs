import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await s.from('plan_versions').select('*').eq('plan_id', '10a04057-48f6-4e0a-aa7e-5e99caf6beaf').eq('status', 'active');
  console.log(data);
}
run();
