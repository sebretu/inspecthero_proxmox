import fs from 'fs';
import path from 'path';

const dir1 = '/home/ubuntu/private_tiles/0d4ccb3f-d8ab-4cce-bd74-fc15da3f510e';
const dir2 = '/home/ubuntu/building-task-manager/web/private_tiles/0d4ccb3f-d8ab-4cce-bd74-fc15da3f510e';

console.log("Checking folder sizes:");
console.log(`dir1 (root): ${fs.existsSync(dir1) ? "exists" : "does not exist"}`);
console.log(`dir2 (web): ${fs.existsSync(dir2) ? "exists" : "does not exist"}`);

if (fs.existsSync(dir1) && fs.existsSync(dir2)) {
  // Let's compare files at z=1, x=0, y=0 or similar
  const checkTile = (z, x, y) => {
    const p1 = path.join(dir1, String(z), String(x), `${y}.png`);
    const p2 = path.join(dir2, String(z), String(x), `${y}.png`);
    const s1 = fs.existsSync(p1) ? fs.statSync(p1).size : null;
    const s2 = fs.existsSync(p2) ? fs.statSync(p2).size : null;
    console.log(`Tile z=${z}, x=${x}, y=${y}:`);
    console.log(`  root size: ${s1}`);
    console.log(`  web size: ${s2}`);
  };
  
  checkTile(1, 0, 0);
  checkTile(2, 0, 0);
  checkTile(3, 0, 0);
  checkTile(4, 0, 0);
}
