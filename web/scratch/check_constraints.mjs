import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: projects } = await supabase.from('projects').select('id').limit(1);
  const projectId = projects[0].id;

  console.log(`Inserting test session with type 'bestellung'...`);
  const { data, error } = await supabase.from('aufmass_sessions').insert([{
    project_id: projectId,
    name: 'TEST_BESTELLUNG_CONSTRAINT_SUCCESS',
    session_type: 'bestellung',
    status: 'draft'
  }]).select();

  if (error) {
    console.error("Insert Error:", error);
  } else {
    console.log("Insert Success:", data);
    console.log("Deleting test session...");
    await supabase.from('aufmass_sessions').delete().eq('id', data[0].id);
    console.log("Deleted successfully.");
  }
}

run().catch(console.error);
