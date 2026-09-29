import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  
  try {
    await client.connect();
    
    console.log("--- BMA SNAPSHOTS ---");
    const bmaSnaps = await client.query('SELECT id, name, created_at, plan_id FROM bma_snapshots WHERE plan_id = $1 ORDER BY created_at DESC', [planId]);
    console.log(JSON.stringify(bmaSnaps.rows, null, 2));
    
    console.log("--- STROMKREIS SNAPSHOTS ---");
    const stromSnaps = await client.query('SELECT id, name, created_at, plan_id FROM stromkreis_snapshots WHERE plan_id = $1 ORDER BY created_at DESC', [planId]);
    console.log(JSON.stringify(stromSnaps.rows, null, 2));

    console.log("--- AUDIT EVENTS ---");
    const audits = await client.query("SELECT id, event_type, created_at, metadata FROM audit_events WHERE resource_id = $1 OR (metadata->>'restored_version_id') IS NOT NULL ORDER BY created_at DESC LIMIT 10", [planId]);
    console.log(JSON.stringify(audits.rows, null, 2));

    console.log("--- PLAN VERSIONS ---");
    const versions = await client.query("SELECT id, plan_id, version_number, status, created_at FROM plan_versions WHERE plan_id = $1 ORDER BY created_at DESC", [planId]);
    console.log(JSON.stringify(versions.rows, null, 2));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
