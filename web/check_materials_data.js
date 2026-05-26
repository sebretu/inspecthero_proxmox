
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const { data, error } = await supabase
        .from('materials')
        .select('id, name, article_number')
        .not('article_number', 'is', null);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${data.length} materials with article_number`);
        if (data.length > 0) {
            console.log('Last 5:', data.slice(-5));
        }
    }
}

checkData();
