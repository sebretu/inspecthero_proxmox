import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    const res = await client.query('SELECT COUNT(*) FROM stromkreise;');
    console.log("Total markers in DB:", res.rows[0].count);

    const snaps = await client.query('SELECT id, name, created_at FROM stromkreis_snapshots;');
    console.log("Snapshots:", snaps.rows);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}
main();
