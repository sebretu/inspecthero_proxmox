const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  try {
    const { data: markers, error } = await supabase
      .from("stromkreise")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
      
    if (error) throw error;
    console.log("MARKERS:", JSON.stringify(markers, null, 2));
    
    // Also describe table schema / structure if we can
    const { data: columns, error: colError } = await supabase.rpc("get_columns_info", { table_name: "stromkreise" }).catch(() => ({ data: null, error: null }));
    if (columns) {
      console.log("COLUMNS:", JSON.stringify(columns, null, 2));
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

run();
