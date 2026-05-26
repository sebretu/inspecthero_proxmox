import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data: p } = await supabase.from('aufmass_sessions').select('id').limit(1);
  if (!p?.length) return console.log("no session");
  const session_id = p[0].id;
  
  const { data, error } = await supabase.from('aufmass_versions').insert([{
      session_id,
      data: [{type: 'rect'}]
    }]).select().single();
  console.log("Data:", data, "Error:", error);
}
run();
