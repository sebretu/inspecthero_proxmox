import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: plans, error } = await supabase
    .from('plans')
    .select('*, floors(name, buildings(name, projects(name)))');
  
  if (error) {
    console.error("Error fetching plans:", error);
    return;
  }
  
  console.log("Searching for plans related to 'test':");
  for (const plan of plans) {
    const projName = plan.floors?.buildings?.projects?.name || "";
    const floorName = plan.floors?.name || "";
    const buildingName = plan.floors?.buildings?.name || "";
    const path = plan.pdf_path || "";
    const storagePath = plan.storage_path || "";

    if (
      projName.toLowerCase().includes("test") ||
      floorName.toLowerCase().includes("test") ||
      buildingName.toLowerCase().includes("test") ||
      path.toLowerCase().includes("test") ||
      storagePath.toLowerCase().includes("test")
    ) {
      // Get number of markers in the DB for this plan
      const { data: markers } = await supabase
        .from('stromkreise')
        .select('id')
        .eq('plan_id', plan.id);
        
      console.log(`- ID: ${plan.id}`);
      console.log(`  Project: ${projName} | Building: ${buildingName} | Floor: ${floorName}`);
      console.log(`  PDF Path: ${path} | Storage Path: ${storagePath}`);
      console.log(`  Markers in DB: ${markers?.length || 0}`);
    }
  }
}

run().catch(console.error);
