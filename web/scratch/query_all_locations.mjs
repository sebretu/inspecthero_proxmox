import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  try {
    await client.connect();
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log("Tables in public schema:");
    console.log(tables.rows.map(r => r.table_name));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
