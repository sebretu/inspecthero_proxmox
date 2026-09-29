import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: profiles } = await supabase.from("profiles").select("id, email, role, full_name");
  console.log("All profiles:", profiles);
}
main();
