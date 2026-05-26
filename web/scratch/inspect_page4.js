const fs = require('fs');
const path = require('path');

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = '/home/sebretu/building-task-manager/250327_Stromlaufplan_UV_OG_Unit_LI03.pdf';
  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  const page = await pdfDoc.getPage(4); // Page 4
  const textContent = await page.getTextContent();
  const items = textContent.items;

  console.log("--- Items on Page 4 ---");
  const parsedItems = items.map(item => {
    return {
      text: item.str,
      x: Math.round(item.transform[4] * 10) / 10,
      y: Math.round(item.transform[5] * 10) / 10
    };
  }).filter(item => item.text.trim() !== "");

  parsedItems.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 2) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  console.log(JSON.stringify(parsedItems, null, 2));
}

run();
