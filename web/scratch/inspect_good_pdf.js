const fs = require('fs');

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = fs.readFileSync('/home/sebretu/building-task-manager/messprotokoll_uv_og_unit_1_li03__2026-05-19.pdf');
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    fullText += `--- Page ${i} ---\n` + textContent.items.map(item => item.str).join(" ") + "\n";
  }

  console.log("Expected PDF content:");
  console.log(fullText.substring(0, 5000));
}

run();
