
import { getSupabaseAdminClient } from "../src/lib/supabaseAdmin";

async function checkIsArchived() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from('plans').select('is_archived').limit(1);
    if (error) {
      console.error("Error fetching plans:", error);
      return;
    }
    if (data && data.length > 0) {
      console.log("is_archived type/value:", typeof data[0].is_archived, data[0].is_archived);
    }
  } catch (e) {
    console.error("Script failed:", e);
  }
}

checkIsArchived();
