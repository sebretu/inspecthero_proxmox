import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' });

async function run() {
  await client.connect();
  
  console.log("Dropping foreign key constraint...");
  const res = await client.query(`
    ALTER TABLE public.aufmass_versions 
    DROP CONSTRAINT IF EXISTS aufmass_versions_photo_id_fkey;
  `);
  console.log("Constraint dropped!", res);

  console.log("Verifying remaining constraints...");
  const res2 = await client.query(`
    SELECT
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'aufmass_versions';
  `);
  console.log(JSON.stringify(res2.rows, null, 2));

  await client.end();
}

run().catch(console.error);
