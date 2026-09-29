const { Client } = require('pg');
const connectionString = 'postgresql://postgres:postgres@100.88.160.117:54322/postgres';

async function main() {
    const client = new Client({ connectionString });
    await client.connect();
    const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'aufmass_markers'`);
    console.log(res.rows);
    await client.end();
}
main();
