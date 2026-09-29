import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const proj = await supabase.from('projects').select('company_id').eq('id', '45558114-382e-4e5c-a277-2d5532c71f58').single();
console.log("PROJECT COMPANY", proj.data);
