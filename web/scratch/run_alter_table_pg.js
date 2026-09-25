const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  });

  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected successfully!");

    const sql = `
      ALTER TABLE public.plans 
      ADD COLUMN IF NOT EXISTS min_zoom integer,
      ADD COLUMN IF NOT EXISTS magnification integer DEFAULT 0;

      NOTIFY pgrst, 'reload schema';
    `;

    console.log("Executing schema alterations...");
    const res = await client.query(sql);
    console.log("Schema alterations successfully completed!");

    console.log("Verifying columns on 'plans' table...");
    const verRes = await client.query("SELECT * FROM public.plans LIMIT 1;");
    if (verRes.rows && verRes.rows.length > 0) {
      console.log("Columns on public.plans:", Object.keys(verRes.rows[0]));
    } else {
      console.log("No rows in plans table, but query succeeded!");
    }
  } catch (e) {
    console.error("Database operation failed:", e);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
