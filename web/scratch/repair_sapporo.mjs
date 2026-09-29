import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const planId = "0d4ccb3f-d8ab-4cce-bd74-fc15da3f510e";
  
  console.log(`Updating plans table for ${planId}...`);
  const { data, error } = await supabase
    .from("plans")
    .update({
      version: 1,
      pdf_path: "v1.pdf",
      image_width: 7021,
      image_height: 4967,
      updated_at: new Date().toISOString()
    })
    .eq("id", planId)
    .select("*")
    .single();

  if (error) {
    console.error("Update failed:", error);
  } else {
    console.log("Successfully repaired plan record:");
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
