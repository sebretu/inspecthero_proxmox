import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' }); 

import fs from 'fs';

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    const sql = fs.readFileSync('/home/ubuntu/building-task-manager/supabase/migrations/20260609120000_create_pdf_sessions.sql', 'utf8');
    await client.query(sql);
    console.log("Migration applied successfully!");
  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
