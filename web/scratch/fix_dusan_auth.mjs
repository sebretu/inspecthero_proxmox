import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || process.env.SUPABASE_KEY;
  const supabase = createClient(url, key);
  
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error(error);
    return;
  }
  
  for (const u of data.users) {
    if (u.role === "") {
      console.log(`Fixing role for ${u.email}`);
      const { error: updateErr } = await supabase.auth.admin.updateUserById(u.id, { role: "authenticated" });
      if (updateErr) console.error("Failed to update", u.email, updateErr);
      else console.log("Fixed", u.email);
    }
  }
}
main();
