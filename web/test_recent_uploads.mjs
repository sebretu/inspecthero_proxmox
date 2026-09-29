import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Get 3 most recently created plan versions
  const { data: versions, error } = await s
    .from('plan_versions')
    .select('id, plan_id, file_url, created_at')
    .order('created_at', { ascending: false })
    .limit(3);
    
  if (error || !versions || versions.length === 0) {
    console.log("Error or no versions:", error);
    return;
  }
  
  for (const v of versions) {
    console.log(`Checking version ${v.id} from ${v.created_at}...`);
    // Need to get the base path from plans table
    const { data: planData } = await s.from('plans').select('storage_bucket, storage_path').eq('id', v.plan_id).single();
    
    if (!planData) {
      console.log("  Plan data not found");
      continue;
    }
    
    let storagePath = planData.storage_path;
    if (v.file_url) {
      if (v.file_url.includes("/")) {
        storagePath = v.file_url;
      } else {
        const parts = planData.storage_path.split("/");
        parts.pop();
        parts.push(v.file_url);
        storagePath = parts.join("/");
      }
    }
    
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${planData.storage_bucket}/${storagePath}`;
    
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    console.log(`  Download status for ${storagePath}: ${res.status} ${res.statusText}`);
  }
}
run();
