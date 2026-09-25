const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'web/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const planId = 'c1f34460-659f-4303-b928-8762bae47fb7';
  
  const { data: devices } = await supabase.from('bma_devices').select('id').eq('plan_id', planId);
  const deviceIds = (devices || []).map(d => d.id);
  
  const { data: routes, error } = await supabase
    .from('bma_routes')
    .select('*')
    .in('source_device_id', deviceIds);

  if (error) {
    console.error(error);
    return;
  }

  console.log('PLAN_ID:', planId);
  console.log('DEVICE_IDS count:', deviceIds.length);
  console.log('ROUTES count:', routes.length);
  if (routes.length > 0) {
    console.log('SAMPLE ROUTE:', routes[0]);
  }
}

run();
