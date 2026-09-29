import pg from 'pg';
const { Client } = pg;

async function run() {
  console.log("Initializing client...");
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres',
    connectionTimeoutMillis: 3000,
  });

  try {
    console.log("Connecting...");
    await client.connect();
    console.log("Connected successfully!");
    const res = await client.query("SELECT 1 as num");
    console.log("Query result:", res.rows);
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await client.end();
    console.log("Client closed.");
  }
}
run();
