import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const plans = ["990da539-ab71-42da-a501-45bf840a8d99", "633c788d-fe28-4f0d-97f1-87d2affe9021"];

async function run() {
  for (const pid of plans) {
    const { data: plan, error: e1 } = await supabase.from('plans').select('*').eq('id', pid).single();
    const { data: ver, error: e2 } = await supabase.from('plan_versions').select('*').eq('plan_id', pid).eq('status', 'active').single();
    
    if (e1 || e2) {
      console.error(`Error for ${pid}:`, e1 || e2);
      continue;
    }
    
    console.log(`Plan ID: ${pid}`);
    console.log(`  Plan: image_width=${plan.image_width}, image_height=${plan.image_height}`);
    console.log(`  Version: width_px=${ver.width_px}, height_px=${ver.height_px}, transformation_model=${JSON.stringify(ver.transformation_model)}`);
  }
}

run().catch(console.error);
