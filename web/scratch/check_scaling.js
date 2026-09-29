const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://api.inspecthero.pl';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const planId = '725295c2-404e-446e-abae-f9bf03b3617b'; // from previous context
  const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
  if (!plan) {
    console.error('Plan not found');
    return;
  }
  console.log('Plan:', plan.id);
  console.log('Image width:', plan.image_width, 'height:', plan.image_height);

  const { data } = await supabase.storage.from(plan.storage_bucket).download(plan.storage_path);
  if (!data) {
    console.error('PDF not downloaded');
    return;
  }

  const pdfBytes = await data.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page1 = pdfDoc.getPages()[0];
  const { width, height } = page1.getSize();
  const crop = page1.getCropBox();
  const media = page1.getMediaBox();
  console.log('PDF Size:', { width, height });
  console.log('CropBox:', crop);
  console.log('MediaBox:', media);
  
  // Leaflet marker size at max zoom
  const leafletFontSize = 23.4;
  console.log(`Leaflet marker size at max zoom: ${leafletFontSize}px`);
  console.log(`Leaflet marker / Image Width: ${(leafletFontSize / plan.image_width * 100).toFixed(3)}%`);

  // PDF marker size
  const pdfFontSize = 5.0;
  console.log(`PDF marker size: ${pdfFontSize}pt`);
  console.log(`PDF marker / PDF Width: ${(pdfFontSize / (crop.width || media.width) * 100).toFixed(3)}%`);
}

main().catch(console.error);
