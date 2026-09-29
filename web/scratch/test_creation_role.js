const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { Client } = require('pg');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const adminClient = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

async function run() {
  const pgClient = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  const email = `test_temp_${Date.now()}@example.com`;
  const password = 'TemporaryPassword123!';

  try {
    await pgClient.connect();

    console.log(`Creating user: ${email}...`);
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) throw error;
    const userId = data.user.id;

    console.log("Selecting user from auth.users...");
    const res = await pgClient.query("SELECT id, email, role FROM auth.users WHERE id = $1", [userId]);
    console.log("Database record:", res.rows[0]);

    // Clean up
    await adminClient.auth.admin.deleteUser(userId);

  } catch (e) {
    console.error("Failed:", e);
  } finally {
    await pgClient.end();
  }
}

run();
