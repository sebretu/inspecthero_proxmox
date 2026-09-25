
import { getSupabaseAdminClient } from "../src/lib/supabaseAdmin";

async function checkStatus() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from('plans').select('status').limit(100);
    if (error) {
      console.error("Error fetching plans:", error);
      return;
    }
    const stats = new Set(data.map(p => p.status));
    console.log("Unique statuses in 'plans':", Array.from(stats));
  } catch (e) {
    console.error("Script failed:", e);
  }
}

checkStatus();
