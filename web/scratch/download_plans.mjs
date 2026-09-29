import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const targets = [
  {
    planId: '990da539-ab71-42da-a501-45bf840a8d99',
    storagePath: 'projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/98a53dfe-deed-4948-8dc2-e305214f9a35/v1.pdf',
    activeUrl: 'plan_990da539-ab71-42da-a501-45bf840a8d99_v2.pdf',
    name: 'grundfos_eg.pdf'
  },
  {
    planId: '633c788d-fe28-4f0d-97f1-87d2affe9021',
    storagePath: 'projects/45558114-382e-4e5c-a277-2d5532c71f58/floors/f7b3b7a6-c995-41c9-bba8-fd19a33bbc74/v1.pdf',
    activeUrl: 'plan_633c788d-fe28-4f0d-97f1-87d2affe9021_v2.pdf',
    name: 'grundfos_og.pdf'
  }
];

async function run() {
  for (const t of targets) {
    const parts = t.storagePath.split('/');
    parts.pop();
    parts.push(t.activeUrl);
    const reconstructedPath = parts.join('/');
    console.log(`Downloading: ${reconstructedPath} -> ${t.name}`);

    const { data: fileData, error } = await supabase.storage.from('plans').download(reconstructedPath);
    if (error) {
      console.error(`  -> Download error for ${t.planId}:`, error.message);
    } else {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const destPath = path.join("/home/ubuntu/building-task-manager/web/scratch", t.name);
      fs.writeFileSync(destPath, buffer);
      console.log(`  -> Saved to ${destPath}`);
    }
  }
}

run().catch(console.error);
