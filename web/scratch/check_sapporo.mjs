import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const planId = "0d4ccb3f-d8ab-4cce-bd74-fc15da3f510e";
  
  console.log(`\n=== Plan Details for ${planId} ===`);
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (planErr) {
    console.error(planErr);
  } else {
    console.log(JSON.stringify(plan, null, 2));
  }

  console.log(`\n=== Versions for Plan ${planId} ===`);
  const { data: versions, error: versionsErr } = await supabase
    .from("plan_versions")
    .select("*")
    .eq("plan_id", planId);

  if (versionsErr) {
    console.error(versionsErr);
  } else {
    console.log(JSON.stringify(versions, null, 2));
  }

  console.log(`\n=== Audit Events for Plan ${planId} ===`);
  const { data: audit, error: auditErr } = await supabase
    .from("audit_events")
    .select("*")
    .eq("resource_id", planId)
    .order("created_at", { ascending: true });

  if (auditErr) {
    console.error(auditErr);
  } else {
    console.log(JSON.stringify(audit, null, 2));
  }
}

run();
