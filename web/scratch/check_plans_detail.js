const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const targetPlanIds = [
    '990da539-ab71-42da-a501-45bf840a8d99', // Grundfos EG
    '633c788d-fe28-4f0d-97f1-87d2affe9021'  // Grundfos OG
  ];

  for (const id of targetPlanIds) {
    console.log(`=== Plan ID: ${id} ===`);
    const { data: plan } = await supabase.from('plans').select('*').eq('id', id).single();
    console.log('Plan table fields:', {
      name: plan.name,
      image_width: plan.image_width,
      image_height: plan.image_height,
      storage_path: plan.storage_path,
      storage_bucket: plan.storage_bucket
    });

    const { data: versions } = await supabase.from('plan_versions').select('id, file_url, width_px, height_px, status, version_number').eq('plan_id', id);
    console.log('Versions:', versions);

    // Let's also check if there is a meta.json file in the storage for the active version or plan ID
    const activeVer = versions.find(v => v.status === 'active');
    if (activeVer) {
      const pathsToCheck = [
        `private_tiles/${id}/meta.json`,
        `private_tiles/${activeVer.id}/meta.json`
      ];
      for (const p of pathsToCheck) {
        const { data, error } = await supabase.storage.from('plans').download(p);
        if (error) {
          console.log(`  File ${p}: NOT found/error: ${error.message}`);
        } else {
          const text = await data.text();
          console.log(`  File ${p}: FOUND! Content:`, text);
        }
      }
    }
    console.log("------------------------\n");
  }
})();
