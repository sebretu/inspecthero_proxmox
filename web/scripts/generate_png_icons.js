const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

async function generatePngIcons() {
  const symbolsDir = path.join(__dirname, "../public/symbols/bma");
  
  // 1. warmepumpe_aussen
  const aussenSvg = fs.readFileSync(path.join(symbolsDir, "warmepumpe_aussen.svg"));
  const aussenPng = await sharp(aussenSvg).png().toBuffer();
  const aussenBase64 = `data:image/png;base64,${aussenPng.toString("base64")}`;

  // 2. warmepumpe_innen
  const innenSvg = fs.readFileSync(path.join(symbolsDir, "warmepumpe_innen.svg"));
  const innenPng = await sharp(innenSvg).png().toBuffer();
  const innenBase64 = `data:image/png;base64,${innenPng.toString("base64")}`;

  // 3. infrarotheizung SVG to PNG
  const infraSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40">
    <rect x="2" y="2" width="96" height="36" rx="4" ry="4" fill="#ffffff" stroke="#ea580c" stroke-width="3"/>
    <path d="M 15 20 Q 22 10, 30 20 T 45 20 T 60 20 T 75 20 T 90 20" fill="none" stroke="#ea580c" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="8" cy="8" r="2" fill="#ea580c"/>
    <circle cx="92" cy="8" r="2" fill="#ea580c"/>
  </svg>`;
  const infraPng = await sharp(Buffer.from(infraSvg)).png().toBuffer();
  const infraBase64 = `data:image/png;base64,${infraPng.toString("base64")}`;

  // 4. geraet_box SVG to PNG
  const geraetSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70" width="100" height="70">
    <rect x="3" y="3" width="94" height="64" rx="8" ry="8" fill="#1e293b" stroke="#0284c7" stroke-width="4"/>
    <rect x="10" y="10" width="48" height="28" rx="4" ry="4" fill="#0369a1" stroke="#38bdf8" stroke-width="2"/>
    <circle cx="75" cy="20" r="5" fill="#22c55e"/>
    <circle cx="75" cy="42" r="10" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
    <rect x="14" y="46" width="12" height="10" rx="2" fill="#475569"/>
    <rect x="30" y="46" width="12" height="10" rx="2" fill="#475569"/>
    <rect x="46" y="46" width="12" height="10" rx="2" fill="#475569"/>
  </svg>`;
  const geraetPng = await sharp(Buffer.from(geraetSvg)).png().toBuffer();
  const geraetBase64 = `data:image/png;base64,${geraetPng.toString("base64")}`;

  // Update bmaSymbolsData.ts
  const dataPath = path.join(__dirname, "../src/lib/bmaSymbolsData.ts");
  let dataContent = fs.readFileSync(dataPath, "utf8");

  dataContent = dataContent.replace(/warmepumpe_aussen:\s*"data:image\/[^"]+"/, `warmepumpe_aussen: "${aussenBase64}"`);
  dataContent = dataContent.replace(/warmepumpe_innen:\s*"data:image\/[^"]+"/, `warmepumpe_innen: "${innenBase64}"`);
  dataContent = dataContent.replace(/infrarotheizung:\s*"data:image\/[^"]+"/, `infrarotheizung: "${infraBase64}"`);
  dataContent = dataContent.replace(/geraet_box:\s*"data:image\/[^"]+"/, `geraet_box: "${geraetBase64}"`);

  fs.writeFileSync(dataPath, dataContent, "utf8");
  console.log("Successfully converted all BMA/Heating icons to valid PNG raster base64 in bmaSymbolsData.ts!");
}

generatePngIcons().catch(console.error);
