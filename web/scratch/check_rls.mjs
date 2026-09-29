import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://api.inspecthero.pl';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const adminClient = createClient(supabaseUrl, supabaseKey);

// We need to login as sebretu33@gmail.com to test what he sees.
// But we don't have his password.
// We can use the service_role key to bypass RLS, which is what `adminClient` does.
// Let's just check the policies on `profiles` using postgres query.

async function checkPolicies() {
  const { data, error } = await adminClient.rpc('get_policies_for_table', { table_name: 'profiles' });
  if (error) {
    // maybe RPC doesn't exist. Let's run a direct SQL query through API if possible, or just skip it.
    console.error(error);
  } else {
    console.log(data);
  }
}

checkPolicies();
