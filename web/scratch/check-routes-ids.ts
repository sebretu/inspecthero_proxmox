import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url!, key!);

async function check() {
  const projectId = '76530312-bc7b-4681-a760-84c0c7765084';
  const { data: routes } = await supabase.from('bma_routes').select('source_device_id, target_device_id').eq('project_id', projectId);
  console.log(`Routes for project ${projectId}:`, routes?.length || 0);
  
  if (routes && routes.length > 0) {
     const ids = new Set();
     routes.forEach(r => { ids.add(r.source_device_id); ids.add(r.target_device_id); });
     console.log('Sample IDs in routes:', Array.from(ids).slice(0, 3));
  }
}
check();
