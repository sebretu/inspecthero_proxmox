import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); // or whichever has the keys

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || process.env.SUPABASE_KEY;
  
  if (!key) {
    console.error("Missing service key");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  
  console.log("Fetching users from auth...");
  const { data: usersData, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error("Auth error:", authErr);
    return;
  }
  
  console.log(`Found ${usersData.users.length} users. Syncing to profiles...`);
  let synced = 0;
  for (const u of usersData.users) {
    const { error } = await supabase.from('profiles').upsert({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || u.email,
      role: u.user_metadata?.role || 'USER',
      company_id: u.user_metadata?.company_id || '65d8b8df-b0ed-4bac-ad6d-ef1409219208',
      is_active: true
    }, { onConflict: 'id' });
    
    if (error) {
      console.error(`Failed to sync ${u.email}:`, error);
    } else {
      synced++;
    }
  }
  console.log(`Successfully synced ${synced}/${usersData.users.length} users.`);
}

main();
