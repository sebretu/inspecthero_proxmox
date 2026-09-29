const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@100.88.160.117:54322/postgres';

async function main() {
    console.log("Connecting to:", connectionString);
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log("Connected successfully!");
        
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

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

main();
