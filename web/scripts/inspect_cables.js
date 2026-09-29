const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = '/home/ubuntu/inspecthero-web.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function inspectCables() {
  const { data: connections, error } = await supabase
    .from("bma_connections")
    .select("*");

  if (error) {
    console.error("DB error:", error);
    return;
  }

  const targetCables = connections.filter(c => {
    const m = c.metadata || {};
    const num = (m.cable_number || c.name || '').toUpperCase();
    return num.includes('K-061') || num.includes('K-023') || num.includes('K-062') || num.includes('K-024');
  });

  console.log(`Found ${targetCables.length} matching cables in DB:\n`);
  targetCables.forEach(c => {
    console.log("------------------------------------------------");
    console.log(`ID: ${c.id}`);
    console.log(`Name: ${c.name}`);
    console.log(`Type: ${c.type}`);
    console.log(`Color: ${c.color}`);
    console.log(`Plan ID (row): ${c.plan_id}`);
    console.log(`Metadata:`, JSON.stringify(c.metadata, null, 2));
  });
}

inspectCables();
