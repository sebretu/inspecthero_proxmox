const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'web/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: plans, error } = await supabase
    .from('plans')
    .select('id, floors(name)')
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  const found = plans.find(p => p.floors?.name?.includes('Gross Alles'));
  if (found) {
    console.log('FOUND:', found.id, found.floors.name);
  } else {
    console.log('NOT FOUND in:', plans.map(p => p.floors?.name).join(', '));
  }
}

run();
