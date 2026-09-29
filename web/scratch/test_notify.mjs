import pg from 'pg';
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' });
  await client.connect();
  console.log("Connected. Sending NOTIFY...");
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("NOTIFY sent successfully.");
  await client.end();
}

run().catch(console.error);
