import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' });
  await client.connect();
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("PostgREST schema cache reload triggered.");
  await client.end();
}

run().catch(console.error);
