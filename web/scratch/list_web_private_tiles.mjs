import fs from 'fs';
import path from 'path';

const dir = '/home/ubuntu/building-task-manager/web/private_tiles';
try {
  if (!fs.existsSync(dir)) {
    console.log("Directory does not exist");
  } else {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        console.log(`[DIR] ${f}`);
        try {
          const subfiles = fs.readdirSync(p);
          console.log(`   contains: ${subfiles.slice(0, 10).join(', ')} (total ${subfiles.length})`);
        } catch (err) {
          console.log(`   error reading: ${err.message}`);
        }
      } else {
        console.log(`[FILE] ${f} - ${stat.size} bytes`);
      }
    }
  }
} catch (e) {
  console.error(e);
}
