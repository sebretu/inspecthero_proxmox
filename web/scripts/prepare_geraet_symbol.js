const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "../public/symbols/bma");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Crisp Vector SVG for Control Unit / Device Box (Gerät / Steuerung)
const geraetSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70" width="100" height="70">
  <!-- Outer metallic casing -->
  <rect x="2" y="2" width="96" height="66" rx="8" ry="8" fill="#1e293b" stroke="#0284c7" stroke-width="4"/>
  <!-- Inner bevel border -->
  <rect x="7" y="7" width="86" height="56" rx="5" ry="5" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  
  <!-- Digital LCD Screen -->
  <rect x="12" y="12" width="48" height="28" rx="4" ry="4" fill="#0369a1" stroke="#38bdf8" stroke-width="2"/>
  <!-- Status waves on screen -->
  <path d="M 16 26 Q 22 18, 28 26 T 40 26 T 52 26" fill="none" stroke="#e0f2fe" stroke-width="2" stroke-linecap="round"/>
  <circle cx="18" cy="18" r="2" fill="#4ade80"/>
  <circle cx="25" cy="18" r="2" fill="#38bdf8"/>
  <rect x="30" y="32" width="24" height="4" rx="2" fill="#bae6fd"/>

  <!-- Power status LED -->
  <circle cx="76" cy="18" r="4.5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>

  <!-- Dial / Rotary Knob -->
  <circle cx="76" cy="38" r="11" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="76" cy="38" r="6" fill="#1e293b"/>
  <line x1="76" y1="38" x2="82" y2="33" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Bottom Keypad / Buttons -->
  <rect x="14" y="47" width="12" height="10" rx="2" fill="#475569" stroke="#64748b" stroke-width="1"/>
  <rect x="30" y="47" width="12" height="10" rx="2" fill="#475569" stroke="#64748b" stroke-width="1"/>
  <rect x="46" y="47" width="12" height="10" rx="2" fill="#475569" stroke="#64748b" stroke-width="1"/>
</svg>`;

fs.writeFileSync(path.join(outDir, "geraet_box.svg"), geraetSvg);

const b64DataUri = `data:image/svg+xml;base64,${Buffer.from(geraetSvg).toString("base64")}`;

// Update bmaSymbolsData.ts
const dataTsPath = path.join(__dirname, "../src/lib/bmaSymbolsData.ts");
let dataTs = fs.readFileSync(dataTsPath, "utf8");

if (!dataTs.includes("geraet_box:")) {
  dataTs = dataTs.replace(
    "export const BMA_ICONS_BASE64: Record<string, string> = {",
    `export const BMA_ICONS_BASE64: Record<string, string> = {\n  geraet_box: "${b64DataUri}",`
  );
  fs.writeFileSync(dataTsPath, dataTs, "utf8");
  console.log("Updated bmaSymbolsData.ts with geraet_box data URI!");
}

console.log("Successfully created geraet_box.svg!");
