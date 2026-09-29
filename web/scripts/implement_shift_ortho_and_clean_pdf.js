const fs = require("fs");
const path = require("path");

// 1. Clean up PlanElementsPdf.tsx
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// Remove broken duplicate block with projectTitle
const blockStart = '{/* ══════════════════════════════════════════════════════════════════════\n                PAGE: KABELZUGLISTE & VERBINDUNGSÜBERSICHT';
const startIdx = pdfContent.indexOf(blockStart);
if (startIdx !== -1) {
  const blockEnd = '{/* ── KABELZÜGE & LEITUNGSLISTE (KABELVERBINDUNGEN) SEPARATE REPORT PAGE ── */}';
  const endIdx = pdfContent.indexOf(blockEnd, startIdx);
  if (endIdx !== -1) {
    pdfContent = pdfContent.slice(0, startIdx) + pdfContent.slice(endIdx);
    console.log("Removed broken duplicate block with projectTitle ReferenceError!");
  }
}

// Remove display: none page if present
pdfContent = pdfContent.replace(
  `            {/* Fallback Page: ensures document is never empty */}
            <Page size="A4" style={{ display: 'none' }}>
                <View><Text> </Text></View>
            </Page>`,
  ''
);

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("PlanElementsPdf.tsx cleaned up!");

// 2. Implement Shift-Key Orthogonal (Right-Angle 90°) snapping in PlanBmaSymbolsModule.tsx
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaModPath, "utf8");

// Add helper function snapOrtho
const snapOrthoHelper = `
function snapOrtho(prevPt: { x_norm: number; y_norm: number }, currPt: { x_norm: number; y_norm: number }, isShift: boolean) {
  if (!isShift || !prevPt) return currPt;
  const dx = Math.abs(currPt.x_norm - prevPt.x_norm);
  const dy = Math.abs(currPt.y_norm - prevPt.y_norm);
  if (dx >= dy) {
    return { x_norm: currPt.x_norm, y_norm: prevPt.y_norm }; // Lock horizontal
  } else {
    return { x_norm: prevPt.x_norm, y_norm: currPt.y_norm }; // Lock vertical
  }
}
`;

if (!bmaContent.includes("function snapOrtho")) {
  bmaContent = snapOrthoHelper + "\n" + bmaContent;
}

// In MapEventsHandler:
// Track shiftKey on click & mousemove
const oldMapClickLogic = `        // Active Cable Connect: click on map adds waypoint`;
const newMapClickLogic = `        const isShiftKey = !!(e.originalEvent?.shiftKey);

        // Active Cable Connect: click on map adds waypoint with Shift 90-degree snapping
        if (currentTool === "cable_connect" && currentStart) {
          const lastPt = currentWaypoints.length > 0
            ? currentWaypoints[currentWaypoints.length - 1]
            : { x_norm: currentStart.x_norm, y_norm: currentStart.y_norm };
          const snapped = snapOrtho(lastPt, { x_norm, y_norm }, isShiftKey);
          setDrawingCableWaypoints((prev) => [...prev, snapped]);
          drawingCableWaypointsRef.current = [...currentWaypoints, snapped];
          return;
        }`;

bmaContent = bmaContent.replace(
  `        // Active Cable Connect: click on map adds waypoint
        if (currentTool === "cable_connect" && currentStart) {
          setDrawingCableWaypoints((prev) => [...prev, { x_norm, y_norm }]);
          drawingCableWaypointsRef.current = [...currentWaypoints, { x_norm, y_norm }];
          return;
        }`,
  newMapClickLogic
);

// Also in free_line click in MapEventsHandler
bmaContent = bmaContent.replace(
  `            } else {
              const allPts = [...currentPts, pt];
              setDrawingFreeLinePoints(allPts);
              drawingFreeLinePointsRef.current = allPts;
            }`,
  `            } else {
              const lastPt = currentPts[currentPts.length - 1];
              const snapped = snapOrtho(lastPt, pt, isShiftKey);
              const allPts = [...currentPts, snapped];
              setDrawingFreeLinePoints(allPts);
              drawingFreeLinePointsRef.current = allPts;
            }`
);

// In mousemove: snap hover point if Shift is pressed
bmaContent = bmaContent.replace(
  `        if (
          (activeTool === "cable_connect" && drawingCableStartSymbol) ||
          (activeTool === "free_line" && drawingFreeLinePoints.length > 0)
        ) {
          setHoverLatLng(e.latlng);
        }`,
  `        if (
          (activeTool === "cable_connect" && drawingCableStartSymbol) ||
          (activeTool === "free_line" && drawingFreeLinePoints.length > 0)
        ) {
          const isShift = !!(e.originalEvent?.shiftKey);
          if (isShift) {
            const lastPt = activeTool === "cable_connect"
              ? (drawingCableWaypoints.length > 0 ? drawingCableWaypoints[drawingCableWaypoints.length - 1] : { x_norm: drawingCableStartSymbol!.x_norm, y_norm: drawingCableStartSymbol!.y_norm })
              : (drawingFreeLinePoints[drawingFreeLinePoints.length - 1]);
            if (lastPt) {
              const dx = Math.abs(x_norm - lastPt.x_norm);
              const dy = Math.abs(y_norm - lastPt.y_norm);
              const snappedX = dx >= dy ? x_norm : lastPt.x_norm;
              const snappedY = dx >= dy ? lastPt.y_norm : y_norm;
              setHoverLatLng(normToLatLng(snappedX, snappedY));
              return;
            }
          }
          setHoverLatLng(e.latlng);
        }`
);

// Mention Shift key in the floating top banner
bmaContent = bmaContent.replace(
  `Klicken auf Ziel-Gerät oder "Fertig"`,
  `Klicken auf Ziel-Gerät oder "Fertig" (Shift = 90° Winkel)`
);
bmaContent = bmaContent.replace(
  `Klicken Sie auf das Ziel-Gerät`,
  `Klicken Sie auf das Ziel-Gerät (Shift = 90° Winkel)`
);

fs.writeFileSync(bmaModPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with Shift right-angle snapping!");
