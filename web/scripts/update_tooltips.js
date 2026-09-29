const fs = require("fs");
const path = require("path");

const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaModPath, "utf8");

// Add zuleitung to renderGeraetBox
if (!content.includes("let zuleitung = '';")) {
  content = content.replace(
    'let powerKw = "";\n      let variantModel = "";',
    'let powerKw = "";\n      let zuleitung = "";\n      let variantModel = "";'
  );
  content = content.replace(
    'if (parsed.powerKw) powerKw = parsed.powerKw;',
    'if (parsed.powerKw) powerKw = parsed.powerKw;\n        if (parsed.zuleitung) zuleitung = parsed.zuleitung;'
  );
  content = content.replace(
    '{powerKw && (\n                    <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginBottom: 2 }}>\n                      ⚡ {t("planBma", "powerKw", "Moc")}: {powerKw.includes(\'kW\') ? powerKw : powerKw + \' kW\'}\n                    </div>\n                  )}',
    `{powerKw && (
                    <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginBottom: 2 }}>
                      ⚡ {t("planBma", "powerKw", "Moc")}: {powerKw.includes('kW') ? powerKw : powerKw + ' kW'}
                    </div>
                  )}
                  {zuleitung && (
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 2 }}>
                      🔌 {t("planBma", "zuleitung", "Zuleitung")}: {zuleitung}
                    </div>
                  )}`
  );
}

// Add powerKw and zuleitung to standard point symbol tooltip
const tooltipBadgeCode = `if (parsed.powerKw) {
                          extraBadge = (
                            <>
                              {extraBadge}
                              <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginTop: 2 }}>
                                ⚡ {parsed.powerKw.includes('kW') ? parsed.powerKw : parsed.powerKw + ' kW'}
                              </div>
                            </>
                          );
                        }
                        if (parsed.zuleitung) {
                          extraBadge = (
                            <>
                              {extraBadge}
                              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                                🔌 {parsed.zuleitung}
                              </div>
                            </>
                          );
                        }`;

if (!content.includes("if (parsed.zuleitung) {") && content.includes("if (parsed.variantName) {")) {
  content = content.replace(
    "if (parsed.variantName) {",
    tooltipBadgeCode + "\n                        if (parsed.variantName) {"
  );
}

fs.writeFileSync(bmaModPath, content, "utf8");
console.log("Updated tooltip badges in PlanBmaSymbolsModule.tsx!");
