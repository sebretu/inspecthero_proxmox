import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: session } = await supabase.from('aufmass_sessions').select('*').eq('name', 'Fragen Mieterausbauten').single();
  console.log("Session:", session);
}
run();
