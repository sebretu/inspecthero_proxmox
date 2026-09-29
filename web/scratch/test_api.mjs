import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Find project
  const { data: projects } = await supabase.from('projects').select('id, name');
  console.log("Projects:", projects?.map(p => p.name).join(', '));
  
  if (!projects || projects.length === 0) return;
  const projectId = projects[0].id;
  
  // Find plans
  const { data: plans } = await supabase.from('plans').select('id, file_name').eq('project_id', projectId);
  console.log("Plans:", plans?.map(p => p.file_name).join(', '));
  
  if (!plans || plans.length === 0) return;
  
  for (const plan of plans) {
    const { data: markers } = await supabase.from('stromkreise').select('circuit_code, type').eq('plan_id', plan.id).eq('type', 'edv');
    console.log(`Plan ${plan.file_name} (${plan.id}) has ${markers?.length} EDV markers.`);
    if (markers?.length > 0) {
      console.log("  Examples:", markers.slice(0, 3).map(m => m.circuit_code).join(', '));
    }
  }
}

run().catch(console.error);
