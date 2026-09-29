import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://100.88.160.117:8000'; // the supabase instance IP
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// we can run a direct psql command to check RLS policies
