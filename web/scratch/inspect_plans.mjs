import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Fetching floors...");
  const { data: floors, error: floorsErr } = await supabase
    .from("floors")
    .select("*");

  if (floorsErr) {
    console.error(floorsErr);
    return;
  }

  console.log(`\n=== ALL FLOORS ===`);
  floors.forEach(f => {
    console.log(`Floor: "${f.name}" (ID: ${f.id})`);
  });

  console.log(`\n=== ALL PLANS ===`);
  const { data: plans, error: plansErr } = await supabase
    .from("plans")
    .select("*");

  if (plansErr) {
    console.error(plansErr);
    return;
  }

  for (const p of plans) {
    const floor = floors.find(f => f.id === p.floor_id);
    console.log(`Plan ID: ${p.id}`);
    console.log(`  Floor: "${floor?.name}" (FloorID: ${p.floor_id})`);
    console.log(`  Version: ${p.version}`);
    console.log(`  PDF Path: ${p.pdf_path}`);
    console.log(`  Storage Path: ${p.storage_path}`);
    console.log(`  Is Archived: ${p.is_archived}`);
    console.log(`  Deleted At: ${p.deleted_at}`);
  }
}

run();
