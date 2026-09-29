const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    await client.connect();
    console.log("Connected successfully!");

    console.log("\n=== Checking Aufmass Sessions of type 'zusatz' ===");
    const resSessions = await client.query("SELECT id, name, session_type, description FROM public.aufmass_sessions WHERE session_type = 'zusatz'");
    console.log(resSessions.rows);

    const sessionIds = resSessions.rows.map(r => r.id);
    if (sessionIds.length > 0) {
      const idsPlaceholder = sessionIds.map((_, i) => `$${i + 1}`).join(',');
      
      console.log("\n=== Checking Materials for those sessions ===");
      const resMats = await client.query(`SELECT id, session_id, photo_id, item_name, quantity, unit, price FROM public.aufmass_materials WHERE session_id IN (${idsPlaceholder})`, sessionIds);
      console.log(resMats.rows);

      console.log("\n=== Checking Labor for those sessions ===");
      const resLab = await client.query(`SELECT id, session_id, photo_id, worker_count, estimated_hours, description FROM public.aufmass_labor WHERE session_id IN (${idsPlaceholder})`, sessionIds);
      console.log(resLab.rows);
    } else {
      console.log("No 'zusatz' sessions found.");
    }
  } catch (e) {
    console.error("Database query failed:", e);
  } finally {
    await client.end();
  }
}

run();
