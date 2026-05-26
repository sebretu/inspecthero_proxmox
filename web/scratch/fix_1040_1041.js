const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixTrommels() {
  console.log('Searching for trommels 1040 and 1041...');
  const { data, error } = await supabase
    .from('trommels')
    .select('id, name, index_number, remnant_length, status')
    .in('index_number', [1040, 1041]);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Found:', data);
  
  const tr1040 = data.find(t => t.index_number === 1040);
  const tr1041 = data.find(t => t.index_number === 1041);

  if (tr1041 && tr1041.remnant_length > 0) {
    console.log('Clearing remnant from 1041...');
    await supabase.from('trommels').update({ remnant_length: null, status: 'delivered' }).eq('id', tr1041.id);
  }

  if (tr1040) {
    console.log('Setting remnant 20m on 1040...');
    await supabase.from('trommels').update({ remnant_length: 20, status: 'empty' }).eq('id', tr1040.id);
  }
  
  console.log('Done.');
}

fixTrommels();
