import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);
  
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'sebretu33@gmail.com',
    password: 'password123'
  });
  
  if (authErr) {
    console.error("Auth failed:", authErr.message);
    return;
  }
  
  const token = authData.session.access_token;
  console.log("Logged in successfully! Token obtained.");
  
  const res = await fetch('http://localhost:3005/api/plans?projectId=45558114-382e-4e5c-a277-2d5532c71f58&current=true', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!res.ok) {
    console.error("API request failed:", res.status, await res.text());
    return;
  }
  
  const body = await res.json();
  console.log("Plans returned by API:");
  console.log(JSON.stringify(body, null, 2));
}
main();
