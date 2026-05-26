const fs = require('fs');

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = fs.readFileSync('/home/sebretu/building-task-manager/250327_Stromlaufplan_UV_OG_Unit_LI03.pdf');
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  const page = await pdfDoc.getPage(4);
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

  // Find the line that has "Fehlerstromschutzschalter"
  const targetLine = lines.find(line => line.items.some(item => item.str.includes("Fehlerstromschutzschalter")));
  if (!targetLine) {
    console.log("Fehlerstromschutzschalter line not found!");
    return;
  }

  console.log("Target Line Y:", targetLine.y);
  console.log("Items in target line (raw sorted by X):");
  targetLine.items.sort((a, b) => a.transform[4] - b.transform[4]);
  for (const item of targetLine.items) {
    console.log(`text: "${item.str}", x: ${item.transform[4]}`);
  }

  // Let's run the exact phrase grouping on it
  const phrases = [];
  let currentPhrase = null;

  for (const item of targetLine.items) {
    const x = item.transform[4];
    if (!currentPhrase) {
      currentPhrase = { text: item.str, x: x, lastX: x };
    } else {
      if (x - currentPhrase.lastX <= 30.0) {
        currentPhrase.text += " " + item.str;
        currentPhrase.lastX = x;
      } else {
        phrases.push(currentPhrase);
        currentPhrase = { text: item.str, x: x, lastX: x };
      }
    }
  }
  if (currentPhrase) {
    phrases.push(currentPhrase);
  }

  console.log("\nPhrases generated:");
  console.log(phrases);
}

run();
