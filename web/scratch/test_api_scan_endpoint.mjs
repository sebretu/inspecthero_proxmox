import fs from "fs";

const ENV_PATH = "/home/ubuntu/inspecthero-web.env";
const envVars = {};
if (fs.existsSync(ENV_PATH)) {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, v] = trimmed.split("=", 2);
      envVars[k.trim()] = v.trim();
    }
  });
}

const SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

async function testApiScanEndpointWithAuth() {
  console.log("=== TESTING LIVE /api/bma/scan ENDPOINT WITH AUTH ===");
  const planId = "edec9d4d-32cd-40e5-866b-0b85dc3c3781";
  const projectId = "45558114-382e-4e5c-a277-2d5532c71f58";

  const t0 = Date.now();
  const res = await fetch("http://127.0.0.1:3005/api/bma/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "X-App-Token": SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      planId,
      projectId,
      useExisting: true
    })
  });

  const duration = Date.now() - t0;
  console.log(`HTTP Status: ${res.status} ${res.statusText} (took ${duration}ms)`);

  const text = await res.text();
  console.log("Raw Response Body (first 400 chars):");
  console.log(text.slice(0, 400));

  try {
    const json = JSON.parse(text);
    console.log(`\n✅ JSON PARSED SUCCESSFUL! Found ${json.data?.length || 0} devices.`);
    console.log("Sample devices:", json.data?.slice(0, 10));
  } catch (err) {
    console.error("JSON PARSE ERROR:", err);
  }
}

testApiScanEndpointWithAuth();
