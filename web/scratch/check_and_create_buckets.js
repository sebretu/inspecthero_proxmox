require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('Checking Supabase Storage buckets...');
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) {
            console.error('Failed to list buckets:', listErr.message);
            return;
        }

        console.log('Existing buckets:', buckets.map(b => b.name));

        const requiredBuckets = ['fehler-photos', 'revision-photos', 'aufmass-photos'];
        for (const bucketName of requiredBuckets) {
            const exists = buckets.some(b => b.name === bucketName);
            if (!exists) {
                console.log(`Bucket "${bucketName}" is missing! Creating it...`);
                const { data, error } = await supabase.storage.createBucket(bucketName, {
                    public: true,
                    fileSizeLimit: 10485760, // 10MB
                });
                if (error) {
                    console.error(`Failed to create bucket "${bucketName}":`, error.message);
                } else {
                    console.log(`Bucket "${bucketName}" created successfully!`);
                }
            } else {
                console.log(`Bucket "${bucketName}" already exists.`);
            }
        }
    } catch (err) {
        console.error('Error running script:', err);
    }
})();
