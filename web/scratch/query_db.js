const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected successfully!");

    console.log("\n=== Checking Tomek's record in auth.users ===");
    const resTomek = await client.query("SELECT id, email, role, raw_user_meta_data FROM auth.users WHERE email = 'tomek@inspecthero.pl'");
    console.log(JSON.stringify(resTomek.rows, null, 2));

    console.log("\n=== Checking triggers on auth.users ===");
    const resTriggers = await client.query(`
      SELECT tgname, tgfoid::regproc, event_object_table
      FROM information_schema.triggers t
      JOIN pg_trigger pg_t ON t.trigger_name = pg_t.tgname
      WHERE event_object_schema = 'auth' OR event_object_table = 'users'
    `);
    console.log(JSON.stringify(resTriggers.rows, null, 2));

    console.log("\n=== Checking function definitions for auth.users triggers ===");
    // If there is any trigger function like public.handle_new_user or auth.handle_new_user
    const resFunc = await client.query(`
      SELECT routine_name, routine_definition 
      FROM information_schema.routines 
      WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
        AND (routine_definition LIKE '%auth%' OR routine_name LIKE '%user%')
    `);
    for (const row of resFunc.rows) {
      console.log(`Function: ${row.routine_name}`);
      console.log(row.routine_definition);
      console.log("-----------------------------------------");
    }

  } catch (e) {
    console.error("Database query failed:", e);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
