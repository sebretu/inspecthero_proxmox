import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const bucket = 'plans';
  const path = 'projects/9134fda1-dbb9-4a8d-af1a-8dfba002dcd1/floors/fdc681fa-2fa7-4da3-9ec2-1dd44e251c26/v1.pdf';
  const { data, error } = await s.storage.from(bucket).createSignedUrl(path, 3600);
  console.log("Signed:", data, "Error:", error);
  if (data?.signedUrl) {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(data.signedUrl);
    console.log("Status:", res.status, res.statusText);
    if (!res.ok) {
        console.log("Error text:", await res.text());
    }
  }
}
run();
