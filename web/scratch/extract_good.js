const fs = require('fs');
const path = require('path');

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = '/home/sebretu/building-task-manager/messprotokoll_uv_og_unit_1_li03__2026-05-19.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error("PDF path not found:", pdfPath);
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    const linesMap = {};
    for (const item of items) {
      if (!item.str || item.str.trim() === "") continue;
      const y = Math.round(item.transform[5] / 5) * 5;
      if (!linesMap[y]) linesMap[y] = [];
      linesMap[y].push(item);
    }

    const sortedY = Object.keys(linesMap)
      .map(Number)
      .sort((a, b) => b - a);

    let pageText = "";
    for (const y of sortedY) {
      const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
      const lineStr = lineItems.map(item => item.str).join(" ");
      pageText += lineStr + "\n";
    }

    fullText += `--- Page ${i} ---\n` + pageText + "\n";
  }

  fs.writeFileSync(path.join(__dirname, 'good_extracted_text.txt'), fullText, 'utf8');
  console.log("Good PDF text saved to good_extracted_text.txt. Length:", fullText.length);
}

run();
