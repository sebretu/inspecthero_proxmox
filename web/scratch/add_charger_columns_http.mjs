const SUPABASE_URL = 'https://api.inspecthero.pl';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';

async function runQuery(sql) {
  const response = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

async function main() {
  console.log('Testing /pg/query endpoint...');
  
  const res1 = await runQuery('ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS service_pin text;');
  console.log('service_pin:', res1.status, res1.body);
  
  const res2 = await runQuery('ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS activation_pin text;');
  console.log('activation_pin:', res2.status, res2.body);
  
  const res3 = await runQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'chargers' AND column_name IN ('mac','pin','service_pin','activation_pin') ORDER BY column_name;");
  console.log('Verification:', res3.status, res3.body);
  
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
