const fs = require("fs");
const path = require("path");

// 1. Update PlanElementsPdf.tsx:
// - Safe photo rendering (no broken image crashing React-PDF)
// - Support wrap={true} and multi-page Kabelzugliste
// - Make sure extractAndSortAufkleberItems handles heating correctly
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// Safe photoBase64 rendering: only pass valid data URIs or base64 to Image, fallback to iconBase64
pdfContent = pdfContent.replace(
  `{grp.photoBase64 ? (
                                                    <Image src={grp.photoBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                ) : (
                                                    <Image src={iconBase64} style={{ width: 42, height: 42, objectFit: 'contain' }} />
                                                )}`,
  `{grp.photoBase64 && typeof grp.photoBase64 === 'string' && grp.photoBase64.startsWith('data:image') ? (
                                                    <Image src={grp.photoBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                ) : (
                                                    <Image src={iconBase64 || BMA_ICONS_BASE64['detector_blue']} style={{ width: 42, height: 42, objectFit: 'contain' }} />
                                                )}`
);

// In Plan Overview icons: safeguard iconSrc
pdfContent = pdfContent.replace(
  `<Image
                                            src={iconSrc}
                                            style={{`,
  `<Image
                                            src={iconSrc && typeof iconSrc === 'string' && iconSrc.startsWith('data:image') ? iconSrc : BMA_ICONS_BASE64['detector_blue']}
                                            style={{`
);

// Update Kabelzugliste Page to wrap across multiple pages if many cables exist
pdfContent = pdfContent.replace(
  `<Page
                        key="kabelzugliste-page"
                        size="A4"
                        orientation="landscape"
                        style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                        wrap={false}
                    >`,
  `<Page
                        key="kabelzugliste-page"
                        size="A4"
                        orientation="landscape"
                        style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                        wrap={true}
                    >`
);

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("Updated PlanElementsPdf.tsx with safe image handling and multi-page Kabelzugliste!");

// 2. Update ReportsClient.tsx:
// - Always fetch lampTypes when heating or lampTypes or notlicht is selected
// - Add standalone "Kabelzugliste PDF" button and options
const reportsPath = path.join(__dirname, "../src/app/reports/ReportsClient.tsx");
let repContent = fs.readFileSync(reportsPath, "utf8");

repContent = repContent.replace(
  `if (peOptLampTypes || peOptNotlicht) {`,
  `if (peOptLampTypes || peOptNotlicht || peOptHeating) {`
);

fs.writeFileSync(reportsPath, repContent, "utf8");
console.log("Updated ReportsClient.tsx!");

// 3. Update PlanBmaSymbolsModule.tsx for seamless Free Line start/end on devices
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaModPath, "utf8");

// In handleToggleTool:
bmaContent = bmaContent.replace(
  `    if (tool === "cable_connect") {
      setActiveTool("cable_connect");
      activeToolRef.current = "cable_connect";
    } else if (tool === "free_line") {
      setActiveTool("free_line");
      activeToolRef.current = "free_line";
    }`,
  `    if (tool === "cable_connect") {
      setActiveTool("cable_connect");
      activeToolRef.current = "cable_connect";
      setDrawingCableStartSymbol(null);
      drawingCableStartSymbolRef.current = null;
      setDrawingCableWaypoints([]);
      drawingCableWaypointsRef.current = [];
    } else if (tool === "free_line") {
      setActiveTool("free_line");
      activeToolRef.current = "free_line";
      setDrawingFreeLinePoints([]);
      setCableModalSource(null);
      setCableModalTarget(null);
    }`
);

// In handleDeviceClick:
const newHandleDeviceClick = `  const handleDeviceClick = useCallback((s: BmaSymbolRow, e: any) => {
    if (activeSymbolType) return;
    if (e?.originalEvent) e.originalEvent.stopPropagation();
    if (e?.stopPropagation) e.stopPropagation();

    const currentTool = activeToolRef.current || activeTool;
    const currentStart = drawingCableStartSymbolRef.current || drawingCableStartSymbol;
    const currentWaypoints = drawingCableWaypointsRef.current || drawingCableWaypoints;

    // Handle Free Line click on a device: attach start or finish connection!
    if (currentTool === "free_line") {
      const pt = { x_norm: s.x_norm, y_norm: s.y_norm };
      if (drawingFreeLinePoints.length === 0) {
        // Snap start to this device
        setCableModalSource({ id: s.id, label: s.label || getSymbolName(s.symbol_type), plan_id: planId });
        setDrawingFreeLinePoints([pt]);
      } else {
        // Snap end to this device and finish line
        const allPts = [...drawingFreeLinePoints, pt];
        setCableModalTarget({ id: s.id, label: s.label || getSymbolName(s.symbol_type), plan_id: planId });
        setDrawingFreeLinePoints(allPts);
        const len = calculatePathLengthMeters(allPts);
        setCableModalWaypoints(allPts);
        setCableModalIsFreeLine(true);
        setCableNumberInput(\`L-\${String(cableConnections.filter(c => c.type === 'FREE_LINE' || c.metadata?.is_free_line).length + 1).padStart(3, "0")}\`);
        setCableDescInput(cableModalSource?.label ? \`Zuleitung \${cableModalSource.label} ➔ \${s.label || "Gerät B"}\` : \`Zuleitung \${s.label || "Gerät B"}\`);
        setCableLengthCalculated(len);
        setCableModalOpen(true);
      }
      return;
    }

    // Handle Cable Connect click on device
    if (currentTool === "cable_connect") {
      if (!currentStart) {
        setDrawingCableStartSymbol(s);
        drawingCableStartSymbolRef.current = s;
      } else if (currentStart.id !== s.id) {
        const pts = [
          { x_norm: currentStart.x_norm, y_norm: currentStart.y_norm },
          ...currentWaypoints,
          { x_norm: s.x_norm, y_norm: s.y_norm },
        ];
        const len = calculatePathLengthMeters(pts);
        setCableModalSource({ id: currentStart.id, label: currentStart.label || "Gerät A", plan_id: planId });
        setCableModalTarget({ id: s.id, label: s.label || "Gerät B", plan_id: planId });
        setCableModalWaypoints(currentWaypoints);
        setCableModalIsFreeLine(false);
        setCableNumberInput(\`K-\${String(cableConnections.length + 1).padStart(3, "0")}\`);
        setCableDescInput(\`Zuleitung \${s.label || "Gerät"}\`);
        setCableLengthCalculated(len);
        setCableModalOpen(true);
      }
      return;
    }

    setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
  }, [activeSymbolType, activeTool, drawingCableStartSymbol, drawingCableWaypoints, drawingFreeLinePoints, planId, calculatePathLengthMeters, cableConnections, cableModalSource]);`;

// Replace handleDeviceClick in PlanBmaSymbolsModule.tsx
const oldHandleDevClickStart = '  const handleDeviceClick = useCallback((s: BmaSymbolRow, e: any) => {';
const oldHandleDevClickEnd = '  }, [activeSymbolType, activeTool, drawingCableStartSymbol, drawingCableWaypoints, planId, calculatePathLengthMeters, cableConnections]);';

const startIdx = bmaContent.indexOf(oldHandleDevClickStart);
if (startIdx !== -1) {
  const endIdx = bmaContent.indexOf(oldHandleDevClickEnd, startIdx);
  if (endIdx !== -1) {
    bmaContent = bmaContent.slice(0, startIdx) + newHandleDeviceClick + bmaContent.slice(endIdx + oldHandleDevClickEnd.length);
  }
}

// In floating banner for free_line: show "Fertigstellen (Enter)" button
bmaContent = bmaContent.replace(
  `              ) : activeTool === "free_line" ? (
                <>
                  〰 <b>Freie Leitung zeichnen:</b> {drawingFreeLinePoints.length > 0 ? (
                    <span>{drawingFreeLinePoints.length} Punkte gesetzt (Klicken für weitere Punkte)</span>
                  ) : (
                    <span>Klicken Sie auf den Plan, um die Leitung zu beginnen</span>
                  )}
                </>
              )`,
  `              ) : activeTool === "free_line" ? (
                <>
                  〰 <b>Freie Leitung zeichnen:</b> {drawingFreeLinePoints.length > 0 ? (
                    <span style={{ color: "#38bdf8" }}>
                      {cableModalSource ? \`Start: \${cableModalSource.label} ➔ \` : ""}{drawingFreeLinePoints.length} Punkte gesetzt (Klicken auf Ziel-Gerät oder "Fertig")
                    </span>
                  ) : (
                    <span>Klicken Sie auf ein <b>Start-Gerät</b> oder beliebigen Punkt</span>
                  )}
                </>
              )`
);

// Add finish and undo buttons for free_line in floating banner
const freeLineButtons = `            {/* Quick finish / undo / cancel buttons for Free Line */}
            {activeTool === "free_line" && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                {drawingFreeLinePoints.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleFinishFreeLine}
                    style={{
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(2,132,199,0.4)",
                    }}
                  >
                    ✓ Fertigstellen (Enter)
                  </button>
                )}
                {drawingFreeLinePoints.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDrawingFreeLinePoints((prev) => prev.slice(0, -1))}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ↶ Rückgängig
                  </button>
                )}
              </div>
            )}`;

if (!bmaContent.includes("Quick finish / undo / cancel buttons for Free Line")) {
  bmaContent = bmaContent.replace(
    `            {/* Quick finish / undo / cancel buttons for Kabelbahn */}`,
    freeLineButtons + '\n\n            {/* Quick finish / undo / cancel buttons for Kabelbahn */}'
  );
}

fs.writeFileSync(bmaModPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with Free Line buttons and instant device connection!");
