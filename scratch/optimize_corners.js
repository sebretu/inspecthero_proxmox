
import fs from 'fs';
import path from 'path';

const rootDir = '/home/sebretu/building-task-manager/web/src';

function getAllFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllFiles(name, allFiles);
    } else {
      if (name.endsWith('.tsx') || name.endsWith('.ts') || name.endsWith('.css')) {
        allFiles.push(name);
      }
    }
  });
  return allFiles;
}

const largeRoundedRegex = /rounded(-[ltbr])?-?\[([\d.]+)(rem|px)\]/g;
const rounded3xlRegex = /rounded(-[ltbr])?-3xl/g;

const files = getAllFiles(rootDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  const newContent = content.replace(largeRoundedRegex, (match, pos, value, unit) => {
    const val = parseFloat(value);
    const isLarge = (unit === 'rem' && val >= 1) || (unit === 'px' && val >= 16);
    if (isLarge) {
      changed = true;
      return `rounded${pos || ''}-2xl`;
    }
    return match;
  }).replace(rounded3xlRegex, (match, pos) => {
    changed = true;
    return `rounded${pos || ''}-2xl`;
  });

  if (changed) {
    console.log(`Updating ${file}`);
    fs.writeFileSync(file, newContent);
  }
});
