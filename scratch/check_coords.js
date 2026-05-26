const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'web/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: devices, error } = await supabase
    .from('bma_devices')
    .select('x, y')
    .eq('plan_id', 'c1f34460-659f-4303-b928-8762bae47fb7')
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  console.log('DEVICES:', devices);
}

run();
