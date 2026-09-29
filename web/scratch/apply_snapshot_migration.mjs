import fs from 'fs';
import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    console.log("Applying migration 20260612000004_add_version_snapshot.sql ...");
    const sql = fs.readFileSync('/home/ubuntu/building-task-manager/supabase/migrations/20260612000004_add_version_snapshot.sql', 'utf8');
    await client.query(sql);
    console.log("Migration applied successfully.");

    console.log("Reloading PostgREST schema cache...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema cache reloaded.");

  } catch (e) {
    console.error("Error applying migration:", e);
  } finally {
    await client.end();
    console.log("Disconnected.");
  }
}
main();
