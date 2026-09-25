
import { getSupabaseAdminClient } from "./src/lib/supabaseAdmin";

async function checkBuckets() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("Error listing buckets:", error);
    return;
  }
  console.log("Buckets:", data.map(b => b.name));
}

checkBuckets();
