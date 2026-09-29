const fs = require("fs");
const path = require("path");

const img1Path = "/home/ubuntu/.gemini/antigravity-ide/brain/225eafc6-1405-4d2f-ac2a-9ec4490b9e72/.user_uploaded/media_1787896619817.png";
const img2Path = "/home/ubuntu/.gemini/antigravity-ide/brain/225eafc6-1405-4d2f-ac2a-9ec4490b9e72/.user_uploaded/media_1787896641362.png";
const img3Path = "/home/ubuntu/.gemini/antigravity-ide/brain/225eafc6-1405-4d2f-ac2a-9ec4490b9e72/.user_uploaded/media_1787896679184.png";

const outDir = path.join(__dirname, "../public/symbols/bma");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Copy original PNGs to public/symbols/bma
fs.copyFileSync(img1Path, path.join(outDir, "warmepumpe_aussen.png"));
fs.copyFileSync(img2Path, path.join(outDir, "warmepumpe_innen.png"));
fs.copyFileSync(img3Path, path.join(outDir, "infrarotheizung.png"));

// Generate clean base64 data URIs
const b64Img1 = `data:image/png;base64,${fs.readFileSync(img1Path).toString("base64")}`;
const b64Img2 = `data:image/png;base64,${fs.readFileSync(img2Path).toString("base64")}`;
const b64Img3 = `data:image/png;base64,${fs.readFileSync(img3Path).toString("base64")}`;

// Generate SVG wrappers for standard SVG embedding if needed
const svg1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200" width="100" height="200">
  <image href="${b64Img1}" width="100" height="200" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="150" height="150">
  <image href="${b64Img2}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

const svg3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80">
  <image href="${b64Img3}" width="240" height="80" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

fs.writeFileSync(path.join(outDir, "warmepumpe_aussen.svg"), svg1);
fs.writeFileSync(path.join(outDir, "warmepumpe_innen.svg"), svg2);
fs.writeFileSync(path.join(outDir, "infrarotheizung.svg"), svg3);

console.log("Successfully created heating symbols in public/symbols/bma!");
