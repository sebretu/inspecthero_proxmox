import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: plans } = await s.from('plans').select('id, name, floors!inner(id, project_id)').ilike('name', '%test%');
  console.log("Plans:", plans);
}
run();
