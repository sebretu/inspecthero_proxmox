import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  const versionId = '2e10c566-bf37-440d-89ff-ab25c53f16c6'; // V2

  try {
    await client.connect();
    
    // Fetch all stromkreise
    const stromRes = await client.query(
      "SELECT id, x_norm, y_norm FROM stromkreise WHERE plan_id = $1 AND x_norm IS NOT NULL",
      [planId]
    );

    console.log(`Fetched ${stromRes.rows.length} stromkreise records for snapshot.`);

    // Build the snapshot object
    const snapshot = {
      tasks: [],
      bma_devices: [],
      cable_bus_nodes: [],
      chargers: [],
      fehler: [],
      revisions: [],
      aufmass_sessions: [],
      stromkreise: stromRes.rows
    };

    // Save to plan_versions
    const updateRes = await client.query(
      "UPDATE plan_versions SET coordinate_snapshot = $1 WHERE id = $2 RETURNING id, status, coordinate_snapshot",
      [JSON.stringify(snapshot), versionId]
    );

    if (updateRes.rowCount > 0) {
      console.log("Success: Snapshot saved to plan_versions for V2.");
      console.log("Status of V2 version is:", updateRes.rows[0].status);
      console.log("Snapshot length of stromkreise:", updateRes.rows[0].coordinate_snapshot.stromkreise.length);
    } else {
      console.error("Error: Could not find version ID in plan_versions.");
    }

  } catch(e) {
    console.error("Error during populating snapshot:", e);
  } finally {
    await client.end();
  }
}
main();
