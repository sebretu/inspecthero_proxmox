const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', url);
console.log('Has Service Key:', !!serviceKey);
console.log('Has Anon Key:', !!anonKey);

const supabaseAdmin = createClient(url, serviceKey);

async function run() {
  console.log('\n--- BYPASSING RLS (Service Role) ---');
  const { data: projects, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id, name, company_id, companies(name)')
    .eq('is_archived', false);
  
  if (pErr) {
    console.error('Projects select error:', pErr);
  } else {
    console.log('Total projects found:', projects.length);
    projects.forEach(p => {
      console.log(`Project: "${p.name}" (ID: ${p.id})`);
      console.log(`  company_id: ${p.company_id}`);
      console.log(`  company name (via join): ${p.companies ? p.companies.name : 'NULL'}`);
    });
  }

  console.log('\n--- COMPANIES IN DB ---');
  const { data: companies, error: cErr } = await supabaseAdmin
    .from('companies')
    .select('id, name');
  if (cErr) {
    console.error('Companies select error:', cErr);
  } else {
    companies.forEach(c => {
      console.log(`Company: "${c.name}" (ID: ${c.id})`);
    });
  }
}

run();
