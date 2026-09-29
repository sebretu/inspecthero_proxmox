import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' });
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'plans';");
  console.log("Columns in plans table:", res.rows);
  await client.end();
}

run().catch(console.error);
