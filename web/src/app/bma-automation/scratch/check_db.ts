import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL found:', !!url);
console.log('Key found:', !!key);

if (!url || !key) {
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    const { error } = await supabase.from('bma_devices').select('*').limit(1);
    if (error) {
        console.log('Error checking bma_devices:', error.message);
    } else {
        console.log('bma_devices exists');
    }
}

check();
