const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Connected successfully!");

    console.log("Creating trigger function to ensure authenticated role...");
    const funcSql = `
      CREATE OR REPLACE FUNCTION public.ensure_authenticated_role()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.role IS NULL OR NEW.role = '' THEN
          NEW.role := 'authenticated';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
    await client.query(funcSql);
    console.log("Function created successfully!");

    console.log("Creating BEFORE INSERT OR UPDATE trigger on auth.users...");
    const triggerSql = `
      DROP TRIGGER IF EXISTS trg_ensure_authenticated_role ON auth.users;
      CREATE TRIGGER trg_ensure_authenticated_role
      BEFORE INSERT OR UPDATE OF role ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.ensure_authenticated_role();
    `;
    await client.query(triggerSql);
    console.log("Trigger created successfully!");

  } catch (e) {
    console.error("Database operation failed:", e);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
