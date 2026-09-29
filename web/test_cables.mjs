import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: cables, error: err1 } = await supabase.from('cables').select('cable_type').limit(1);
  console.log("CABLES", err1);
  
  const { data: trommels, error: err3 } = await supabase.from('trommels').select('cable_type').limit(1);
  console.log("TROMMELS", err3);

  const { data: cats, error: err2 } = await supabase.from('cable_categories').select('name, projects!inner(company_id)').limit(1);
  console.log("CATS", err2, cats);
}

test();
