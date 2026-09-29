const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021'; // OG
  const { data: versions } = await supabase.from('plan_versions').select('*').eq('plan_id', planId);
  console.log("=== Versions for OG ===");
  for (const v of versions) {
    console.log(`Version ${v.version_number}:`);
    console.log(`  id: ${v.id}`);
    console.log(`  status: ${v.status}`);
    console.log(`  file_url: ${v.file_url}`);
    console.log(`  width_px: ${v.width_px}, height_px: ${v.height_px}`);
    console.log(`  transformation_model:`, JSON.stringify(v.transformation_model, null, 2));
    console.log("------------------------");
  }
})();
