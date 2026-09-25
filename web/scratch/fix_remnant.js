const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixTrommel() {
  console.log('Searching for trommels with cable_type containing nyy-j 5x16...');
  const { data, error } = await supabase
    .from('trommels')
    .select('id, name, cable_type, remnant_length, status')
    .ilike('cable_type', '%nyy-j 5x16%');

  if (error) {
    console.error('Error fetching trommels:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No matching trommels found.');
    return;
  }

  console.log('Found:', data);

  for (const tr of data) {
    if (tr.remnant_length === null) {
      console.log(`Updating trommel ${tr.id} (${tr.name}) to have 20m remnant...`);
      const { error: updateError } = await supabase
        .from('trommels')
        .update({ remnant_length: 20, status: 'empty' })
        .eq('id', tr.id);

      if (updateError) {
        console.error(`Error updating ${tr.id}:`, updateError);
      } else {
        console.log(`Successfully updated ${tr.id}.`);
      }
    }
  }
}

fixTrommel();
