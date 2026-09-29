import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);
  
  console.log("Signing in as admin...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'sebretu33@gmail.com',
    password: 'password123'
  });
  
  if (authErr) {
    console.error("Auth failed:", authErr.message);
    return;
  }
  
  const token = authData.session.access_token;
  console.log("Logged in successfully! Token obtained.");
  
  const planId = "633c788d-fe28-4f0d-97f1-87d2affe9021";
  const refPlanId = "990da539-ab71-42da-a501-45bf840a8d99";

  console.log(`Calling POST /api/plans/${planId}/analyze-sockets synchronously...`);
  const startTime = Date.now();
  const res = await fetch(`http://localhost:3005/api/plans/${planId}/analyze-sockets`, {
    method: "POST",
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reference_plan_id: refPlanId
    })
  });
  const duration = (Date.now() - startTime) / 1000;
  console.log(`Request finished in ${duration.toFixed(2)}s with status ${res.status}`);
  
  if (!res.ok) {
    console.error("API request failed:", res.status, await res.text());
    return;
  }
  
  const body = await res.json();
  if (!body.ok) {
    console.error("API returned error:", body.error);
    return;
  }

  const { detected_symbols, matched_labels, proposed_markers } = body.data;
  console.log("\nSuccess! Results summary:");
  console.log(`- Detected Symbols: ${detected_symbols?.length || 0}`);
  console.log(`- Matched Labels: ${matched_labels?.length || 0}`);
  console.log(`- Proposed Markers: ${proposed_markers?.length || 0}`);

  const withLabels = proposed_markers.filter(pm => pm.short_label !== "");
  console.log(`Proposed markers with labels: ${withLabels.length}`);
  if (withLabels.length > 0) {
    console.log("Examples of proposed markers with labels:");
    withLabels.slice(0, 25).forEach((pm, idx) => {
      console.log(`  [${idx}] Type: ${pm.type} | Label: '${pm.short_label}' | Coords: (${pm.x_norm.toFixed(4)}, ${pm.y_norm.toFixed(4)}) | Source: ${pm.metadata.inference_source} | Confidence: ${pm.metadata.confidence}`);
    });
  } else {
    console.log("No proposed markers with labels found.");
  }
}
main().catch(console.error);
