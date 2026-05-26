
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey ? 'PRESENT' : 'MISSING');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Fetching materials...');
    try {
        const { data, error } = await supabase
            .from('materials')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching materials:', error);
        } else {
            console.log('Materials columns:', Object.keys(data[0] || {}));
            if (data[0]) {
                console.log('Sample material name:', data[0].name);
                console.log('Sample material article_number:', data[0].article_number);
            } else {
                console.log('No materials found');
            }
        }
    } catch (e) {
        console.error('Catch error:', e);
    }
}

checkSchema().then(() => console.log('Done')).catch(err => console.error('Final catch:', err));
