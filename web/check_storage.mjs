import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: buckets } = await s.storage.listBuckets();
  console.log("Buckets:", buckets?.map(b => b.name));
  const { data: files } = await s.storage.from('plans').list('projects/9134fda1-dbb9-4a8d-af1a-8dfba002dcd1/floors/fdc681fa-2fa7-4da3-9ec2-1dd44e251c26');
  console.log("Files:", files);
}
run();
