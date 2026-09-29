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

async function inspectAllIhCables() {
  const planId = "cb22d136-88e9-4846-8ff9-4727206205a9";
  const { data: connections, error } = await supabase
    .from("bma_connections")
    .select("*");

  if (error) {
    console.error("DB error:", error);
    return;
  }

  const ihCables = connections.filter(c => {
    const m = c.metadata || {};
    const s = (m.source_device_label || '').toUpperCase();
    const t = (m.target_device_label || '').toUpperCase();
    const num = (m.cable_number || c.name || '').toUpperCase();
    return s.includes('IH') || t.includes('IH') || num.includes('K-04') || num.includes('K-05') || num.includes('K-06');
  });

  console.log(`Found ${ihCables.length} IH cables:`);
  ihCables.forEach(c => {
    const m = c.metadata || {};
    console.log(`Cable ${m.cable_number || c.name}: ID=${c.id}, Color=${c.color}, Type=${c.type}, Source=${m.source_device_label} (${m.source_symbol_id}), Target=${m.target_device_label} (${m.target_symbol_id}), Wpts=${m.waypoints?.length || 0}`);
  });
}

inspectAllIhCables();
