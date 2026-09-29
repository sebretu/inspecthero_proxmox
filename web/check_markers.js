const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function run() {
  try {
    const planId = "4afab0f8-a494-46ec-9a3f-1fd4ced53037";
    console.log(`Fetching markers for plan ${planId}...`);
    const { data: markers, error } = await supabase
      .from("stromkreise")
      .select("id, circuit_code, x_norm, y_norm, type")
      .eq("plan_id", planId);

    if (error) throw error;

    console.log("Markers in database:");
    markers.forEach(m => {
      console.log(`  Code: ${m.circuit_code}, Type: ${m.type}, x_norm: ${m.x_norm.toFixed(4)}, y_norm: ${m.y_norm.toFixed(4)}`);
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
