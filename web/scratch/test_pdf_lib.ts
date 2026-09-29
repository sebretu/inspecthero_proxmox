import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  
  // Draw a red rectangle
  page.drawRectangle({
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    color: rgb(1, 0, 0),
  });

  // Try to embed a small 1x1 png base64
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
  const pngImage = await pdfDoc.embedPng(base64Data);

  page.drawImage(pngImage, {
    x: 200,
    y: 200,
    width: 100,
    height: 100,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test.pdf', pdfBytes);
  console.log("Saved test.pdf, size:", pdfBytes.length);
}

main().catch(console.error);
