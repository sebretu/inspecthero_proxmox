const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('/home/ubuntu/building-task-manager/web/.env.local', 'utf8');
const anonKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];

const supabase = createClient(url, anonKey);

async function main() {
  const { data, error } = await supabase.from('plans').select('id, name, floors(name, buildings(name))').ilike('name', '%test%');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
main();
