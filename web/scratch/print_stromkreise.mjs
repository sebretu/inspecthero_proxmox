import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  
  try {
    await client.connect();
    
    const strom = await client.query(
      "SELECT * FROM stromkreise WHERE plan_id = $1 LIMIT 5",
      [planId]
    );
    console.log(`Current stromkreise:`);
    console.log(JSON.stringify(strom.rows, null, 2));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
