const { Client } = require('pg');
const connectionString = 'postgresql://postgres:postgres@100.88.160.117:54322/postgres';

async function main() {
    console.log("Connecting to:", connectionString);
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log("Connected successfully!");
        
        console.log("Dropping constraint...");
        await client.query(`ALTER TABLE public.aufmass_sessions DROP CONSTRAINT IF EXISTS aufmass_sessions_session_type_check;`);
        
        console.log("Adding new constraint with 'bestellung'...");
        await client.query(`ALTER TABLE public.aufmass_sessions ADD CONSTRAINT aufmass_sessions_session_type_check CHECK (session_type IN ('aufmass', 'zusatz', 'baubehinderung', 'bestellung'));`);

        console.log("Reloading schema...");
        await client.query(`NOTIFY pgrst, 'reload schema';`);
        
        console.log("Constraint updated successfully!");

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}
main();
