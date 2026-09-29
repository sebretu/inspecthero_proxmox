import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await supabase.from('aufmass_markers').select('x, y').order('x', { ascending: false }).limit(5);
  console.log('Max X:', data);
  const { data: d2 } = await supabase.from('aufmass_markers').select('x, y').order('y', { ascending: false }).limit(5);
  console.log('Max Y:', d2);
}
run();
