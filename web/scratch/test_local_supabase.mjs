import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

async function run() {
  const localUrl = "http://100.88.160.117:54321";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log(`Connecting to local Supabase URL: ${localUrl}`);
  const supabase = createClient(localUrl, serviceKey);

  const { data, error } = await supabase.from("plans").select("id, name").limit(3);
  if (error) {
    console.error("Local Supabase error:", error);
  } else {
    console.log("Local Supabase plans data:", data);
  }
}

run().catch(console.error);
