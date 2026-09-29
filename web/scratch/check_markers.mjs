import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  
  try {
    await client.connect();
    
    const tables = [
      'tasks',
      'bma_devices',
      'cable_bus_nodes',
      'stromkreise',
      'fehler',
      'revisions',
      'chargers',
      'aufmass_markers',
      'aufmass_sessions'
    ];

    for (const table of tables) {
      // Check column names for the table first
      const columnsRes = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      const cols = columnsRes.rows.map(r => r.column_name);
      
      let countRes;
      if (cols.includes('plan_id')) {
        countRes = await client.query(`SELECT COUNT(*) FROM ${table} WHERE plan_id = $1`, [planId]);
        console.log(`Table '${table}': ${countRes.rows[0].count} rows (filtered by plan_id)`);
      } else if (cols.includes('project_id')) {
        countRes = await client.query(`SELECT COUNT(*) FROM ${table} WHERE project_id = (SELECT project_id FROM plans WHERE id = $1)`, [planId]);
        console.log(`Table '${table}': ${countRes.rows[0].count} rows (filtered by project_id)`);
      } else {
        console.log(`Table '${table}': has columns: ${cols.join(', ')} (no plan_id/project_id)`);
      }
    }

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
