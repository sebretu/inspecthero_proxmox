import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: plan } = await supabase.from('plans').select('*').eq('id', '633c788d-fe28-4f0d-97f1-87d2affe9021').single();
  console.log("Plan:", plan);
}
run();
