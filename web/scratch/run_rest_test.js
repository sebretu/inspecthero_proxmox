const dotenv = require('dotenv');
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  console.log("Supabase URL:", supabaseUrl);
  
  // 1. Fetch project ID
  console.log("Fetching project ID...");
  const getRes = await fetch(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  
  if (!getRes.ok) {
    console.error("GET projects failed:", getRes.status, await getRes.text());
    return;
  }
  
  const projects = await getRes.json();
  console.log("Projects response:", projects);
  if (projects.length === 0) return;
  const projectId = projects[0].id;
  
  // 2. Try inserting bestellung session
  console.log(`Inserting test session with type 'bestellung' for project ${projectId}...`);
  const postRes = await fetch(`${supabaseUrl}/rest/v1/aufmass_sessions`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      project_id: projectId,
      name: 'TEST_BESTELLUNG_REST_API',
      session_type: 'bestellung',
      status: 'draft'
    })
  });
  
  if (!postRes.ok) {
    console.error("POST session failed (violations of check constraint expected if not updated):", postRes.status, await postRes.text());
  } else {
    const inserted = await postRes.json();
    console.log("POST session success:", inserted);
    
    // Clean up
    console.log("Cleaning up test session...");
    const delRes = await fetch(`${supabaseUrl}/rest/v1/aufmass_sessions?id=eq.${inserted[0].id}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    console.log("Clean up response status:", delRes.status);
  }
}

run().catch(console.error);
