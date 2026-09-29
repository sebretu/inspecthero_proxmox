import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
});

async function run() {
    try {
        await pool.query('ALTER TABLE public.stromkreise DROP CONSTRAINT IF EXISTS stromkreise_circuit_code_check;');
        console.log('Constraint dropped successfully');
    } catch (e) {
        console.error('Error dropping constraint:', e);
    } finally {
        await pool.end();
    }
}
run();
