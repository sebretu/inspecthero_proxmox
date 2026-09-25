import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

// DOMMatrix Polyfill for Node.js
if (typeof global.DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(arg: any) {
      if (typeof arg === 'string') return;
      if (Array.isArray(arg)) {
        this.a = arg[0]; this.b = arg[1]; this.c = arg[2];
        this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
      }
    }
  };
}

async function main() {
    const data = new Uint8Array(fs.readFileSync('/home/sebretu/building-task-manager/9030_SC_BMA-A1.pdf'));
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    console.log(`PDF loaded. Pages: ${pdf.numPages}`);
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        console.log(`--- Page ${i} ---`);
        textContent.items.forEach((item: any) => {
            if (item.str.trim()) {
                console.log(`[${item.transform[4].toFixed(2)}, ${item.transform[5].toFixed(2)}]: "${item.str}"`);
            }
        });
    }
}
main().catch(console.error);
