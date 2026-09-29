import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
});

async function run() {
    try {
        console.log("Applying stromkreis_snapshots migration...");
        const sql = fs.readFileSync('/home/ubuntu/building-task-manager/supabase/migrations/20260611010000_stromkreis_snapshots.sql', 'utf8');
        await pool.query(sql);
        console.log("Migration applied successfully!");
    } catch (e) {
        console.error('Error applying migration:', e);
    } finally {
        await pool.end();
    }
}
run();
