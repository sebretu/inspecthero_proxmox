import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || process.env.SUPABASE_KEY;
  const supabase = createClient(url, key);
  
  const { data, error } = await supabase.from('profiles').select('email, role, company_id').like('email', '%dusan%');
  if (error) console.error(error);
  else console.log(data);
}
main();
