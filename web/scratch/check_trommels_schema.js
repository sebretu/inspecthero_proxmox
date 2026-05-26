const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
  console.log('Checking trommels table schema...');
  const { data, error } = await supabase.rpc('get_table_columns', { table_name_input: 'trommels' });

  if (error) {
    console.log('RPC failed, trying a direct query to information_schema...');
    // Fallback to direct SQL if RPC doesn't exist
    const { data: cols, error: err2 } = await supabase.from('trommels').select('*').limit(1);
    if (err2) {
      console.error('Error fetching data from trommels:', err2);
    } else {
      console.log('Successfully fetched 1 row. Columns present in result:', Object.keys(cols[0] || {}));
    }
    return;
  }

  console.log('Columns:', data);
}

checkColumns();
