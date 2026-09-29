const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT * FROM pg_policies WHERE tablename = 'companies'`);
    console.log(rows);
  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
