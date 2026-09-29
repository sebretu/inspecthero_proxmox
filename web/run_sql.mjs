import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const sql = fs.readFileSync('../supabase/migrations/20260611020000_company_cable_types.sql', 'utf8');
  await client.query(sql);
  console.log("MIGRATION APPLIED");
  await client.end();
}
run().catch(console.error);
