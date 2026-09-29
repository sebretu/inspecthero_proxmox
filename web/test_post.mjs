import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('cable_categories').insert([{ project_id: '45558114-382e-4e5c-a277-2d5532c71f58', name: 'TEST_CABLE_TYPE' }]);
console.log("INSERT", error);
