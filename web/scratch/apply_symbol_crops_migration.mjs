import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const { Client } = pg;

const endpoints = [
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  'postgresql://postgres:postgres@localhost:54322/postgres',
  'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
].filter(Boolean);

async function run() {
  const sqlPath = path.join(process.cwd(), '../supabase/migrations/20260718171800_create_symbol_crops.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  let success = false;
  for (const connStr of endpoints) {
    console.log(`Trying connection to: ${connStr.replace(/:[^:@/]+@/, ':***@')}`);
    const client = new Client({ connectionString: connStr });
    try {
      await client.connect();
      console.log("Connected successfully. Running migration SQL...");
      await client.query(sql);
      console.log("MIGRATION APPLIED SUCCESSFULLY!");
      await client.end();
      success = true;
      break;
    } catch (err) {
      console.error(`Failed connection/migration: ${err.message}`);
      try { await client.end(); } catch {}
    }
  }

  if (!success) {
    throw new Error("Could not apply migration to any of the databases.");
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
