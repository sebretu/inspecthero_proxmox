require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    const { data, error } = await supabase.storage.createBucket('revision-photos', {
        public: true,
        fileSizeLimit: 10485760,
    });
    if (error && !error.message.includes('already exists')) {
        console.error('Bucket error:', error.message);
    } else {
        console.log('Bucket ready:', data ? JSON.stringify(data) : 'already exists');
    }
})();
