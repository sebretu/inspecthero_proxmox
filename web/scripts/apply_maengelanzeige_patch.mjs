import { createClient } from "@supabase/supabase-js";

const url = "https://api.inspecthero.pl";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ";

const supabase = createClient(url, key);

async function main() {
  console.log("Checking maengelanzeige_items...");
  const { data, error } = await supabase.from("maengelanzeige_items").select("*").limit(1);
  if (error) {
    console.error("Select error:", error);
  } else {
    console.log("Existing columns:", data && data[0] ? Object.keys(data[0]) : "none");
  }
}

main();
