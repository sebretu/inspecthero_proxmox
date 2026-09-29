import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL:", url);
console.log("Supabase key length:", service ? service.length : 0);

if (!url || !service) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Fetching profiles...");
  const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, email, full_name, role").limit(5);
  if (pErr) {
    console.error("Profiles error:", pErr);
  } else {
    console.log("Profiles:", profiles);
  }

  console.log("Fetching stromkreis_history...");
  const { data: history, error: hErr } = await supabase.from("stromkreis_history").select("*").order("created_at", { ascending: false }).limit(20);
  if (hErr) {
    console.error("History error:", hErr);
  } else {
    console.log("History:", history);
  }
}

main().catch(err => {
  console.error("Unhandled exception:", err);
});
