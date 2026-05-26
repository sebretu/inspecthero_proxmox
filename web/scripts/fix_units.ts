import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixUnitsAndVerify() {
    console.log('--- Verifying Data ---');
    const { data: samples, error: sampleErr } = await supabase
        .from('materials')
        .select('name, unit, article_number')
        .not('article_number', 'is', null)
        .limit(5);

    if (sampleErr) console.error('Error fetching samples:', sampleErr);
    else console.log('Sample Materials with article_number:', samples);

    console.log('\n--- Fixing Units ---');
    // Update materials
    const { count: matCount, error: matErr } = await supabase
        .from('materials')
        .update({ unit: 'st.' })
        .eq('unit', 'szt.');

    if (matErr) console.error('Error updating materials:', matErr);
    else console.log(`Updated ${matCount} materials from szt. to st.`);

    // Update order_items
    const { count: itemCount, error: itemErr } = await supabase
        .from('order_items')
        .update({ custom_unit: 'st.' })
        .eq('custom_unit', 'szt.');

    if (itemErr) console.error('Error updating order_items:', itemErr);
    else console.log(`Updated ${itemCount} order items from szt. to st.`);

    console.log('\nDone.');
}

fixUnitsAndVerify().catch(console.error);
