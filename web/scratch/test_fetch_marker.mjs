import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://api.inspecthero.pl';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from("stromkreise")
    .select("*, projects(name), plans(version, floors(name))")
    .limit(1);
  
  if (error) {
    console.error("Error with plans floors query:", error);
  } else {
    console.log("Success! Marker sample:", JSON.stringify(data[0], null, 2));
  }
}

run();
