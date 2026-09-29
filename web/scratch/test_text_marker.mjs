import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  
  // Fetch a valid project and plan id to avoid foreign key violations
  const { data: plans, error: plansErr } = await supabase.from("plans").select("id, project_id").limit(1);
  if (plansErr || !plans || plans.length === 0) {
    console.error("Could not find any plans to test with:", plansErr);
    return;
  }
  
  const testPlan = plans[0];
  console.log("Using Plan ID:", testPlan.id, "Project ID:", testPlan.project_id);

  // Create a test marker with type text mapped to special
  const testMarker = {
    project_id: testPlan.project_id,
    plan_id: testPlan.id,
    circuit_code: "TEXT_TEST",
    short_label: "Test Text Label",
    full_name: "Test Text Marker Description",
    type: "special", // DB enum
    marker_shape: "circle", // DB enum
    x_norm: 0.25,
    y_norm: 0.75,
    phase: 1,
    metadata: { realType: "text" }
  };

  console.log("Inserting test marker...");
  const { data: inserted, error: insertError } = await supabase
    .from("stromkreise")
    .insert(testMarker)
    .select("*")
    .single();

  if (insertError) {
    console.error("Insert error:", insertError);
    return;
  }
  console.log("Successfully inserted:", inserted);

  // Retrieve it
  console.log("Retrieving test marker...");
  const { data: retrieved, error: retrieveError } = await supabase
    .from("stromkreise")
    .select("*")
    .eq("id", inserted.id)
    .single();

  if (retrieveError) {
    console.error("Retrieve error:", retrieveError);
  } else {
    console.log("Retrieved data:", retrieved);
  }

  // Cleanup
  console.log("Cleaning up test marker...");
  const { error: deleteError } = await supabase
    .from("stromkreise")
    .delete()
    .eq("id", inserted.id);

  if (deleteError) {
    console.error("Delete error:", deleteError);
  } else {
    console.log("Cleaned up successfully!");
  }
}

run();
