const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Try web/.env.local then .env.local
let envPath = path.resolve('web/.env.local');
if (!fs.existsSync(envPath)) {
  envPath = path.resolve('.env.local');
}
require('dotenv').config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase URL or service role key in env at:", envPath);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("--- Loading User Profile for m.hoff@inspecthero.pl ---");
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'm.hoff@inspecthero.pl')
    .single();

  if (userError) {
    console.error("User fetch error:", userError);
    return;
  }
  console.log("User Profile:", user);

  console.log("\n--- Loading Project 'gewerbepark duisburg' ---");
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('*')
    .ilike('name', '%gewerbepark duisburg%');

  if (projError) {
    console.error("Project fetch error:", projError);
    return;
  }
  console.log("Projects found:", projects);

  if (projects.length === 0) {
    console.log("No projects found matching 'gewerbepark duisburg'");
    return;
  }

  const project = projects[0];

  console.log("\n--- Checking Project Members for this project ---");
  const { data: members, error: memError } = await supabase
    .from('project_members')
    .select('*, profiles(email, full_name, role)')
    .eq('project_id', project.id);

  if (memError) {
    console.error("Members fetch error:", memError);
    return;
  }
  console.log("Project Members:", members.map(m => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    email: m.profiles?.email,
    name: m.profiles?.full_name,
    profile_role: m.profiles?.role
  })));

  console.log("\n--- Checking Cables for this project ---");
  const { data: cables, error: cablesError } = await supabase
    .from('cables')
    .select('id, name, company_id, project_id')
    .eq('project_id', project.id)
    .limit(5);

  if (cablesError) {
    console.error("Cables fetch error:", cablesError);
    return;
  }
  console.log(`Cables found for project (${cables.length} total):`, cables);

  console.log("\n--- Checking Cable Routes for this project ---");
  const { data: routes, error: routesError } = await supabase
    .from('cable_routes')
    .select('id, name, company_id, project_id')
    .eq('project_id', project.id)
    .limit(5);

  if (routesError) {
    console.error("Routes fetch error:", routesError);
    return;
  }
  console.log(`Routes found for project (${routes.length} total):`, routes);
}

run();
