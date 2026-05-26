const { Client } = require('pg');
const client = new Client({
  connectionString: "postgresql://postgres:postgres@api.inspecthero.pl:5432/postgres"
});
client.connect()
  .then(() => client.query("ALTER TABLE public.aufmass_photos ADD COLUMN IF NOT EXISTS photo_type VARCHAR(50) DEFAULT 'BEFORE'"))
  .then(() => { console.log("Success"); client.end(); })
  .catch(e => { console.error("Error", e); client.end(); });
