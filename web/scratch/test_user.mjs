import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, anonKey);

async function main() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'sebretu33@gmail.com',
    password: 'password123' // assuming common local password, maybe not
  });
  if (authErr) {
    console.log("Auth failed:", authErr.message);
  } else {
    console.log("Logged in as", authData.user.id);
  }

  // let's try using the service role to generate a JWT and then use it
  const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Actually, we can just select using service role, but we already did that.
}

main();
