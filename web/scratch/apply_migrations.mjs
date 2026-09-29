import fs from 'fs';
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    console.log("Connected to database.");

    // Run 20260611000000_cables_project_members.sql
    console.log("Executing 20260611000000_cables_project_members.sql ...");
    const cablesSql = fs.readFileSync('/home/ubuntu/building-task-manager/supabase/migrations/20260611000000_cables_project_members.sql', 'utf8');
    await client.query(cablesSql);
    console.log("Success.");

    // Run 20260611010000_stromkreis_snapshots.sql
    console.log("Executing 20260611010000_stromkreis_snapshots.sql ...");
    const snapshotsSql = fs.readFileSync('/home/ubuntu/building-task-manager/supabase/migrations/20260611010000_stromkreis_snapshots.sql', 'utf8');
    await client.query(snapshotsSql);
    console.log("Success.");

    // Postgrest schema reload
    console.log("Reloading schema cache...");
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log("Success.");

  } catch(e) {
    console.error("Error executing migrations:", e);
  } finally {
    await client.end();
    console.log("Disconnected.");
  }
}
main();
