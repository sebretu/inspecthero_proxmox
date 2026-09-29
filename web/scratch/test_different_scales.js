const { createClient } = require('/home/ubuntu/building-task-manager/web/node_modules/@supabase/supabase-js');
const { PDFDocument, rgb, StandardFonts } = require('/home/ubuntu/building-task-manager/web/node_modules/pdf-lib');
const fs = require('fs');

const sbUrl = 'https://api.inspecthero.pl';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ';
const supabase = createClient(sbUrl, sbKey);

(async () => {
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021'; // OG
  const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
  const { data: activeVersion } = await supabase.from('plan_versions').select('*').eq('plan_id', planId).eq('status', 'active').single();
  const { data: markers } = await supabase.from('stromkreise').select('*').eq('plan_id', planId);

  const resolvePath = (fileUrl) => {
    if (!fileUrl) return plan.storage_path;
    if (fileUrl.includes("/")) return fileUrl;
    const parts = plan.storage_path.split("/");
    parts.pop();
    parts.push(fileUrl);
    return parts.join("/");
  };

  const activePath = resolvePath(activeVersion.file_url);
  const { data: fileData } = await supabase.storage.from('plans').download(activePath);
  const pdfBytes = await fileData.arrayBuffer();

  const getMarkerCoords = (marker, w, h, rot, scaleX, scaleY, ox, oy) => {
    const x = marker.x_norm * scaleX;
    const y = marker.y_norm * scaleY;
    let cx = 0, cy = 0;
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

  const drawForScale = async (scaleX, scaleY, color, labelSuffix, outPath) => {
    const doc = await PDFDocument.load(pdfBytes);
    const page1 = doc.getPages()[0];
    const size = page1.getSize();
    const cropBox = page1.getCropBox();
    const mediaBox = page1.getMediaBox();
    const rotationAngle = page1.getRotation().angle || 0;

    const ox = cropBox.x !== undefined ? cropBox.x : (mediaBox.x || 0);
    const oy = cropBox.y !== undefined ? cropBox.y : (mediaBox.y || 0);
    const w = cropBox.width !== undefined ? cropBox.width : mediaBox.width;
    const h = cropBox.height !== undefined ? cropBox.height : mediaBox.height;

    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

    markers.forEach(m => {
      const coords = getMarkerCoords(m, w, h, rotationAngle, scaleX, scaleY, ox, oy);
      page1.drawCircle({
        x: coords.x,
        y: coords.y,
        size: 8,
        color: color,
        opacity: 0.8
      });
      page1.drawText(`${m.circuit_code}${labelSuffix}`, {
        x: coords.x + 10,
        y: coords.y - 3,
        size: 7,
        font: helveticaBold,
        color: color
      });
    });

    const finalBytes = await doc.save();
    fs.writeFileSync(outPath, Buffer.from(finalBytes));
  };

  const imgW = activeVersion.width_px;
  const imgH = activeVersion.height_px;

  // 1. GridW = 21, GridH = 20 (Actual meta.json)
  const scaleX_21 = (21 * 256) / imgW;
  const scaleY_20 = (20 * 256) / imgH;
  await drawForScale(scaleX_21, scaleY_20, rgb(1, 0, 0), " (21x20)", '/home/ubuntu/building-task-manager/web/scratch/og_alignment_21.pdf');
  console.log(`Saved 21x20 PDF with scaleX = ${scaleX_21.toFixed(4)}, scaleY = ${scaleY_20.toFixed(4)}`);

  // 2. GridW = 28, GridH = 20 (Standard Math.ceil(imgW/256)*256 = 28)
  const scaleX_28 = (28 * 256) / imgW;
  const scaleY_20_std = (20 * 256) / imgH;
  await drawForScale(scaleX_28, scaleY_20_std, rgb(0, 0, 1), " (28x20)", '/home/ubuntu/building-task-manager/web/scratch/og_alignment_28.pdf');
  console.log(`Saved 28x20 PDF with scaleX = ${scaleX_28.toFixed(4)}, scaleY = ${scaleY_20_std.toFixed(4)}`);

})();
