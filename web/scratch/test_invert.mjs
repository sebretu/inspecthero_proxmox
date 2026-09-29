import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  
  // Matrix V3:
  const m00 = 1.5435220758488275;
  const m01 = -0.6173024252292421;
  const tx = 0.038654243055813886;
  const m10 = 0.6173024252292421;
  const m11 = 1.5435220758488275;
  const ty = 0.002052778034876801;

  const det = m00 * m11 - m01 * m10;
  console.log("Determinant:", det);

  try {
    await client.connect();
    
    const strom = await client.query(
      "SELECT id, circuit_code, x_norm, y_norm FROM stromkreise WHERE plan_id = $1 LIMIT 10",
      [planId]
    );

    console.log("Inverted coordinates:");
    for (const row of strom.rows) {
      const { x_norm: x3, y_norm: y3, circuit_code } = row;
      const dx = x3 - tx;
      const dy = y3 - ty;
      
      const x2 = (dx * m11 - dy * m01) / det;
      const y2 = (dy * m00 - dx * m10) / det;
      
      console.log(`${circuit_code}: original=(${x3.toFixed(4)}, ${y3.toFixed(4)}) -> inverted=(${x2.toFixed(4)}, ${y2.toFixed(4)})`);
    }

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
