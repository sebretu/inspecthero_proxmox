const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  try {
    await client.connect();
    console.log("Connected to 100.88.160.117:54322 from container!");
    
    console.log("Dropping existing constraint...");
    await client.query(`
      ALTER TABLE public.aufmass_sessions DROP CONSTRAINT IF EXISTS aufmass_sessions_session_type_check;
    `);
    
    console.log("Adding updated constraint with 'bestellung'...");
    await client.query(`
      ALTER TABLE public.aufmass_sessions ADD CONSTRAINT aufmass_sessions_session_type_check CHECK (session_type IN ('aufmass', 'zusatz', 'baubehinderung', 'bestellung'));
    `);
    
    console.log("Reloading schema cache...");
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    
    console.log("SUCCESS!");
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
