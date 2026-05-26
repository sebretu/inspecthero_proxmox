const fs = require('fs');

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = fs.readFileSync('/home/sebretu/building-task-manager/250327_Stromlaufplan_UV_OG_Unit_LI03.pdf');
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  const page = await pdfDoc.getPage(4); // Page 4
  const textContent = await page.getTextContent();
  const items = textContent.items;

  // Find items around Y=87
  const filtered = items
    .filter(item => item.str && item.str.trim() !== "" && Math.abs(item.transform[5] - 87) <= 5.0)
    .sort((a, b) => a.transform[4] - b.transform[4]);

  console.log("Items around Y=87 on Page 4:");
  for (const item of filtered) {
    console.log(`text: "${item.str}", x: ${item.transform[4]}, y: ${item.transform[5]}`);
  }
}

run();
