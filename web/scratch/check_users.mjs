import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    
    // Check users
    const res = await client.query(`
      SELECT id, email 
      FROM auth.users limit 5;
    `);
    console.log("Users:", res.rows);
  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
