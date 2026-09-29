const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const { data: plans, error: planErr } = await supabase.from('plans').select('id, storage_path, floors(name, buildings(name))');
  if (planErr) {
    console.error("Error plans:", planErr);
    return;
  }

  const { data: versions, error: verErr } = await supabase.from('plan_versions').select('plan_id, file_url, status');
  if (verErr) {
    console.error("Error versions:", verErr);
    return;
  }

  for (const plan of plans) {
    const activeVer = versions.find(v => v.plan_id === plan.id && v.status === 'active');
    const floorName = plan.floors?.name || "";
    const bldName = plan.floors?.buildings?.name || "";
    const name = `${bldName} - ${floorName}`;

    if (activeVer) {
      const storageBase = plan.storage_path.split('/').pop();
      const versionBase = activeVer.file_url.split('/').pop();
      if (storageBase !== versionBase) {
        console.log(`MISMATCH: Plan: ${name} (${plan.id})`);
        console.log(`  -> plans.storage_path: ${plan.storage_path}`);
        console.log(`  -> active version file_url: ${activeVer.file_url}`);
      } else {
        console.log(`OK: Plan: ${name} (${plan.id}) (both match: ${storageBase})`);
      }
    } else {
      console.log(`NO ACTIVE VERSION: Plan: ${name} (${plan.id})`);
    }
  }
})();
