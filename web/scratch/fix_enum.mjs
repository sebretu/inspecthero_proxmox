import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@100.88.160.117:5432/postgres';

async function main() {
    const client = new Client({
        connectionString,
    });
    
    try {
        await client.connect();
        
        console.log("Adding 'line' to stromkreis_shape...");
        await client.query("ALTER TYPE stromkreis_shape ADD VALUE IF NOT EXISTS 'line'");
        
        console.log("Adding 'arrow' to stromkreis_shape...");
        await client.query("ALTER TYPE stromkreis_shape ADD VALUE IF NOT EXISTS 'arrow'");
        
        console.log("Adding 'line' to stromkreis_type (just in case it is an enum)...");
        try {
            await client.query("ALTER TYPE stromkreis_type ADD VALUE IF NOT EXISTS 'line'");
            await client.query("ALTER TYPE stromkreis_type ADD VALUE IF NOT EXISTS 'arrow'");
            console.log("Added to stromkreis_type successfully.");
        } catch (e) {
            console.log("stromkreis_type might not be an enum, ignoring error.");
        }

        console.log("Done!");
    } catch (err) {
        console.error("Error executing query:", err);
    } finally {
        await client.end();
    }
}

main();
