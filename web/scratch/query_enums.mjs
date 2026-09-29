import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@100.88.160.117:54322/postgres';

async function main() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        
        // Query enum values for stromkreis_type
        console.log("=== stromkreis_type enum values ===");
        const resType = await client.query(`
            SELECT enumlabel FROM pg_enum 
            WHERE enumtypid = 'stromkreis_type'::regtype
            ORDER BY enumsortorder
        `);
        console.log(resType.rows.map(r => r.enumlabel));

        // Query enum values for stromkreis_shape
        console.log("\n=== stromkreis_shape enum values ===");
        const resShape = await client.query(`
            SELECT enumlabel FROM pg_enum 
            WHERE enumtypid = 'stromkreis_shape'::regtype
            ORDER BY enumsortorder
        `);
        console.log(resShape.rows.map(r => r.enumlabel));

        // Get table info for stromkreise
        console.log("\n=== stromkreise table columns ===");
        const resCols = await client.query(`
            SELECT column_name, data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_name = 'stromkreise'
        `);
        console.log(resCols.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

main();
