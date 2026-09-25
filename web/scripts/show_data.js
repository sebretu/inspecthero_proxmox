import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://188.245.42.178:54321';
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const supabase = createClient(supabaseUrl, supabaseKey);

async function showData() {
  const tables = [
    'projects', 'project_members', 'plans', 'tasks', 'task_photos'
  ];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(5);
    if (error) {
      console.log(`Table ${table}: ERROR`, error.message);
    } else {
      console.log(`Table ${table}:`);
      console.table(data);
    }
  }
}

showData();
