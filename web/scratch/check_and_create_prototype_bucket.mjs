import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ENV_PATH = "/home/ubuntu/inspecthero-web.env";
const envVars = {};
if (fs.existsSync(ENV_PATH)) {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, v] = trimmed.split("=", 2);
      envVars[k.trim()] = v.trim();
    }
  });
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkBucket() {
  console.log("Checking Supabase Storage buckets...");
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("Error listing buckets:", error);
    return;
  }
  console.log("Existing buckets:", buckets.map((b) => b.name));

  const protoBucket = buckets.find((b) => b.name === "prototype-library" || b.name === "prototype_library");
  if (!protoBucket) {
    console.log("Creating storage bucket 'prototype-library'...");
    const { data: newBucket, error: createError } = await supabase.storage.createBucket("prototype-library", {
      public: true,
    });
    if (createError) {
      console.error("Error creating bucket:", createError);
    } else {
      console.log("Created bucket 'prototype-library' successfully!");
    }
  } else {
    console.log("Bucket 'prototype-library' already exists.");
  }
}

checkBucket();
