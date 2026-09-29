const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const envFile = fs.readFileSync('/home/ubuntu/inspecthero-web.env', 'utf8');
  const anonKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
  const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const serviceRoleMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  
  if (!serviceRoleMatch) {
    console.error('No service role found');
    return;
  }
  
  const supabase = createClient(url, serviceRoleMatch[1].trim());
  const { data, error } = await supabase.from('profiles').update({ role: 'MODERATOR' }).in('email', ['jozef@demo.pl', 'jozesf@demo.pl']);
  
  if (error) {
    console.error(error);
  } else {
    console.log('Updated profiles to MODERATOR successfully.');
  }
}

main().then(() => process.exit(0)).catch(console.error);
