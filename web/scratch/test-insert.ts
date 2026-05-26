import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url!, key!);

async function check() {
  const projectId = '76530312-bc7b-4681-a760-84c0c7765084';
  const connId = '4c127405-8869-46a5-bcad-318fc0fca9de';
  const srcId = '6f5ab9f1-9ac0-422d-872f-4d44253a870d';
  const tgtId = 'daefbbd9-5c0e-4191-aff2-c2e2276ad325';

  const { data, error } = await supabase.from('bma_routes').insert({
    project_id: projectId,
    connection_id: connId,
    source_device_id: srcId,
    target_device_id: tgtId,
    length_meters: 10
  }).select();

  console.log('Manual insert result:', data);
  if (error) console.error('Manual insert error:', error);
}
check();
