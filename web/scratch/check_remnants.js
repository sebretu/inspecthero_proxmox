const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllRemnants() {
  const { data, error } = await supabase
    .from('trommels')
    .select('id, name, cable_type, remnant_length, status, is_archived')
    .gt('remnant_length', 0);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Trommels with remnants > 0:', data);
}

checkAllRemnants();
