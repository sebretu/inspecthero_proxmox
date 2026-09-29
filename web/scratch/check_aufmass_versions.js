import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

console.log("DATABASE_URL:", process.env.DATABASE_URL);
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log("Connecting to database...");
  await client.connect();
  console.log("Connected!");
  
  const res = await client.query("select column_name, data_type from information_schema.columns where table_name = 'aufmass_versions'");
  console.log("COLUMNS:", res.rows);
  
  const res2 = await client.query("select column_name, data_type from information_schema.columns where table_name = 'aufmass_sessions'");
  console.log("SESSIONS COLUMNS:", res2.rows);

  await client.end();
}
run().catch(err => {
  console.error("Run error:", err);
  process.exit(1);
});
