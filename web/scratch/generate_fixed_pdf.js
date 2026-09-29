const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument, rgb, degrees, StandardFonts } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');
const fs = require('fs');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const planId = '990da539-ab71-42da-a501-45bf840a8d99'; // Grundfos EG
  
  // 1. Fetch plan
  const { data: plan, error: planErr } = await supabase.from('plans').select('*').eq('id', planId).single();
  if (planErr || !plan) {
    console.error("Failed to fetch plan:", planErr);
    return;
  }

  // 2. Fetch active version
  const { data: activeVersion } = await supabase
    .from("plan_versions")
    .select("file_url")
    .eq("plan_id", planId)
    .eq("status", "active")
    .maybeSingle();

  if (!activeVersion) {
    console.error("No active version found!");
    return;
  }

  let storagePath = plan.storage_path;
  if (activeVersion.file_url) {
    if (activeVersion.file_url.includes("/")) {
      storagePath = activeVersion.file_url;
    } else {
      const parts = plan.storage_path.split("/");
      parts.pop();
      parts.push(activeVersion.file_url);
      storagePath = parts.join("/");
    }
  }

  console.log(`Downloading correct PDF: ${storagePath}`);

  // 3. Download active PDF
  const { data: fileData, error: dlErr } = await supabase.storage.from('plans').download(storagePath);
  if (dlErr) {
    console.error("Download error:", dlErr.message);
    return;
  }

  // 4. Fetch markers
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

  const ox = cropBox.x !== undefined ? cropBox.x : (mediaBox.x || 0);
  const oy = cropBox.y !== undefined ? cropBox.y : (mediaBox.y || 0);
  const w = cropBox.width !== undefined ? cropBox.width : mediaBox.width;
  const h = cropBox.height !== undefined ? cropBox.height : mediaBox.height;

  let imgW = plan.image_width;
  let imgH = plan.image_height;

  let scaleX = 1;
  let scaleY = 1;
  if (imgW && imgH) {
    const tileSize = 256;
    const gridW = Math.ceil(imgW / tileSize) * tileSize;
    const gridH = Math.ceil(imgH / tileSize) * tileSize;
    scaleX = gridW / imgW;
    scaleY = gridH / imgH;
  }

  const getMarkerCoords = (marker, w, h, rot) => {
    const x = marker.x_norm * scaleX;
    const y = marker.y_norm * scaleY;
    let cx = 0;
    let cy = 0;
    if (rot === 90) {
      cx = y * w;
      cy = x * h;
    } else if (rot === 180) {
      cx = (1 - x) * w;
      cy = y * h;
    } else if (rot === 270) {
      cx = y * w;
      cy = (1 - x) * h;
    } else {
      cx = x * w;
      cy = (1 - y) * h;
    }
    return { x: cx + ox, y: cy + oy };
  };

  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  
  markers.forEach(m => {
    const coords = getMarkerCoords(m, w, h, rotationAngle);
    
    // Draw red circle at marker location
    page1.drawCircle({
      x: coords.x,
      y: coords.y,
      size: 10,
      color: rgb(1, 0, 0),
      opacity: 0.8
    });

    // Draw text label next to it
    page1.drawText(`[${m.circuit_code}]`, {
      x: coords.x + 12,
      y: coords.y - 4,
      size: 8,
      font: helveticaBold,
      color: rgb(1, 0, 0)
    });
  });

  // Save the PDF
  const finalPdfBytes = await doc.save();
  fs.writeFileSync('/home/ubuntu/building-task-manager/web/scratch/fixed_out.pdf', Buffer.from(finalPdfBytes));
  console.log("Fixed PDF saved to scratch/fixed_out.pdf");
})();
