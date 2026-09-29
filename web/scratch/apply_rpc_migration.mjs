import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected successfully!");

    const sqlPath = '/home/ubuntu/building-task-manager/supabase/migrations/20260612000005_rpc_restore_snapshot.sql';
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing schema alterations...");
    await client.query(sql);
    console.log("Schema alterations successfully completed!");

    console.log("Reloading schema cache...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema reloaded!");
  } catch (e) {
    console.error("Database operation failed:", e);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
