import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  
  try {
    await client.connect();
    
    const versions = await client.query(
      "SELECT id, version_number, status, transformation_model, created_at FROM plan_versions WHERE plan_id = $1 ORDER BY version_number ASC",
      [planId]
    );
    for (const row of versions.rows) {
      console.log(`Version ${row.version_number} (${row.id}): status=${row.status}, created_at=${row.created_at}`);
      console.log("Transformation model:", JSON.stringify(row.transformation_model, null, 2));
    }

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
