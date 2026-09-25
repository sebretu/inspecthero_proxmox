import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url!, key!);

async function check() {
  const { data, error } = await supabase.from('bma_routes').select('*').limit(1);
  if (data && data[0]) {
    console.log('Columns in bma_routes:', Object.keys(data[0]));
  } else {
    console.log('No data in bma_routes to inspect columns.');
  }
}
check();
