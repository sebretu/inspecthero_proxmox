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
    await client.query('BEGIN');

    // Step 1: Capture current recovered coordinates as a mock snapshot
    console.log("--- 1. CAPTURING CURRENT COORDINATES (V2 RECOVERED) ---");
    const stromList = await client.query(
      "SELECT id, x_norm, y_norm FROM stromkreise WHERE plan_id = $1 AND x_norm IS NOT NULL",
      [planId]
    );
    console.log(`Captured ${stromList.rows.length} markers.`);
    const firstBefore = stromList.rows[0];
    console.log("Sample marker before shift:", firstBefore);

    const mockSnapshot = {
      tasks: [],
      bma_devices: [],
      cable_bus_nodes: [],
      chargers: [],
      fehler: [],
      revisions: [],
      aufmass_sessions: [],
      stromkreise: stromList.rows
    };

    // Step 2: Simulate shifting coordinates using Version 3 transformation matrix (Forward shift)
    console.log("\n--- 2. SIMULATING V3 ACTIVATION (FORWARD SHIFT) ---");
    const m00 = 1.5435220758488275;
    const m01 = -0.6173024252292421;
    const tx = 0.038654243055813886;
    const m10 = 0.6173024252292421;
    const m11 = 1.5435220758488275;
    const ty = 0.002052778034876801;

    await client.query(`
      UPDATE stromkreise
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
    `, [m00, m01, tx, m10, m11, ty, planId]);

    // Check one shifted coordinate
    const shiftedRes = await client.query(
      "SELECT id, x_norm, y_norm FROM stromkreise WHERE id = $1",
      [firstBefore.id]
    );
    console.log("Sample marker after shift (V3 active):", shiftedRes.rows[0]);

    // Step 3: Simulate rollback to V2 (Restoring coordinate snapshot)
    console.log("\n--- 3. SIMULATING V2 RESTORATION (ROLLBACK VIA SNAPSHOT) ---");
    const snapMap = new Map(mockSnapshot.stromkreise.map(item => [item.id, item]));

    // Replicate our restorePlanCoordinateSnapshot logic for stromkreise
    const currentRows = await client.query(
      "SELECT id, x_norm, y_norm FROM stromkreise WHERE plan_id = $1 AND x_norm IS NOT NULL",
      [planId]
    );

    for (const row of currentRows.rows) {
      const snapItem = snapMap.get(row.id);
      if (snapItem) {
        await client.query(
          "UPDATE stromkreise SET x_norm = $1, y_norm = $2 WHERE id = $3",
          [snapItem.x_norm, snapItem.y_norm, row.id]
        );
      }
    }

    // Step 4: Verify coordinates are reverted
    const finalRes = await client.query(
      "SELECT id, x_norm, y_norm FROM stromkreise WHERE id = $1",
      [firstBefore.id]
    );
    console.log("Sample marker after restore (V2 restored):", finalRes.rows[0]);

    const diffX = Math.abs(finalRes.rows[0].x_norm - firstBefore.x_norm);
    const diffY = Math.abs(finalRes.rows[0].y_norm - firstBefore.y_norm);

    if (diffX < 1e-9 && diffY < 1e-9) {
      console.log("\n>>> VERIFICATION SUCCESSFUL: Coordinates restored 100% identically! <<<");
    } else {
      console.error("\n>>> VERIFICATION FAILED: Coordinates mismatch! <<<");
    }

    await client.query('ROLLBACK'); // Rollback test transaction so we don't mutate DB state
    console.log("Test transaction rolled back.");

  } catch(e) {
    console.error("Error in simulation:", e);
  } finally {
    await client.end();
  }
}
main();
