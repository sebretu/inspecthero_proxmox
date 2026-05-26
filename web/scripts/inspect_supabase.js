import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://188.245.42.178:54321';
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTables() {
  const tables = [
    'companies', 'profiles', 'projects', 'project_members', 'buildings', 'floors', 'plans', 'tasks'
  ];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table}: ERROR`, error.message);
    } else {
      console.log(`Table ${table}: OK, columns:`, data && data.length > 0 ? Object.keys(data[0]) : 'no rows');
    }
  }
}

inspectTables();
