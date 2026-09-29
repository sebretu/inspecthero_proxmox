import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    
    // Query enum values for stromkreis_type
    console.log("=== stromkreis_type enum values ===");
    const resType = await client.query(`
        SELECT enumlabel FROM pg_enum 
        WHERE enumtypid = 'stromkreis_type'::regtype
        ORDER BY enumsortorder
    `);
    console.log(resType.rows.map(r => r.enumlabel));

    // Query enum values for stromkreis_shape
    console.log("\n=== stromkreis_shape enum values ===");
    const resShape = await client.query(`
        SELECT enumlabel FROM pg_enum 
        WHERE enumtypid = 'stromkreis_shape'::regtype
        ORDER BY enumsortorder
    `);
    console.log(resShape.rows.map(r => r.enumlabel));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
