import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const planId = "633c788d-fe28-4f0d-97f1-87d2affe9021";
  const { data: markers, error } = await supabase
    .from('stromkreise')
    .select('id, type')
    .eq('plan_id', planId);
  
  if (error) {
    console.error("Error fetching markers:", error);
    return;
  }
  
  console.log(`Plan ${planId} currently has ${markers?.length || 0} markers in the DB.`);
}

run().catch(console.error);
