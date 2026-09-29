import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  try {
    await client.connect();
    
    console.log("--- STROMKREIS HISTORY ---");
    const res = await client.query('SELECT * FROM public.stromkreis_history ORDER BY created_at DESC LIMIT 50');
    console.log(`Found ${res.rows.length} rows in stromkreis_history:`);
    console.log(JSON.stringify(res.rows, null, 2));

    console.log("--- USERS IN PROFILES ---");
    const profiles = await client.query('SELECT id, email, full_name, role FROM public.profiles LIMIT 20');
    console.log(JSON.stringify(profiles.rows, null, 2));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
