import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const targetUserId = 'd26bd143-c58a-4a65-8285-072c7599637b'; // Christian Thiele

  console.log("Querying using: select('*, stromkreise(circuit_code)').eq('changed_by', targetUserId)...");
  const { data, error } = await supabase
    .from("stromkreis_history")
    .select("*, stromkreise(circuit_code)")
    .eq("changed_by", targetUserId);

  if (error) {
    console.error("Query failed:", error);
  } else {
    console.log("Query succeeded! Result:", data);
  }
}

main().catch(err => {
  console.error("Unhandled exception:", err);
});
