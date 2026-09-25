import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: p } = await supabase.from('aufmass_sessions').select('id').limit(1);
  if (!p?.length) return console.log("no session");
  const session_id = p[0].id;

  const res = await fetch('http://localhost:3000/api/aufmass/versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id, data: [{type: 'test'}] })
  });
  const json = await res.json();
  console.log("Endpoint Response:", json);
}
run();
