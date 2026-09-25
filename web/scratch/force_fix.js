const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function forceUpdate() {
  const { error } = await supabase
    .from('trommels')
    .update({ remnant_length: 20, status: 'empty' })
    .eq('id', '45818db9-7544-4388-8615-a5c95f6bdf6a');

  if (error) console.error(error);
  else console.log('Successfully updated Mennekes Hallen Trommel 2 with 20m remnant.');
}

forceUpdate();
