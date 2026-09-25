import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const datanormPath = '/home/sebretu/datanorm.001';
const BATCH_SIZE = 1000;

async function importDatanorm() {
    console.log(`Starting Datanorm import from ${datanormPath}...`);

    if (!fs.existsSync(datanormPath)) {
        console.error(`File not found: ${datanormPath}`);
        return;
    }

    // Use latin1 encoding as Datanorm is often ISO-8859-1
    const fileStream = fs.createReadStream(datanormPath, { encoding: 'latin1' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    let batch: any[] = [];
    let count = 0;
    let imported = 0;

    for await (const line of rl) {
        count++;
        if (line.startsWith('A;')) {
            const parts = line.split(';');
            // Field indices (0-based) for DATANORM 4/5 A record:
            // 0: Record type (A)
            // 1: Key (Transaction key)
            // 2: Article number
            // 3: Modification flag
            // 4: Text 1
            // 5: Text 2
            // 6: Matchcode
            // 7: Unit (numeric/code)

            const articleNumber = parts[2]?.trim();
            const text1 = parts[4]?.trim() || '';
            const text2 = parts[5]?.trim() || '';
            const name = `${text1} ${text2}`.trim();
            const unitCode = parts[7]?.trim();

            // Basic unit mapping (common DATANORM unit codes)
            let unit = 'st.';
            if (unitCode === '01' || unitCode === '1') unit = 'st.';
            else if (unitCode === '02' || unitCode === '2') unit = 'm';
            else if (unitCode === '05' || unitCode === '5') unit = 'kg';

            if (name && articleNumber) {
                batch.push({
                    name,
                    article_number: articleNumber,
                    unit,
                });

                if (batch.length >= BATCH_SIZE) {
                    await insertBatch(batch);
                    imported += batch.length;
                    console.log(`Imported ${imported} articles...`);
                    batch = [];
                }
            }
        }
    }

    if (batch.length > 0) {
        await insertBatch(batch);
        imported += batch.length;
    }

    console.log(`\nImport completed.`);
    console.log(`Total lines processed: ${count}`);
    console.log(`Total articles imported/updated: ${imported}`);
}

async function insertBatch(data: any[]) {
    // Use upsert on article_number (unique constraint added previously)
    const { error } = await supabase.from('materials').upsert(data, {
        onConflict: 'article_number',
        ignoreDuplicates: false, // Update if exists
    });

    if (error) {
        console.error('Error in batch upsert:', error.message);
    }
}

importDatanorm().catch(console.error);
