const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('/home/ubuntu/building-task-manager/web/.env.local', 'utf8');
const anonKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];

const supabase = createClient(url, anonKey);

async function main() {
  const planId = '7a3ad1cb-8144-4902-8119-3ea23950abef';
  const { data, error } = await supabase.from('stromkreise').delete().eq('plan_id', planId);
  if (error) console.error(error);
  else console.log('Deleted markers for plan_id:', planId);
}
main();
