import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: projects } = await s.from('projects').select('id, name');
  console.log("Projects:", projects.filter(p => p.name.toLowerCase().includes('grund')));
  
  const { data: plans } = await s.from('plans').select('id, name');
  const hallPlans = plans.filter(p => p.name.toLowerCase().includes('halle') || p.name.toLowerCase().includes('grund'));
  console.log("Relevant plans:", hallPlans);
  
  for (const p of hallPlans) {
     const { data: markers } = await s
       .from('stromkreise')
       .select('id, circuit_code, short_label, phase, type')
       .eq('plan_id', p.id);
       
     if (markers && markers.length > 0) {
        console.log(`Plan: ${p.name} (ID: ${p.id}) has ${markers.length} markers.`);
        const circuits = {};
        for (const m of markers) {
           const code = m.circuit_code || "Unknown";
           circuits[code] = (circuits[code] || 0) + 1;
        }
        for (const [code, count] of Object.entries(circuits)) {
           console.log(`    ${code}: ${count}`);
        }
     }
  }
}
run();
