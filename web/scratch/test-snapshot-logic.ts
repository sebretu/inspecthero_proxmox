import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url!, key!);

async function check() {
  const planId = 'c1f34460-659f-4303-b928-8762bae47fb7';
  const { data: devices } = await supabase.from('bma_devices').select('id').eq('plan_id', planId);
  const deviceIds = devices?.map(d => d.id) || [];
  console.log(`Devices found for plan: ${deviceIds.length}`);

  const [bySource, byTarget] = await Promise.all([
    supabase.from('bma_routes').select('*').in('source_device_id', deviceIds),
    supabase.from('bma_routes').select('*').in('target_device_id', deviceIds)
  ]);

  console.log(`Routes by source: ${bySource.data?.length || 0}`);
  console.log(`Routes by target: ${byTarget.data?.length || 0}`);
  
  if (bySource.error) console.error('Source error:', bySource.error);
  if (byTarget.error) console.error('Target error:', byTarget.error);
}
check();
