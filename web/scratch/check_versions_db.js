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
    console.log(`Plan ID: ${id}`);
    const { data: versions, error } = await supabase.from('plan_versions').select('*').eq('plan_id', id);
    if (error) {
      console.error("Error:", error);
      continue;
    }
    console.log(JSON.stringify(versions, null, 2));
    console.log("------------------------");
  }
})();
