const fs = require('fs');
const path = require('path');

const base = '/home/ubuntu/private_tiles';
const folders = fs.readdirSync(base);

for (const f of folders) {
  const p = path.join(base, f, 'meta.json');
  if (fs.existsSync(p)) {
    const meta = JSON.parse(fs.readFileSync(p, 'utf8'));
    // If it has gridW/gridH, let's print it
    if (meta.gridW || meta.gridH) {
      console.log(`Folder: ${f}`);
      console.log(`  gridW: ${meta.gridW}, gridH: ${meta.gridH}`);
      console.log(`  imageWidth: ${meta.imageWidth}, imageHeight: ${meta.imageHeight}`);
      if (meta.limits?.['5']) {
        console.log(`  limits zoom 5: maxX = ${meta.limits['5'].maxX}, maxY = ${meta.limits['5'].maxY}`);
      }
      console.log("------------------------");
    }
  }
}
