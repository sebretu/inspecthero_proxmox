import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: session } = await supabase.from('aufmass_sessions').select('id, name, plan_id').eq('name', 'Fragen Mieterausbauten').single();
  const { data: plan } = await supabase.from('plans').select('id, image_path, file_path').eq('id', session.plan_id).single();
  console.log("Plan:", plan);
}
run();
