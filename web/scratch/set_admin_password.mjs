import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || process.env.SUPABASE_KEY;
  const supabase = createClient(url, key);
  
  const { data, error } = await supabase.auth.admin.updateUserById(
    'f98a1615-8314-416f-a5ff-c1092f6acbeb',
    { password: 'password123' }
  );
  if (error) {
    console.error("Failed to update password:", error);
  } else {
    console.log("Password updated successfully for sebretu33@gmail.com!");
  }
}
main();
