import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';

  // Matrix V3 parameters:
  const m00 = 1.5435220758488275;
  const m01 = -0.6173024252292421;
  const tx = 0.038654243055813886;
  const m10 = 0.6173024252292421;
  const m11 = 1.5435220758488275;
  const ty = 0.002052778034876801;

  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) {
    console.error("Degenerate matrix!");
    process.exit(1);
  }

  // Compute inverse matrix coefficients
  const inv_m00 = m11 / det;
  const inv_m01 = -m01 / det;
  const inv_m10 = -m10 / det;
  const inv_m11 = m00 / det;

  const inv_tx = - (inv_m00 * tx + inv_m01 * ty);
  const inv_ty = - (inv_m10 * tx + inv_m11 * ty);

  console.log("Inverse Coefficients:");
  console.log({ inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty });

  try {
    await client.connect();
    await client.query('BEGIN');

    // 1. Stromkreise
    const resStrom = await client.query(`
      UPDATE stromkreise
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
      RETURNING id, circuit_code, x_norm, y_norm
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resStrom.rowCount} stromkreise markers.`);

    // 2. Tasks
    const resTasks = await client.query(`
      UPDATE tasks
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resTasks.rowCount} tasks.`);

    // 3. BMA Devices
    const resBma = await client.query(`
      UPDATE bma_devices
      SET 
        x = (x * $1) + (y * $2) + $3,
        y = (x * $4) + (y * $5) + $6
      WHERE plan_id = $7 AND x IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resBma.rowCount} bma_devices.`);

    // 4. Cable Bus Nodes
    const resNodes = await client.query(`
      UPDATE cable_bus_nodes
      SET 
        x = (x * $1) + (y * $2) + $3,
        y = (x * $4) + (y * $5) + $6
      WHERE plan_id = $7 AND x IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resNodes.rowCount} cable_bus_nodes.`);

    // 5. Chargers
    const resChargers = await client.query(`
      UPDATE chargers
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resChargers.rowCount} chargers.`);

    // 6. Fehler
    const resFehler = await client.query(`
      UPDATE fehler
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resFehler.rowCount} fehler.`);

    // 7. Revisions
    const resRevisions = await client.query(`
      UPDATE revisions
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resRevisions.rowCount} revisions.`);

    // 8. Aufmass Sessions
    const resAufmass = await client.query(`
      UPDATE aufmass_sessions
      SET 
        x_norm = (x_norm * $1) + (y_norm * $2) + $3,
        y_norm = (x_norm * $4) + (y_norm * $5) + $6
      WHERE plan_id = $7 AND x_norm IS NOT NULL
    `, [inv_m00, inv_m01, inv_tx, inv_m10, inv_m11, inv_ty, planId]);
    console.log(`Updated ${resAufmass.rowCount} aufmass_sessions.`);

    await client.query('COMMIT');
    console.log("Transaction committed successfully.");

    console.log("Sample recovered rows:");
    console.log(resStrom.rows.slice(0, 5));

  } catch(e) {
    await client.query('ROLLBACK');
    console.error("Error during recovery, transaction rolled back:", e);
  } finally {
    await client.end();
  }
}
main();
