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
  console.log("Fetching a marker from stromkreise...");
  const { data: markers, error: mErr } = await supabase.from("stromkreise").select("id, circuit_code").limit(1);
  if (mErr || !markers || markers.length === 0) {
    console.error("Failed to fetch marker:", mErr);
    process.exit(1);
  }
  const marker = markers[0];
  console.log("Found marker:", marker);

  const targetUserId = 'd26bd143-c58a-4a65-8285-072c7599637b'; // Christian Thiele

  console.log("Inserting dummy stromkreis_history record...");
  const { data: inserted, error: iErr } = await supabase.from("stromkreis_history").insert({
    marker_id: marker.id,
    action: "SUBMITTED",
    sub_cable: "1A",
    new_value: { status: "PENDING_APPROVAL", user: "Christian Thiele" },
    changed_by: targetUserId
  }).select();

  if (iErr) {
    console.error("Insert error:", iErr);
  } else {
    console.log("Successfully inserted dummy record:", inserted);
  }
}

main().catch(err => {
  console.error("Unhandled exception:", err);
});
