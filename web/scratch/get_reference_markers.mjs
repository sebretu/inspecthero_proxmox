import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PLAN_ID = "990da539-ab71-42da-a501-45bf840a8d99"; // EG plan

async function run() {
  console.log(`Fetching markers for plan ${PLAN_ID}...`);
  const { data: markers, error } = await supabase
    .from('stromkreise')
    .select('*')
    .eq('plan_id', PLAN_ID);
  
  if (error) {
    console.error("Error fetching markers:", error);
    return;
  }
  
  console.log(`Found ${markers.length} markers on Halle 3 Grundfos EG.`);
  const destPath = path.join("/home/ubuntu/building-task-manager/web/scratch", "grundfos_eg_markers.json");
  fs.writeFileSync(destPath, JSON.stringify(markers, null, 2));
  console.log(`Saved markers to ${destPath}`);
}

run().catch(console.error);
