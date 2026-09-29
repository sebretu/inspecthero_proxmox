const fs = require("fs");
const path = require("path");

// 1. Update ReportsClient.tsx to include peOptCables in checkbox list
const reportsClientPath = path.join(__dirname, "../src/app/reports/ReportsClient.tsx");
let reportsContent = fs.readFileSync(reportsClientPath, "utf8");

if (!reportsContent.includes('{ key: "cables", label: t("reports", "optCables"')) {
  reportsContent = reportsContent.replace(
    `{ key: "lighting", label: t("reports", "optLighting", "Allgemeinbeleuchtung & Trassen"), val: peOptLighting, set: setPeOptLighting, color: "amber", icon: "💡" },`,
    `{ key: "lighting", label: t("reports", "optLighting", "Allgemeinbeleuchtung & Trassen"), val: peOptLighting, set: setPeOptLighting, color: "amber", icon: "💡" },\n                                                { key: "cables", label: t("reports", "optCables", "Kabeltrassen & Kabelverbindungen (Kabelzugliste)"), val: peOptCables, set: setPeOptCables, color: "blue", icon: "🔌" },`
  );
  fs.writeFileSync(reportsClientPath, reportsContent, "utf8");
  console.log("Updated ReportsClient.tsx with cables checkbox option!");
}

// 2. Update PlanBmaSymbolsModule.tsx for free_line device snapping
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaModPath, "utf8");

// Handle free_line click in MapEventsHandler
const oldFreeLineMapEvent = `        // Active Free Line: click on map adds point
        if (activeTool === "free_line") {
          setDrawingFreeLinePoints((prev) => [...prev, { x_norm, y_norm }]);
          return;
        }`;

const newFreeLineMapEvent = `        // Active Free Line: click on map or device adds point and attaches source/target
        if (currentTool === "free_line") {
          const clickedDev = findClickedDevice(x_norm, y_norm);
          const pt = clickedDev ? { x_norm: clickedDev.x_norm, y_norm: clickedDev.y_norm } : { x_norm, y_norm };
          
          if (drawingFreeLinePoints.length === 0) {
            if (clickedDev) {
              setCableModalSource({ id: clickedDev.id, label: clickedDev.label || "Gerät A", plan_id: planId });
            } else {
              setCableModalSource(null);
            }
          } else {
            if (clickedDev) {
              setCableModalTarget({ id: clickedDev.id, label: clickedDev.label || "Gerät B", plan_id: planId });
            }
          }
          setDrawingFreeLinePoints((prev) => [...prev, pt]);
          return;
        }`;

bmaContent = bmaContent.replace(oldFreeLineMapEvent, newFreeLineMapEvent);

// Also in handleDeviceClick for free_line
const freeLineDeviceClickHandling = `    if (currentTool === "free_line") {
      const pt = { x_norm: s.x_norm, y_norm: s.y_norm };
      if (drawingFreeLinePoints.length === 0) {
        setCableModalSource({ id: s.id, label: s.label || "Gerät A", plan_id: planId });
      } else {
        setCableModalTarget({ id: s.id, label: s.label || "Gerät B", plan_id: planId });
      }
      setDrawingFreeLinePoints((prev) => [...prev, pt]);
      return;
    }`;

if (!bmaContent.includes('if (currentTool === "free_line") {')) {
  bmaContent = bmaContent.replace(
    '    if (currentTool === "cable_connect") {',
    freeLineDeviceClickHandling + '\n\n    if (currentTool === "cable_connect") {'
  );
}

fs.writeFileSync(bmaModPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with free_line device snapping!");

// 3. Update PlanElementsPdf.tsx to add Kabelzugliste Page and safeguard image rendering
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// Add Kabelzugliste page generation if not present
const kabelzuglistePageCode = `
            {/* ── KABELZÜGE & LEITUNGSLISTE (KABELVERBINDUNGEN) SEPARATE REPORT PAGE ── */}
            {options.includeCables !== false && (() => {
                const allCables: Array<{
                    id: string;
                    planLabel: string;
                    name: string;
                    cable_number: string;
                    cable_type: string;
                    description: string;
                    sourceLabel: string;
                    targetLabel: string;
                    length_meters: number;
                    is_free_line: boolean;
                    color: string;
                }> = [];

                plansData.forEach((p, idx) => {
                    const pLabel = [p.buildingName, p.floorName, p.planName].filter(Boolean).join(' › ') || \`Plan \${idx + 1}\`;
                    (p.cableConnections || []).forEach((c: any) => {
                        const m = c.metadata || {};
                        const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                        const s1 = p.bmaSymbols?.find((s: any) => s.id === m.source_symbol_id);
                        const s2 = p.bmaSymbols?.find((s: any) => s.id === m.target_symbol_id);
                        
                        allCables.push({
                            id: c.id,
                            planLabel: pLabel,
                            name: c.name || m.cable_number || 'Kabel',
                            cable_number: m.cable_number || c.name || '—',
                            cable_type: m.cable_type || 'Standard',
                            description: m.description || c.description || '—',
                            sourceLabel: s1?.label || m.source_device_label || (isFree ? 'Freier Start' : 'Gerät A'),
                            targetLabel: s2?.label || m.target_device_label || (isFree ? 'Freies Ende' : 'Gerät B'),
                            length_meters: Number(m.length_meters) || 0,
                            is_free_line: isFree,
                            color: c.color || (isFree ? '#f59e0b' : '#0284c7'),
                        });
                    });
                });

                if (allCables.length === 0) return null;

                const totalCableMeters = allCables.reduce((acc, c) => acc + c.length_meters, 0);
                const totalCablesCount = allCables.length;

                // Group lengths by cable type
                const typeSummary: Record<string, { count: number; meters: number }> = {};
                allCables.forEach(c => {
                    if (!typeSummary[c.cable_type]) typeSummary[c.cable_type] = { count: 0, meters: 0 };
                    typeSummary[c.cable_type].count += 1;
                    typeSummary[c.cable_type].meters += c.length_meters;
                });

                return (
                    <Page
                        key="kabelzugliste-page"
                        size="A4"
                        orientation="landscape"
                        style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                        wrap={false}
                    >
                        {/* Header Bar */}
                        <View style={[styles.header, { height: 44, backgroundColor: '#0284c7', paddingHorizontal: 16, marginBottom: 14, borderRadius: 6 }]}>
                            <View style={styles.headerLeft}>
                                <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#ffffff' }}>
                                    🔌 KABELZÜGLISTE & LEITUNGSVERZEICHNIS
                                </Text>
                                <Text style={styles.headerDivider}>|</Text>
                                <Text style={{ fontSize: 11, color: '#e0f2fe' }}>
                                    {translations.project || 'Projekt'}: <Text style={{ fontWeight: 'bold', color: '#ffffff' }}>{projectName}</Text>
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ fontSize: 10, color: '#e0f2fe' }}>
                                    {translations.generatedOn || 'Erstellt am'}: {new Date().toLocaleDateString()}
                                </Text>
                            </View>
                        </View>

                        {/* Top Summary Banner */}
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                            <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 6, padding: 8, alignItems: 'center' }}>
                                <Text style={{ fontSize: 9, color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Gesamte Kabellänge</Text>
                                <Text style={{ fontSize: 18, fontWeight: 'black', color: '#15803d', marginTop: 2 }}>{Math.round(totalCableMeters * 10) / 10} m</Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 6, padding: 8, alignItems: 'center' }}>
                                <Text style={{ fontSize: 9, color: '#0369a1', fontWeight: 'bold', textTransform: 'uppercase' }}>Anzahl Kabelzüge</Text>
                                <Text style={{ fontSize: 18, fontWeight: 'black', color: '#0284c7', marginTop: 2 }}>{totalCablesCount} Stk.</Text>
                            </View>
                            <View style={{ flex: 2, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 6 }}>
                                <Text style={{ fontSize: 8, color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 3 }}>Kabeltypen & Querschnitte:</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {Object.entries(typeSummary).map(([tName, tData]) => (
                                        <Text key={tName} style={{ fontSize: 8, color: '#0f172a', backgroundColor: '#e2e8f0', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                            <Text style={{ fontWeight: 'bold' }}>{tName}</Text>: {Math.round(tData.meters * 10) / 10} m ({tData.count}x)
                                        </Text>
                                    ))}
                                </View>
                            </View>
                        </View>

                        {/* Cable Table */}
                        <View style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
                            {/* Table Header */}
                            <View style={{ flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 6, paddingHorizontal: 8 }}>
                                <Text style={{ width: '10%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc' }}>Kabel-Nr.</Text>
                                <Text style={{ width: '22%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc' }}>Kabeltyp / Querschnitt</Text>
                                <Text style={{ width: '18%', fontSize: 9, fontWeight: 'bold', color: '#38bdf8' }}>Von (Quelle)</Text>
                                <Text style={{ width: '18%', fontSize: 9, fontWeight: 'bold', color: '#4ade80' }}>Nach (Ziel)</Text>
                                <Text style={{ width: '10%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc', textAlign: 'right' }}>Länge</Text>
                                <Text style={{ width: '22%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc' }}>Plan & Bemerkung</Text>
                            </View>

                            {/* Table Rows */}
                            {allCables.map((cable, idx) => (
                                <View
                                    key={cable.id || idx}
                                    style={{
                                        flexDirection: 'row',
                                        paddingVertical: 5,
                                        paddingHorizontal: 8,
                                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                        borderTopWidth: 1,
                                        borderTopColor: '#e2e8f0',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text style={{ width: '10%', fontSize: 8, fontWeight: 'bold', color: cable.color }}>{cable.cable_number}</Text>
                                    <Text style={{ width: '22%', fontSize: 8, color: '#1e293b' }}>{cable.cable_type}</Text>
                                    <Text style={{ width: '18%', fontSize: 8, color: '#0369a1', fontWeight: 'bold' }}>{cable.sourceLabel}</Text>
                                    <Text style={{ width: '18%', fontSize: 8, color: '#15803d', fontWeight: 'bold' }}>{cable.targetLabel}</Text>
                                    <Text style={{ width: '10%', fontSize: 8, fontWeight: 'bold', color: '#0f172a', textAlign: 'right' }}>
                                        {cable.length_meters ? \`\${cable.length_meters} m\` : '—'}
                                    </Text>
                                    <Text style={{ width: '22%', fontSize: 7, color: '#64748b' }}>
                                        <Text style={{ fontWeight: 'bold', color: '#334155' }}>{cable.planLabel}</Text>
                                        {cable.description && cable.description !== '—' ? \` - \${cable.description}\` : ''}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </Page>
                );
            })()}
`;

if (!pdfContent.includes('key="kabelzugliste-page"')) {
  const docClosing = '</Document>';
  pdfContent = pdfContent.replace(docClosing, kabelzuglistePageCode + '\n        ' + docClosing);
  fs.writeFileSync(pdfPath, pdfContent, "utf8");
  console.log("Successfully injected Kabelzugliste Report Page into PlanElementsPdf.tsx!");
}
