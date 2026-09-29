const fs = require("fs");
const path = require("path");

const aussenSvgPath = path.join(__dirname, "../public/symbols/bma/warmepumpe_aussen.svg");
const innenSvgPath = path.join(__dirname, "../public/symbols/bma/warmepumpe_innen.svg");
const bmaDataPath = path.join(__dirname, "../src/lib/bmaSymbolsData.ts");

// 1. Get previous warmepumpe_innen content
const oldInnenSvgContent = fs.readFileSync(innenSvgPath, "utf8");

// 2. Put old warmepumpe_innen into warmepumpe_aussen
fs.writeFileSync(aussenSvgPath, oldInnenSvgContent, "utf8");
console.log("Moved old warmepumpe_innen icon to warmepumpe_aussen.svg");

// 3. Create the NEW vector SVG for warmepumpe_innen based on the uploaded image
const newInnenSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Clean white background -->
  <rect x="4" y="4" width="92" height="92" rx="2" ry="2" fill="#ffffff" stroke="#0f172a" stroke-width="4.5" />
  
  <!-- Top header divider line -->
  <line x1="4" y1="20" x2="96" y2="20" stroke="#0f172a" stroke-width="4.5" />

  <!-- Concentric circle ventilator housing -->
  <circle cx="50" cy="58" r="29" fill="#ffffff" stroke="#1e293b" stroke-width="2.5" />
  <circle cx="50" cy="58" r="26" fill="#ffffff" stroke="#64748b" stroke-width="1.5" />

  <!-- 6-blade centrifugal fan turbine -->
  <g transform="translate(50, 58)">
    <!-- Blade 1 -->
    <path d="M 0 0 C 4 -6, 12 -12, 19 -15 C 23 -11, 23 -3, 16 2 C 10 3, 4 2, 0 0 Z" fill="#0f172a" />
    <!-- Blade 2 -->
    <path d="M 0 0 C 4 -6, 12 -12, 19 -15 C 23 -11, 23 -3, 16 2 C 10 3, 4 2, 0 0 Z" fill="#0f172a" transform="rotate(60)" />
    <!-- Blade 3 -->
    <path d="M 0 0 C 4 -6, 12 -12, 19 -15 C 23 -11, 23 -3, 16 2 C 10 3, 4 2, 0 0 Z" fill="#0f172a" transform="rotate(120)" />
    <!-- Blade 4 -->
    <path d="M 0 0 C 4 -6, 12 -12, 19 -15 C 23 -11, 23 -3, 16 2 C 10 3, 4 2, 0 0 Z" fill="#0f172a" transform="rotate(180)" />
    <!-- Blade 5 -->
    <path d="M 0 0 C 4 -6, 12 -12, 19 -15 C 23 -11, 23 -3, 16 2 C 10 3, 4 2, 0 0 Z" fill="#0f172a" transform="rotate(240)" />
    <!-- Blade 6 -->
    <path d="M 0 0 C 4 -6, 12 -12, 19 -15 C 23 -11, 23 -3, 16 2 C 10 3, 4 2, 0 0 Z" fill="#0f172a" transform="rotate(300)" />
    <!-- Center hub dot -->
    <circle cx="0" cy="0" r="3" fill="#0f172a" />
  </g>
</svg>`;

fs.writeFileSync(innenSvgPath, newInnenSvg, "utf8");
console.log("Created new warmepumpe_innen.svg based on user photo!");

// 4. Update bmaSymbolsData.ts with new base64 data URIs
let bmaData = fs.readFileSync(bmaDataPath, "utf8");

// Extract the base64 from old innen (which is now aussen)
const oldInnenBase64Match = oldInnenSvgContent.match(/href="([^"]+)"/);
let aussenDataUri = "";
if (oldInnenBase64Match) {
  aussenDataUri = oldInnenBase64Match[1];
} else {
  aussenDataUri = "data:image/svg+xml;base64," + Buffer.from(oldInnenSvgContent).toString("base64");
}

const newInnenDataUri = "data:image/svg+xml;base64," + Buffer.from(newInnenSvg).toString("base64");

// Update BMA_ICONS_BASE64 in bmaSymbolsData.ts
if (bmaData.includes("warmepumpe_aussen:")) {
  bmaData = bmaData.replace(/warmepumpe_aussen:\s*"[^"]+",/, `warmepumpe_aussen: "${aussenDataUri}",`);
} else {
  bmaData = bmaData.replace("BMA_ICONS_BASE64: Record<string, string> = {", `BMA_ICONS_BASE64: Record<string, string> = {\n  warmepumpe_aussen: "${aussenDataUri}",`);
}

if (bmaData.includes("warmepumpe_innen:")) {
  bmaData = bmaData.replace(/warmepumpe_innen:\s*"[^"]+",/, `warmepumpe_innen: "${newInnenDataUri}",`);
} else {
  bmaData = bmaData.replace("BMA_ICONS_BASE64: Record<string, string> = {", `BMA_ICONS_BASE64: Record<string, string> = {\n  warmepumpe_innen: "${newInnenDataUri}",`);
}

fs.writeFileSync(bmaDataPath, bmaData, "utf8");
console.log("Updated bmaSymbolsData.ts with warmepumpe_aussen and warmepumpe_innen base64 data!");

// 5. Update icon dimensions in PlanBmaSymbolsModule.tsx and PlanElementsPdf.tsx
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaModContent = fs.readFileSync(bmaModPath, "utf8");

// Adjust sizes for warmepumpe_aussen and warmepumpe_innen
bmaModContent = bmaModContent.replace(
  `    } else if (isWpAussen) {
      w = Math.round(targetSize * 2.0);
      h = Math.round(targetSize * 4.0);
    } else if (isWpInnen) {
      w = Math.round(targetSize * 3.5);
      h = Math.round(targetSize * 3.5);
    }`,
  `    } else if (isWpAussen) {
      w = Math.round(targetSize * 3.2);
      h = Math.round(targetSize * 3.2);
    } else if (isWpInnen) {
      w = Math.round(targetSize * 3.2);
      h = Math.round(targetSize * 3.2);
    }`
);

fs.writeFileSync(bmaModPath, bmaModContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx symbol sizes for WP!");

const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

pdfContent = pdfContent.replace(
  `const iconW = isGross ? 26 : isDis ? 18 : isWpAussen ? 30 : isWpInnen ? 45 : isInfra ? 60 : BMA_SIZE;`,
  `const iconW = isGross ? 26 : isDis ? 18 : isWpAussen ? 38 : isWpInnen ? 38 : isInfra ? 60 : BMA_SIZE;`
);

pdfContent = pdfContent.replace(
  `const iconH = isGross ? 13 : isDis ? 14 : isWpAussen ? 60 : isWpInnen ? 45 : isInfra ? 20 : BMA_SIZE;`,
  `const iconH = isGross ? 13 : isDis ? 14 : isWpAussen ? 38 : isWpInnen ? 38 : isInfra ? 20 : BMA_SIZE;`
);

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("Updated PlanElementsPdf.tsx symbol sizes for WP!");
