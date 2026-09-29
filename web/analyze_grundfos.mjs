import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: plans } = await s
    .from('plans')
    .select('id, name, floors!inner(name, projects!inner(name))')
    .ilike('name', '%halle%3%');
    
  console.log("Found plans matching 'halle 3':");
  for (const p of plans || []) {
     console.log(`Plan ID: ${p.id}, Name: ${p.name}`);
     
     // Fetch markers for this plan
     const { data: markers } = await s
       .from('stromkreise')
       .select('id, circuit_code, short_label, phase, type')
       .eq('plan_id', p.id);
       
     if (markers && markers.length > 0) {
        console.log(`  Found ${markers.length} markers.`);
        
        // Count circuits
        const circuits = {};
        for (const m of markers) {
           const code = m.circuit_code || "Unknown";
           circuits[code] = (circuits[code] || 0) + 1;
        }
        
        console.log(`  Circuits:`);
        for (const [code, count] of Object.entries(circuits)) {
           console.log(`    ${code}: ${count} sockets`);
        }
     } else {
        console.log(`  No markers found.`);
     }
  }
}
run();
