import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    const res = await client.query("SELECT name FROM projects WHERE id='45558114-382e-4e5c-a277-2d5532c71f58'");
    console.log("Project Name:", res.rows);
  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
