import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url!, key!);

async function check() {
  const projectId = '76530312-bc7b-4681-a760-84c0c7765084';
  const { count, error } = await supabase.from('bma_routes').select('*', { count: 'exact', head: true }).eq('project_id', projectId);
  console.log(`Routes count for ${projectId}:`, count);
  if (error) console.error(error);

  const { data: snaps } = await supabase.from('bma_snapshots').select('name, data').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1);
  if (snaps && snaps[0]) {
     console.log(`Latest snapshot ${snaps[0].name} routes count:`, snaps[0].data?.routes?.length || 0);
  }
}

check();
