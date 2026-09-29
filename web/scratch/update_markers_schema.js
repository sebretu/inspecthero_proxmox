const { Client } = require('pg');
const connectionString = 'postgresql://postgres:postgres@100.88.160.117:54322/postgres';

async function main() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log("Adding photo_id column to aufmass_markers...");
        await client.query(`ALTER TABLE public.aufmass_markers ADD COLUMN IF NOT EXISTS photo_id UUID REFERENCES public.aufmass_photos(id) ON DELETE SET NULL;`);
        
        console.log("Reloading schema...");
        await client.query(`NOTIFY pgrst, 'reload schema';`);
        
        console.log("Done.");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}
main();
