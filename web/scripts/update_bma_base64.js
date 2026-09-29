const fs = require("fs");
const path = require("path");

const img1Path = path.join(__dirname, "../public/symbols/bma/warmepumpe_aussen.png");
const img2Path = path.join(__dirname, "../public/symbols/bma/warmepumpe_innen.png");
const img3Path = path.join(__dirname, "../public/symbols/bma/infrarotheizung.png");

const b64_1 = `data:image/png;base64,${fs.readFileSync(img1Path).toString("base64")}`;
const b64_2 = `data:image/png;base64,${fs.readFileSync(img2Path).toString("base64")}`;
const b64_3 = `data:image/png;base64,${fs.readFileSync(img3Path).toString("base64")}`;

const bmaSymbolsDataPath = path.join(__dirname, "../src/lib/bmaSymbolsData.ts");
let content = fs.readFileSync(bmaSymbolsDataPath, "utf-8");

// Check if already added
if (!content.includes("warmepumpe_aussen")) {
  const insertStr = `  warmepumpe_aussen: "${b64_1}",\n  warmepumpe_innen: "${b64_2}",\n  infrarotheizung: "${b64_3}",\n};\n`;
  content = content.replace(/\n\s*\};\s*\n/, `\n${insertStr}`);
  fs.writeFileSync(bmaSymbolsDataPath, content, "utf-8");
  console.log("Successfully updated bmaSymbolsData.ts with new heating icons!");
} else {
  console.log("Already present in bmaSymbolsData.ts");
}
