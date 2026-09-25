const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.storage.createBucket('aufmass-photos', { public: true }).then(r => console.log("Created:", r)).catch(console.error);
