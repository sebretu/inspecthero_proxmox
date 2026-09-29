const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    await client.connect();

    console.log("\n=== Checking column definition of auth.users.role ===");
    const resCol = await client.query(`
      SELECT column_name, column_default, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'role'
    `);
    console.log(JSON.stringify(resCol.rows, null, 2));

  } catch (e) {
    console.error("Database query failed:", e);
  } finally {
    await client.end();
  }
}

run();
