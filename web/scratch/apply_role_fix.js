const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Connected successfully!");

    console.log("Altering auth.users.role column to set default to 'authenticated'...");
    await client.query("ALTER TABLE auth.users ALTER COLUMN role SET DEFAULT 'authenticated'");
    console.log("Altered successfully!");

    console.log("Updating existing users with empty or null roles to 'authenticated'...");
    const updateRes = await client.query("UPDATE auth.users SET role = 'authenticated' WHERE role IS NULL OR role = ''");
    console.log(`Updated ${updateRes.rowCount} users!`);

    console.log("Checking updated default value...");
    const resCol = await client.query(`
      SELECT column_name, column_default, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'role'
    `);
    console.log(JSON.stringify(resCol.rows, null, 2));

    console.log("Checking Tomek's record after update...");
    const resTomek = await client.query("SELECT id, email, role FROM auth.users WHERE email = 'tomek@inspecthero.pl'");
    console.log(JSON.stringify(resTomek.rows, null, 2));

  } catch (e) {
    console.error("Database operation failed:", e);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
