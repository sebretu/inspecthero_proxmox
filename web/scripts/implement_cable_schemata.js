const fs = require("fs");
const path = require("path");

console.log("Starting Cable Schemata & Verbindungen implementation...");

// 1. Update PlanMap.tsx to pass projectId and support schema mode
const planMapPath = path.join(__dirname, "../src/components/PlanMap.tsx");
let planMapContent = fs.readFileSync(planMapPath, "utf8");

if (!planMapContent.includes("cables: cableCount")) {
  planMapContent = planMapContent.replace(
    "heating: heatingCount,",
    "heating: heatingCount,\n          cables: cableCount,"
  );
  planMapContent = planMapContent.replace(
    "const [heatingCount, setHeatingCount] = useState(0);",
    "const [heatingCount, setHeatingCount] = useState(0);\n  const [cableCount, setCableCount] = useState(0);"
  );
  planMapContent = planMapContent.replace(
    "setHeatingCount(counts.heating || 0);",
    "setHeatingCount(counts.heating || 0);\n    setCableCount(counts.cables || 0);"
  );
}

if (!planMapContent.includes("projectId={projectId || undefined}")) {
  planMapContent = planMapContent.replace(
    "<PlanBmaSymbolsModule\n          planId={planId}\n          meta={meta}\n          currentUserId={currentUserId}\n          currentUserRole={currentUserRole}\n          layersVisibility={layersVisibility}\n          onEnsureLayerVisible={(key) => ensureLayerVisible(key)}\n          onCountsChange={handleBmaCounts}\n        />",
    `<PlanBmaSymbolsModule
          planId={planId}
          meta={meta}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          layersVisibility={layersVisibility}
          onEnsureLayerVisible={(key) => ensureLayerVisible(key)}
          onCountsChange={handleBmaCounts}
          projectId={projectId || undefined}
          planScale={(plan as any)?.scale || (plan as any)?.scale_pixels_per_meter}
        />`
  );
}

fs.writeFileSync(planMapPath, planMapContent, "utf8");
console.log("Updated PlanMap.tsx!");

// 2. Update ReportsClient.tsx
const repClientPath = path.join(__dirname, "../src/app/reports/ReportsClient.tsx");
let repClientContent = fs.readFileSync(repClientPath, "utf8");

if (!repClientContent.includes("const [peOptCables, setPeOptCables] = useState(true);")) {
  repClientContent = repClientContent.replace(
    "const [peOptHeating, setPeOptHeating] = useState(true);",
    `const [peOptHeating, setPeOptHeating] = useState(true);
    const [peOptCables, setPeOptCables] = useState(true);
    const [peOptFreeLines, setPeOptFreeLines] = useState(true);
    const [peOptKabelzugliste, setPeOptKabelzugliste] = useState(true);
    const [peSchemaBackground, setPeSchemaBackground] = useState<"grundriss" | "white">("grundriss");`
  );
}

if (!repClientContent.includes("includeCables: peOptCables,")) {
  repClientContent = repClientContent.replace(
    "includeHeating: peOptHeating,",
    `includeHeating: peOptHeating,
                        includeCables: peOptCables,
                        includeFreeLines: peOptFreeLines,
                        includeKabelzugliste: peOptKabelzugliste,
                        schemaBackground: peSchemaBackground,`
  );
}

// Add UI controls in ReportsClient.tsx checkboxes
const cablesCheckboxUi = `
                                                { key: "cables", label: t("reports", "optCables", "Kabelverbindungen & Schemata"), val: peOptCables, set: setPeOptCables, color: "blue", icon: "🔌" },
                                                { key: "kabelzugliste", label: t("reports", "optKabelzugliste", "Kabelzugliste (Zestawienie kabli)"), val: peOptKabelzugliste, set: setPeOptKabelzugliste, color: "emerald", icon: "📋" },`;

if (!repClientContent.includes('key: "kabelzugliste"') && repClientContent.includes('{ key: "heating", label: t("reports", "optHeating", "Heizung & Wärmepumpen / Geräte"), val: peOptHeating, set: setPeOptHeating, color: "cyan", icon: "❄️" },')) {
  repClientContent = repClientContent.replace(
    '{ key: "heating", label: t("reports", "optHeating", "Heizung & Wärmepumpen / Geräte"), val: peOptHeating, set: setPeOptHeating, color: "cyan", icon: "❄️" },',
    '{ key: "heating", label: t("reports", "optHeating", "Heizung & Wärmepumpen / Geräte"), val: peOptHeating, set: setPeOptHeating, color: "cyan", icon: "❄️" },' + cablesCheckboxUi
  );
}

// Add Schema Mode radio selector in ReportsClient.tsx
const schemaRadioUi = `
                                    {/* Schema Background Display Option */}
                                    <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255, 255, 255, 0.04)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>
                                            📐 Schema-Darstellung im PDF:
                                        </div>
                                        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#f8fafc" }}>
                                            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                                <input
                                                    type="radio"
                                                    name="schemaBg"
                                                    value="grundriss"
                                                    checked={peSchemaBackground === "grundriss"}
                                                    onChange={() => setPeSchemaBackground("grundriss")}
                                                />
                                                <span>🗺️ Auf Grundriss (Plan w tle)</span>
                                            </label>
                                            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                                <input
                                                    type="radio"
                                                    name="schemaBg"
                                                    value="white"
                                                    checked={peSchemaBackground === "white"}
                                                    onChange={() => setPeSchemaBackground("white")}
                                                />
                                                <span>⚪ Weißer Hintergrund (Czysty biały schemat)</span>
                                            </label>
                                        </div>
                                    </div>`;

if (!repClientContent.includes("Schema-Darstellung im PDF") && repClientContent.includes('{/* Options Checklist */}')) {
  repClientContent = repClientContent.replace(
    '{/* Options Checklist */}',
    schemaRadioUi + '\n\n                                    {/* Options Checklist */}'
  );
}

fs.writeFileSync(repClientPath, repClientContent, "utf8");
console.log("Updated ReportsClient.tsx!");

console.log("Phase 1 & 2 completed successfully!");
