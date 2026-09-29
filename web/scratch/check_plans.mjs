import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' });
  await client.connect();
  const res = await client.query('SELECT plan_id, COUNT(*) FROM stromkreise GROUP BY plan_id;');
  console.log("Markers per plan:", res.rows);
  const snapRes = await client.query('SELECT id, name FROM stromkreis_snapshots;');
  console.log("Snapshots:", snapRes.rows);
  await client.end();
}
main().catch(console.error);
