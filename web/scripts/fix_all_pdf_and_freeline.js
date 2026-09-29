const fs = require("fs");
const path = require("path");

// 1. Fix PlanElementsPdf.tsx
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// Fix ExportPlanData interface
pdfContent = pdfContent.replace(
  `export type ExportPlanData = {
    planId: string;
    planName: string;
    buildingName?: string;
    floorName?: string;
    imageBase64: string | null;
    imageWidth?: number;
    imageHeight?: number;
    measurements: Array<{
        id: string;
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        distanceMeters?: number;
        distancePixels?: number;
        label?: string;
        category?: string;
        color?: string;
        strokeWidth?: number;
        metadata?: any;
        points?: Array<{ x_norm: number; y_norm: number; dist_m?: number | null; dist_px?: number }>;
    }>;
    klappen: Array<{
        id: string;
        x: number;
        y: number;
        label?: string;
        description?: string;
        dimensions?: string;
        color?: string;
        photoBase64?: string;
    }>;
    bmaSymbols: Array<{
        id: string;
        x_norm: number;
        y_norm: number;
        symbol_type: string;
        label?: string;
        description?: string;
        loop_number?: string;
        address?: string;
    }>;
    photoPins: Array<{
        id: string;
        x_norm: number;
        y_norm: number;
        number?: number;
        label?: string;
        description?: string;
        photoBase64?: string;
    }>;
    lampTypes?: {
        notlicht_lampe?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        notlicht_pikto?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        notlicht_pikto_gross?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        warmepumpe_aussen?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        warmepumpe_innen?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        infrarotheizung?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        geraet_box?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        variants?: Array<{
            id: string;
            category: string;
            name: string;
            model: string;
            color: string;
            notes?: string;
            photoBase64?: string;
        }>;
    };
};`,
  `export type ExportPlanData = {
    planId: string;
    planName: string;
    buildingName?: string;
    floorName?: string;
    imageBase64: string | null;
    imageWidth?: number;
    imageHeight?: number;
    measurements: any[];
    klappen: any[];
    bmaSymbols: any[];
    photoPins: any[];
    lampTypes?: any;
    cableConnections?: any[];
};`
);

// Fix Polyline in Plan Overview (lines 1025-1040) to use Path with d attribute
pdfContent = pdfContent.replace(
  `<Polyline
                                                points={polyPointsStr}
                                                stroke={strokeColor}
                                                strokeWidth={2.5}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                fill="none"
                                            />`,
  `<Path
                                                d={pts.map((p, i) => \`\${i === 0 ? 'M' : 'L'} \${Math.round(p.x + offset)} \${Math.round(p.y + offset)}\`).join(' ')}
                                                stroke={strokeColor}
                                                strokeWidth={2.5}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                fill="none"
                                            />`
);

// Remove the broken intermediate kabelzugliste block if exists
const brokenBlockStart = '{options.includeCables && (() => {';
const brokenBlockIdx = pdfContent.indexOf(brokenBlockStart);
if (brokenBlockIdx !== -1) {
  const brokenBlockEnd = '})()}';
  const brokenEndIdx = pdfContent.indexOf(brokenBlockEnd, brokenBlockIdx);
  if (brokenEndIdx !== -1) {
    pdfContent = pdfContent.slice(0, brokenBlockIdx) + pdfContent.slice(brokenEndIdx + brokenBlockEnd.length);
  }
}

// Add fallback page to Document to guarantee it's NEVER null or empty
const fallbackPage = `
            {/* Fallback Page: ensures document is never empty */}
            <Page size="A4" style={{ display: 'none' }}>
                <View><Text> </Text></View>
            </Page>
`;
if (!pdfContent.includes('Fallback Page: ensures document is never empty')) {
  pdfContent = pdfContent.replace('</Document>', fallbackPage + '\n        </Document>');
}

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("Updated PlanElementsPdf.tsx cleanly!");

// 2. Fix PlanBmaSymbolsModule.tsx
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaModPath, "utf8");

// Add drawingFreeLinePointsRef
if (!bmaContent.includes("drawingFreeLinePointsRef")) {
  bmaContent = bmaContent.replace(
    "const [drawingFreeLinePoints, setDrawingFreeLinePoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);",
    `const [drawingFreeLinePoints, setDrawingFreeLinePoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const drawingFreeLinePointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);`
  );
}

// In handleToggleTool:
bmaContent = bmaContent.replace(
  `    } else if (tool === "free_line") {
      setActiveTool("free_line");
      activeToolRef.current = "free_line";
      setDrawingFreeLinePoints([]);
      setCableModalSource(null);
      setCableModalTarget(null);
    }`,
  `    } else if (tool === "free_line") {
      setActiveTool("free_line");
      activeToolRef.current = "free_line";
      setDrawingFreeLinePoints([]);
      drawingFreeLinePointsRef.current = [];
      setCableModalSource(null);
      setCableModalTarget(null);
    }`
);

// Replace handleDeviceClick entirely to handle free_line and cable_connect smoothly
const completeHandleDeviceClick = `  // Unified handler for clicking any device/symbol on the map (Point symbols, GeraetBox, LedStripe, etc.)
  const handleDeviceClick = useCallback(
    (s: BmaSymbolRow, e?: any) => {
      if (e?.originalEvent) e.originalEvent.stopPropagation();
      if (e?.stopPropagation) e.stopPropagation();

      const currentTool = activeToolRef.current || activeTool;
      const currentStart = drawingCableStartSymbolRef.current || drawingCableStartSymbol;
      const currentWaypoints = drawingCableWaypointsRef.current || drawingCableWaypoints;
      const currentFreePoints = drawingFreeLinePointsRef.current || drawingFreeLinePoints;

      // Handle Free Line click on a device
      if (currentTool === "free_line") {
        const pt = { x_norm: s.x_norm, y_norm: s.y_norm };
        if (currentFreePoints.length === 0) {
          // Snap start to this device
          setCableModalSource({ id: s.id, label: s.label || getSymbolName(s.symbol_type), plan_id: planId });
          setDrawingFreeLinePoints([pt]);
          drawingFreeLinePointsRef.current = [pt];
        } else {
          // Snap end to this device and finish line
          const allPts = [...currentFreePoints, pt];
          setCableModalTarget({ id: s.id, label: s.label || getSymbolName(s.symbol_type), plan_id: planId });
          setDrawingFreeLinePoints(allPts);
          drawingFreeLinePointsRef.current = allPts;
          const len = calculatePathLengthMeters(allPts);
          setCableModalWaypoints(allPts);
          setCableModalIsFreeLine(true);
          setCableNumberInput(\`L-\${String(cableConnections.filter(c => c.type === 'FREE_LINE' || c.metadata?.is_free_line).length + 1).padStart(3, "0")}\`);
          setCableDescInput(cableModalSource?.label ? \`Zuleitung \${cableModalSource.label} ➔ \${s.label || getSymbolName(s.symbol_type)}\` : \`Zuleitung \${s.label || getSymbolName(s.symbol_type)}\`);
          setCableLengthCalculated(len);
          setCableModalOpen(true);
        }
        return;
      }

      // If Cable Connect tool is active: clicking symbol handles start / target selection
      if (currentTool === "cable_connect") {
        if (!currentStart) {
          setDrawingCableStartSymbol(s);
          drawingCableStartSymbolRef.current = s;
          return;
        } else if (currentStart.id !== s.id) {
          // Finish connection to 2nd device!
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
          return;
        }
      }

      if (activeSymbolType || activeTool) return;
      setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
    },
    [activeTool, drawingCableStartSymbol, drawingCableWaypoints, drawingFreeLinePoints, calculatePathLengthMeters, planId, cableConnections, activeSymbolType, cableModalSource]
  );`;

const oldHandleDevStart = "  // Unified handler for clicking any device/symbol on the map";
const devStartPos = bmaContent.indexOf(oldHandleDevStart);
if (devStartPos !== -1) {
  const devEndPos = bmaContent.indexOf("  const handleFinishFreeLine = () => {", devStartPos);
  if (devEndPos !== -1) {
    bmaContent = bmaContent.slice(0, devStartPos) + completeHandleDeviceClick + "\n\n" + bmaContent.slice(devEndPos);
  }
}

// In MapEventsHandler: update free_line logic
const freeLineMapEventCode = `        // Active Free Line: click on map or device adds point
        if (currentTool === "free_line") {
          const clickedDev = findClickedDevice(x_norm, y_norm);
          const pt = clickedDev ? { x_norm: clickedDev.x_norm, y_norm: clickedDev.y_norm } : { x_norm, y_norm };
          const currentPts = drawingFreeLinePointsRef.current || drawingFreeLinePoints;
          
          if (currentPts.length === 0) {
            if (clickedDev) {
              setCableModalSource({ id: clickedDev.id, label: clickedDev.label || getSymbolName(clickedDev.symbol_type), plan_id: planId });
            } else {
              setCableModalSource(null);
            }
            setDrawingFreeLinePoints([pt]);
            drawingFreeLinePointsRef.current = [pt];
          } else {
            if (clickedDev) {
              const allPts = [...currentPts, pt];
              setCableModalTarget({ id: clickedDev.id, label: clickedDev.label || getSymbolName(clickedDev.symbol_type), plan_id: planId });
              setDrawingFreeLinePoints(allPts);
              drawingFreeLinePointsRef.current = allPts;
              const len = calculatePathLengthMeters(allPts);
              setCableModalWaypoints(allPts);
              setCableModalIsFreeLine(true);
              setCableNumberInput(\`L-\${String(cableConnections.filter(c => c.type === 'FREE_LINE' || c.metadata?.is_free_line).length + 1).padStart(3, "0")}\`);
              setCableDescInput(cableModalSource?.label ? \`Zuleitung \${cableModalSource.label} ➔ \${clickedDev.label || getSymbolName(clickedDev.symbol_type)}\` : \`Zuleitung \${clickedDev.label || getSymbolName(clickedDev.symbol_type)}\`);
              setCableLengthCalculated(len);
              setCableModalOpen(true);
            } else {
              const allPts = [...currentPts, pt];
              setDrawingFreeLinePoints(allPts);
              drawingFreeLinePointsRef.current = allPts;
            }
          }
          return;
        }`;

// Replace in MapEventsHandler
const mapHandlerTargetStart = '        // Active Free Line: click on map';
const mapHandlerPos = bmaContent.indexOf(mapHandlerTargetStart);
if (mapHandlerPos !== -1) {
  const mapHandlerEndPos = bmaContent.indexOf('        // If LED Stripe drawing mode is active', mapHandlerPos);
  if (mapHandlerEndPos !== -1) {
    bmaContent = bmaContent.slice(0, mapHandlerPos) + freeLineMapEventCode + '\n\n' + bmaContent.slice(mapHandlerEndPos);
  }
}

fs.writeFileSync(bmaModPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with complete Free Line device snapping and ref synchronization!");
