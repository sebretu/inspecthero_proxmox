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

async function inspectSymbols() {
  const planId = "cb22d136-88e9-4846-8ff9-4727206205a9";
  const { data: symbols, error } = await supabase
    .from("plan_bma_symbols")
    .select("*")
    .eq("plan_id", planId);

  if (error) {
    console.error("DB error:", error);
    return;
  }

  const ids = [
    "0a3e13d0-2e33-42b9-89a1-b59ab59d2941",
    "4e27e1e5-e84b-455a-a0e9-d4c3eb5e68a2",
    "ca7b5753-c869-4b1f-a48d-55f42de4ceca",
    "bbc54639-8c13-4b4a-be62-082ec835bff2"
  ];

  console.log(`Checking symbols on plan ${planId}:`);
  ids.forEach(id => {
    const s = symbols.find(item => item.id === id);
    if (s) {
      console.log(`FOUND ${id}: label="${s.label}", type=${s.symbol_type}, x=${s.x_norm}, y=${s.y_norm}`);
    } else {
      console.log(`NOT FOUND: ${id}`);
    }
  });
}

inspectSymbols();
