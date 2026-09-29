import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from("cable_categories").select("name, projects!inner(company_id)").eq("projects.company_id", "68d0009d-18a1-4fff-8629-db39a1c5388f");
console.log("GET ERROR", error);
console.log("GET DATA LEN", data?.length);
console.log("TEST FOUND", data?.filter(x => x.name.includes('NYM-J 3x2.5')));
