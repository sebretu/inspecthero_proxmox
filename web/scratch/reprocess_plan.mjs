import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const planId = 'cb22d136-88e9-4846-8ff9-4727206205a9';

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Reprocessing plan ${planId} with higher resolution...`);
  
  const { data: plan, error: planError } = await supabase.from('plans').select('*').eq('id', planId).single();
  if (planError) throw planError;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reprocess-'));
  const pdfPath = path.join(workDir, 'plan.pdf');
  const pngBase = path.join(workDir, 'page');

  console.log(`Downloading PDF from ${plan.storage_bucket}/${plan.storage_path}...`);
  const { data: pdfBlob, error: downloadError } = await supabase.storage.from(plan.storage_bucket).download(plan.storage_path);
  if (downloadError) throw downloadError;
  
  fs.writeFileSync(pdfPath, Buffer.from(await pdfBlob.arrayBuffer()));

  console.log('Generating high-res PNG (DPI 300)...');
  // 300 DPI is 2x the original 150, which is 4x the pixel count.
  execFileSync('pdftoppm', ['-png', '-r', '300', pdfPath, pngBase]);

  const page1 = `${pngBase}-1.png`;

  if (!fs.existsSync(page1)) {
    throw new Error(`Expected file not found: ${page1}`);
  }

  console.log('Generating tiles (maxZoom 6)...');
  // Increased maxZoom to 6 to account for the 2x resolution increase (150 -> 300 DPI)
  execFileSync('node', [
    'scripts/generate-tiles.mjs',
    `--planId=${planId}`,
    `--input=${page1}`,
    '--tileSize=256',
    '--minZoom=1',
    '--maxZoom=6'
  ]);

  console.log('Updating plan metadata in DB...');
  const metaPath = path.join(process.cwd(), 'private_tiles', planId, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  
  const { error: updateError } = await supabase.from('plans').update({
    image_width: meta.imageWidth,
    image_height: meta.imageHeight,
    updated_at: new Date().toISOString()
  }).eq('id', planId);
  
  if (updateError) throw updateError;

  console.log('Cleanup...');
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(`Successfully reprocessed plan ${planId}. New resolution: ${meta.imageWidth}x${meta.imageHeight}, Max Zoom: 6`);
}

run().catch((err) => {
  console.error('Reprocess failed:', err);
  process.exit(1);
});
