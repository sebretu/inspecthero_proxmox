import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  page.setRotation(degrees(90)); // Rotate 90 degrees clockwise
  
  // Logical dimensions: 595x842. Visual dimensions: 842x595.
  console.log("Size:", page.getSize());
  console.log("Rotation:", page.getRotation().angle);

  // Logical top-left (0, 842)
  page.drawRectangle({ x: 0, y: 842 - 50, width: 50, height: 50, color: rgb(1, 0, 0) });
  
  // Logical bottom-left (0, 0)
  page.drawRectangle({ x: 0, y: 0, width: 50, height: 50, color: rgb(0, 1, 0) });
  
  // Logical top-right (595-50, 842-50)
  page.drawRectangle({ x: 595 - 50, y: 842 - 50, width: 50, height: 50, color: rgb(0, 0, 1) });
  
  // Logical bottom-right (595-50, 0)
  page.drawRectangle({ x: 595 - 50, y: 0, width: 50, height: 50, color: rgb(1, 1, 0) });
  
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('rotated.pdf', pdfBytes);
}

main().catch(console.error);
