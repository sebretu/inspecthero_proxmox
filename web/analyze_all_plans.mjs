import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: markers } = await s.from('stromkreise').select('circuit_code, plan_id, type').in('plan_id', ['990da539-ab71-42da-a501-45bf840a8d99', '633c788d-fe28-4f0d-97f1-87d2affe9021']);
  const countEG = {};
  const countOG = {};
  for (const m of markers) {
     if (m.plan_id === '990da539-ab71-42da-a501-45bf840a8d99') countEG[m.circuit_code] = (countEG[m.circuit_code] || 0) + 1;
     else countOG[m.circuit_code] = (countOG[m.circuit_code] || 0) + 1;
  }
  console.log("EG Circuits:", Object.entries(countEG).sort((a,b)=>b[1]-a[1]));
  console.log("OG Circuits:", Object.entries(countOG).sort((a,b)=>b[1]-a[1]));
}
run();
