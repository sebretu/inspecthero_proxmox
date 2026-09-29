const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument, rgb, StandardFonts } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');
const fs = require('fs');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021'; // Grundfos OG
  
  // 1. Fetch plan
  const { data: plan, error: planErr } = await supabase.from('plans').select('*').eq('id', planId).single();
  if (planErr || !plan) {
    console.error("Failed to fetch plan:", planErr);
    return;
  }

  // Use plans.storage_path directly (which is v1.pdf)
  const storagePath = plan.storage_path;
  console.log(`Downloading OG PDF v1: ${storagePath}`);

  // 2. Download active PDF
  const { data: fileData, error: dlErr } = await supabase.storage.from('plans').download(storagePath);
  if (dlErr) {
    console.error("Download error:", dlErr.message);
    return;
  }

  // 3. Fetch markers
  const { data: markers, error: markersErr } = await supabase.from('stromkreise').select('*').eq('plan_id', planId);
  if (markersErr) {
    console.error("Failed to fetch markers:", markersErr);
    return;
  }

  const pdfBytes = await fileData.arrayBuffer();
  const doc = await PDFDocument.load(pdfBytes);
  const page1 = doc.getPages()[0];
  const size = page1.getSize();
  const rotationAngle = page1.getRotation().angle || 0;
  const cropBox = page1.getCropBox();
  const mediaBox = page1.getMediaBox();

  console.log(`PDF Size: w = ${size.width}, h = ${size.height}`);
  console.log(`PDF Rotation: ${rotationAngle}`);
  console.log(`CropBox: x = ${cropBox.x}, y = ${cropBox.y}, w = ${cropBox.width}, h = ${cropBox.height}`);

  const ox = cropBox.x !== undefined ? cropBox.x : (mediaBox.x || 0);
  const oy = cropBox.y !== undefined ? cropBox.y : (mediaBox.y || 0);
  const w = cropBox.width !== undefined ? cropBox.width : mediaBox.width;
  const h = cropBox.height !== undefined ? cropBox.height : mediaBox.height;

  // Let's use the actual tiles dimensions from the plan's tiles folder (gridW = 21, gridH = 20)
  // Since meta.json has gridW = 21 and gridH = 20, let's check what the original image dimensions would be.
  // Wait, if gridW = 21 and gridH = 20, let's see:
  // If the unrotated PDF page is w = 2384, h = 3370 (points) and it's rotated 90 degrees:
  // Landspaced PDF has size w = 3370, h = 2384.
  // But wait!
  // If the tiles were generated at 115 DPI, width would be 5379, height would be 3804 (gridW = 21, gridH = 15).
  // But gridH is 20!
  // What if the tiles were generated with some other size?
  // Let's calculate: scaleX and scaleY using gridW = 21 and gridH = 20:
  // Wait, in Leaflet, W = 21 * 256 = 5376, H = 20 * 256 = 5120.
  // Let's check how the scaling in StromkreiseClient.tsx calculated it for v1.pdf:
  // If imgW/imgH in plans table were different?
  // Let's check what plans.image_width and plans.image_height were before.
  // We can just calculate scaleX/scaleY using W/H directly!
  // Since scaleX = gridW * 256 / imgW, let's calculate:
  // What is imgW and imgH of the image that matches 21 x 20 tiles?
  // If the image was exactly 5376 x 5120?
  // Let's see:
  const gridW = 21 * 256; // 5376
  const gridH = 20 * 256; // 5120
  
  // Let's try scaleX = 1, scaleY = 1 (or matching the unrotated PDF)
  // Wait!
  // In the database:
  // Let's print the markers of OG in detail to see their normalized values.
  const getMarkerCoords = (marker, w, h, rot) => {
    // If the database has marker.x_norm and marker.y_norm, let's see how getMarkerCoords behaves in the client.
    // In the client, it uses scaleX and scaleY.
    // If plans.image_width = 7021, scaleX = (Math.ceil(7021/256)*256)/7021 = 7168 / 7021 = 1.0209.
    // But since the actual tiles are 21x20 (W = 5376, H = 5120),
    // let's see what happens if we use scaleX and scaleY calculated with imgW = 7021, imgH = 4967:
    const scaleX = (28 * 256) / 7021; // 1.0209
    const scaleY = (20 * 256) / 4967; // 1.0308
    
    const x = marker.x_norm * scaleX;
    const y = marker.y_norm * scaleY;
    let cx = 0;
    let cy = 0;
    if (rot === 90) {
      cx = y * w;
      cy = x * h;
    } else {
      cx = x * w;
      cy = (1 - y) * h;
    }
    return { x: cx + ox, y: cy + oy };
  };

  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  
  markers.forEach(m => {
    const coords = getMarkerCoords(m, w, h, rotationAngle);
    
    page1.drawCircle({
      x: coords.x,
      y: coords.y,
      size: 10,
      color: rgb(0, 0, 1),
      opacity: 0.8
    });

    page1.drawText(`[${m.circuit_code}]`, {
      x: coords.x + 12,
      y: coords.y - 4,
      size: 8,
      font: helveticaBold,
      color: rgb(0, 0, 1)
    });
  });

  const finalPdfBytes = await doc.save();
  fs.writeFileSync('/home/ubuntu/building-task-manager/web/scratch/og_v1_out.pdf', Buffer.from(finalPdfBytes));
  console.log("OG v1 PDF saved.");
})();
