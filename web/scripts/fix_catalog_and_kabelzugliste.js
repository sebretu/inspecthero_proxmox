const fs = require("fs");
const path = require("path");

// 1. Fix /src/pages/api/plans/[id]/cable-connections.ts
const apiPath = path.join(__dirname, "../src/pages/api/plans/[id]/cable-connections.ts");
let apiContent = fs.readFileSync(apiPath, "utf8");

// Exclude legacy auto-generated loops and only return real user cables
const filterRealCables = `    // Filter connections that are real cables/free lines and belong to this plan/project
    const all = data ?? [];
    const filtered = all.filter((c) => {
      // Exclude legacy auto-generated loop scans
      if (c.name && (c.name.includes("Auto-generated") || c.name.startsWith("Loop "))) {
        const m = c.metadata || {};
        if (!m.waypoints?.length && !m.source_symbol_id && !m.cable_number) {
          return false;
        }
      }

      const m = c.metadata || {};
      if (!projectId) {
        return (
          m.plan_id === planId ||
          m.source_plan_id === planId ||
          m.target_plan_id === planId
        );
      }
      return true;
    });`;

apiContent = apiContent.replace(
  `    const all = data ?? [];
    const filtered = projectId
      ? all
      : all.filter((c) => {
          const m = c.metadata || {};
          return (
            m.plan_id === planId ||
            m.source_plan_id === planId ||
            m.target_plan_id === planId ||
            (!m.plan_id && !m.source_plan_id && !m.target_plan_id)
          );
        });`,
  filterRealCables
);

fs.writeFileSync(apiPath, apiContent, "utf8");
console.log("Updated cable-connections.ts API filter!");

// 2. Fix PlanElementsPdf.tsx
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// A. In extractAndSortAufkleberItems: only extract symbols included by options!
pdfContent = pdfContent.replace(
  `export function extractAndSortAufkleberItems(plansData: ExportPlanData[], reservePerKreis: number = 0): AufkleberItem[] {`,
  `export function extractAndSortAufkleberItems(plansData: ExportPlanData[], reservePerKreis: number = 0, options?: PlanElementsPdfProps['options']): AufkleberItem[] {`
);

pdfContent = pdfContent.replace(
  `            const isEmergency = s.symbol_type === 'notlicht_lampe' || s.symbol_type === 'notlicht_pikto' || s.symbol_type === 'notlicht_pikto_gross' || s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
            if (!isEmergency) continue;`,
  `            if (options && !isSymbolIncluded(s.symbol_type, options)) continue;
            const isEmergency = s.symbol_type === 'notlicht_lampe' || s.symbol_type === 'notlicht_pikto' || s.symbol_type === 'notlicht_pikto_gross' || s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
            if (!isEmergency) continue;`
);

// B. Update Catalog Page condition in PlanElementsPdf.tsx:
pdfContent = pdfContent.replace(
  `{(showNotlicht || options.includeHeating !== false) && options.includeLampTypes !== false && (() => {
                const reserveCountPerKreis = options.reservePerKreis || 0;
                const allAufkleber = extractAndSortAufkleberItems(plansData, reserveCountPerKreis);`,
  `{options.includeLampTypes === true && (showNotlicht || options.includeHeating === true) && (() => {
                const reserveCountPerKreis = options.reservePerKreis || 0;
                const allAufkleber = extractAndSortAufkleberItems(plansData, reserveCountPerKreis, options);`
);

// C. Dynamic Catalog Header Title (Heating vs Notlicht):
pdfContent = pdfContent.replace(
  `<Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4ade80' }}>
                                    NOTBELEUCHTUNG, HEIZUNG & RETTUNGSZEICHEN – GERÄTE- & LEUCHTENTYPEN-KATALOG
                                </Text>`,
  `<Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4ade80' }}>
                                    {!showNotlicht && options.includeHeating ? 'HEIZUNG & WÄRMEPUMPEN – GERÄTEKATALOG' : showNotlicht && !options.includeHeating ? 'NOTBELEUCHTUNG & RETTUNGSZEICHEN – LEUCHTENTYPEN-KATALOG' : 'NOTBELEUCHTUNG, HEIZUNG & RETTUNGSZEICHEN – GERÄTE- & LEUCHTENTYPEN-KATALOG'}
                                </Text>`
);

// D. Fix Kabelzugliste Page condition in PlanElementsPdf.tsx:
// Only render if options.includeCables === true and there are real cables
pdfContent = pdfContent.replace(
  `{options.includeCables !== false && (() => {
                const allCables: Array<{`,
  `{(options.includeCables === true || options.includeKabelzugliste === true) && (() => {
                const allCables: Array<{`
);

// Filter out legacy auto-generated loop records in allCables
pdfContent = pdfContent.replace(
  `                    (p.cableConnections || []).forEach((c: any) => {
                        const m = c.metadata || {};
                        const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                        const s1 = p.bmaSymbols?.find((s: any) => s.id === m.source_symbol_id);
                        const s2 = p.bmaSymbols?.find((s: any) => s.id === m.target_symbol_id);`,
  `                    (p.cableConnections || []).forEach((c: any) => {
                        // Skip legacy empty loop scans
                        if (c.name && (c.name.includes("Auto-generated") || c.name.startsWith("Loop "))) {
                          const m = c.metadata || {};
                          if (!m.waypoints?.length && !m.source_symbol_id && !m.cable_number) return;
                        }
                        const m = c.metadata || {};
                        const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                        const s1 = p.bmaSymbols?.find((s: any) => s.id === m.source_symbol_id);
                        const s2 = p.bmaSymbols?.find((s: any) => s.id === m.target_symbol_id);`
);

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("Updated PlanElementsPdf.tsx with exact catalog & Kabelzugliste conditions!");

// 3. Fix ReportsClient.tsx:
const repPath = path.join(__dirname, "../src/app/reports/ReportsClient.tsx");
let repContent = fs.readFileSync(repPath, "utf8");

// By default, only include lamp types if user checks it or selects Notlicht with lamp types
repContent = repContent.replace(
  `const [peOptCables, setPeOptCables] = useState(true);`,
  `const [peOptCables, setPeOptCables] = useState(false);`
);

fs.writeFileSync(repPath, repContent, "utf8");
console.log("Updated ReportsClient.tsx!");
