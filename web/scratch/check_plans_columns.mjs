
import { getSupabaseAdminClient } from "../src/lib/supabaseAdmin";

async function checkColumns() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from('plans').select('*').limit(1);
    if (error) {
      console.error("Error fetching plans:", error);
      return;
    }
    if (data && data.length > 0) {
      console.log("Columns in 'plans':", Object.keys(data[0]));
    } else {
       console.log("No plans found to inspect columns.");
    }
  } catch (e) {
    console.error("Script failed:", e);
  }
}

checkColumns();
