import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url!, key!);

async function check() {
  const planId = 'c1f34460-659f-4303-b928-8762bae47fb7';
  const { data: devs } = await supabase.from('bma_devices').select('name, project_id').eq('plan_id', planId).limit(5);
  console.log('Devices for plan:', planId);
  console.log(devs);
}
check();
