import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const planId = "6b0a791d-312b-4ed9-9d68-76ca3184006f";
  
  console.log(`Fetching audit events for plan ${planId}...`);
  const { data: audit, error: auditErr } = await supabase
    .from("audit_events")
    .select("*")
    .eq("resource_id", planId)
    .order("created_at", { ascending: true });

  if (auditErr) {
    console.error("Error fetching audit events:", auditErr);
    return;
  }

  console.log(`Found ${audit?.length ?? 0} events:`);
  console.log(JSON.stringify(audit, null, 2));
}

run();
