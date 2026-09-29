import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from("cable_categories").select("name, projects!inner(company_id)").eq("projects.company_id", "45558114-382e-4e5c-a277-2d5532c71f58");
console.log("GET", error, data?.filter(x => x.name.includes('TEST')));
