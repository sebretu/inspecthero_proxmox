
const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DATANORM_PATH = '/home/sebretu/datanorm.001';
const BATCH_SIZE = 100; // Smaller batch for more "real-time" feel
const SKIP_ARTICLES = 220000;

async function importMaterials() {
    const fileStream = fs.createReadStream(DATANORM_PATH, { encoding: 'latin1' });

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let count = 0;
    let articlesCount = 0;
    let added = 0;
    let duplicates = 0;
    let errors = 0;

    console.log(`Resuming import (skipping first ${SKIP_ARTICLES} articles)...`);

    let batch = [];

    const processBatch = async (items) => {
        if (items.length === 0) return;

        try {
            const uniqueBatchItems = [];
            const seenInBatch = new Set();
            for (const item of items) {
                if (!item.article_number || !seenInBatch.has(item.article_number)) {
                    uniqueBatchItems.push(item);
                    if (item.article_number) seenInBatch.add(item.article_number);
                } else {
                    duplicates++;
                }
            }

            const articleNumbers = uniqueBatchItems.map(item => item.article_number).filter(Boolean);

            let existingByArtNum = new Set();
            if (articleNumbers.length > 0) {
                const { data } = await supabase
                    .from('materials')
                    .select('article_number')
                    .in('article_number', articleNumbers);
                if (data) {
                    data.forEach(m => existingByArtNum.add(m.article_number));
                }
            }

            const toAdd = [];
            for (const item of uniqueBatchItems) {
                if (item.name.toLowerCase().includes('diverser')) continue;
                if (item.article_number && existingByArtNum.has(item.article_number)) {
                    duplicates++;
                    continue;
                }
                toAdd.push(item);
            }

            if (toAdd.length > 0) {
                const { error } = await supabase.from('materials').insert(toAdd);
                if (error) {
                    for (const s of toAdd) {
                        const { error: singleErr } = await supabase.from('materials').insert(s);
                        if (singleErr) errors++; else added++;
                    }
                } else {
                    added += toAdd.length;
                    console.log(`Added batch of ${toAdd.length} materials. Total added this run: ${added}`);
                }
            }
        } catch (err) {
            console.error(`Error in batch:`, err.message);
            errors += items.length;
        }
    };

    for await (const line of rl) {
        count++;
        const fields = line.split(';');
        if (fields[0] === 'A') {
            articlesCount++;
            if (articlesCount <= SKIP_ARTICLES) continue;

            const articleNumber = fields[2]?.trim();
            const name = fields[5] ? `${fields[4]?.trim()} ${fields[5]?.trim()}` : fields[4]?.trim();
            const unit = fields[8]?.trim() || 'szt';

            if (!name) continue;

            batch.push({ name, unit, article_number: articleNumber || null });

            if (batch.length >= BATCH_SIZE) {
                await processBatch(batch);
                batch = [];
            }
        }

        if (count % 50000 === 0) {
            console.log(`Stats: ${count} lines, ${articlesCount} articles processed.`);
        }
    }

    if (batch.length > 0) await processBatch(batch);
    console.log('Done.');
}

importMaterials();
