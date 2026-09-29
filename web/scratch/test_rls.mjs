import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: snaps } = await supabase.from('stromkreis_snapshots').select('project_id').limit(1);
  if (!snaps || !snaps.length) return console.log("no snaps");
  const pid = snaps[0].project_id;
  
  const { data: pm } = await supabase.from('project_members').select('*').eq('project_id', pid);
  console.log("Project members for", pid, ":", pm);
  
  const { data: usrs } = await supabase.auth.admin.listUsers();
  console.log("Users:", usrs.users.map(u => ({ id: u.id, email: u.email })));
}

main();
