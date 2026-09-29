import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://api.inspecthero.pl';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const planId = 'e8fc1324-7ff7-4580-a6f2-fd71b6fecba7';
  console.log('Checking plan:', planId);
  const { data, error } = await supabase.from('plans').select('*').eq('id', planId).single();
  if (error) {
    console.error('Error fetching plan:', error);
  } else {
    console.log('Plan data:', data);
  }

  const { data: versions, error: vErr } = await supabase.from('plan_versions').select('*').eq('plan_id', planId);
  if (vErr) {
    console.error('Error fetching versions:', vErr);
  } else {
    console.log('Plan versions:', versions);
  }
}

main();
