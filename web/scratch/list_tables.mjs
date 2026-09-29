import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' });
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log("Tables in database:", res.rows.map(r => r.table_name));
  await client.end();
}

run().catch(console.error);
