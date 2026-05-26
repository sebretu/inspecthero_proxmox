const fs = require('fs');
const path = require('path');

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = '/home/sebretu/building-task-manager/250327_Stromlaufplan_UV_OG_Unit_LI03.pdf';
  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  let fullText = "";
  const maxPages = Math.min(pdfDoc.numPages, 15);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    // Group items into lines using vertical Y tolerance of 3.0
    const lines = [];
    const sortedItems = [...items]
      .filter(item => item.str && item.str.trim() !== "")
      .sort((a, b) => b.transform[5] - a.transform[5]);

    for (const item of sortedItems) {
      const itemY = item.transform[5];
      let foundLine = lines.find(line => Math.abs(line.y - itemY) <= 3.0);
      if (foundLine) {
        foundLine.items.push(item);
      } else {
        lines.push({ y: itemY, items: [item] });
      }
    }

    // Sort lines from top to bottom
    lines.sort((a, b) => b.y - a.y);

    let pageText = "";
    for (const line of lines) {
      // Sort items in the line from left to right
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);

      // Reconstruct line with character spacing based on X coordinate
      const charWidth = 4.0; // smaller charWidth means more character columns
      let lineStr = " ".repeat(320);
      
      for (const item of line.items) {
        const x = item.transform[4];
        const charIndex = Math.max(0, Math.round(x / charWidth));
        
        const text = item.str;
        const before = lineStr.substring(0, charIndex);
        const after = lineStr.substring(charIndex + text.length);
        lineStr = before + text + after;
      }
      
      pageText += lineStr.trimEnd() + "\n";
    }

    fullText += `--- Page ${i} ---\n` + pageText + "\n";
  }

  fs.writeFileSync(path.join(__dirname, 'layout_text.txt'), fullText, 'utf8');
  console.log("Layout text saved to layout_text.txt. Length:", fullText.length);
}

run();
