const fs = require("fs");
const path = require("path");

// 1. Update PlanBmaSymbolsModule.tsx
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaModPath, "utf8");

// A. Load plan scale on mount so cable lengths in meters are accurately computed
const scaleLoaderCode = `
  // Load plan scale from /api/plans/[id]/scale
  useEffect(() => {
    async function loadPlanScale() {
      try {
        const token = await getToken();
        const res = await fetch(\`/api/plans/\${planId}/scale\`, {
          headers: token ? { Authorization: \`Bearer \${token}\` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          const ppm = json.scale?.pixels_per_meter ?? json.scale?.pixelsPerMeter;
          if (ppm && Number(ppm) > 0) {
            setPlanScale(Number(ppm));
            console.log(\`Plan scale loaded: \${ppm} px/meter\`);
          }
        }
      } catch (err) {
        console.error("Error loading plan scale:", err);
      }
    }
    loadPlanScale();
  }, [planId]);
`;

if (!bmaContent.includes("loadPlanScale()")) {
  bmaContent = bmaContent.replace(
    "const [planScale, setPlanScale] = useState<number | null>(null);",
    "const [planScale, setPlanScale] = useState<number | null>(null);\n" + scaleLoaderCode
  );
}

// B. Global Shift Key tracking
const shiftKeyHook = `
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const isShiftPressedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(true);
        isShiftPressedRef.current = true;
      }
      if (e.key === "Enter") {
        if (activeToolRef.current === "free_line" && drawingFreeLinePointsRef.current.length >= 2) {
          handleFinishFreeLine();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
        isShiftPressedRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
`;

if (!bmaContent.includes("isShiftPressedRef")) {
  bmaContent = bmaContent.replace(
    "const drawingFreeLinePointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);",
    "const drawingFreeLinePointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);\n" + shiftKeyHook
  );
}

// C. In MapEventsHandler: fix free_line and cable_connect to allow intermediate waypoints seamlessly and snap 90° with shift
const improvedMapEventsCode = `
        const isShiftKey = isShiftPressedRef.current || !!(e.originalEvent?.shiftKey);

        // Active Cable Connect: click on map adds waypoint
        if (currentTool === "cable_connect" && currentStart) {
          const lastPt = currentWaypoints.length > 0
            ? currentWaypoints[currentWaypoints.length - 1]
            : { x_norm: currentStart.x_norm, y_norm: currentStart.y_norm };
          const snapped = snapOrtho(lastPt, { x_norm, y_norm }, isShiftKey);
          setDrawingCableWaypoints((prev) => [...prev, snapped]);
          drawingCableWaypointsRef.current = [...currentWaypoints, snapped];
          return;
        }

        // Active Free Line: click on map adds intermediate waypoint
        if (currentTool === "free_line") {
          const currentPts = drawingFreeLinePointsRef.current || drawingFreeLinePoints;
          if (currentPts.length === 0) {
            setDrawingFreeLinePoints([{ x_norm, y_norm }]);
            drawingFreeLinePointsRef.current = [{ x_norm, y_norm }];
          } else {
            const lastPt = currentPts[currentPts.length - 1];
            const snapped = snapOrtho(lastPt, { x_norm, y_norm }, isShiftKey);
            const allPts = [...currentPts, snapped];
            setDrawingFreeLinePoints(allPts);
            drawingFreeLinePointsRef.current = allPts;
          }
          return;
        }
`;

const oldMapEventsStart = '// Active Cable Connect: click on map adds waypoint with Shift 90-degree snapping';
const oldMapEventsIdx = bmaContent.indexOf(oldMapEventsStart);
if (oldMapEventsIdx !== -1) {
  const oldMapEventsEnd = '// If LED Stripe drawing mode is active: click 1 sets corner 1, click 2 finishes rectangle';
  const oldEndIdx = bmaContent.indexOf(oldMapEventsEnd, oldMapEventsIdx);
  if (oldEndIdx !== -1) {
    bmaContent = bmaContent.slice(0, oldMapEventsIdx) + improvedMapEventsCode + "\n\n        " + bmaContent.slice(oldEndIdx);
  }
}

// D. In mousemove: snap hover point with isShiftPressedRef
bmaContent = bmaContent.replace(
  `const isShift = !!(e.originalEvent?.shiftKey);`,
  `const isShift = isShiftPressedRef.current || !!(e.originalEvent?.shiftKey);`
);

fs.writeFileSync(bmaModPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with plan scale loader, shift tracking and smooth free line waypoints!");

// 2. Update ReportsClient.tsx to always fetch cable connections and enable them in report options
const repPath = path.join(__dirname, "../src/app/reports/ReportsClient.tsx");
let repContent = fs.readFileSync(repPath, "utf8");

repContent = repContent.replace(
  `const [peOptCables, setPeOptCables] = useState(false);`,
  `const [peOptCables, setPeOptCables] = useState(true);`
);

// Always fetch cableConnections in ReportsClient
repContent = repContent.replace(
  `if (peOptCables || peOptKabelzugliste || peOptFreeLines) {`,
  `if (true) {`
);

fs.writeFileSync(repPath, repContent, "utf8");
console.log("Updated ReportsClient.tsx to always fetch cables!");

// 3. Update PlanElementsPdf.tsx to ensure cables on plan overview are always rendered when present
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

pdfContent = pdfContent.replace(
  `{options.includeCables !== false && (plan.cableConnections || []).map((c: any, cIdx: number) => {`,
  `{options.includeCables !== false && (plan.cableConnections || []).length > 0 && plan.cableConnections.map((c: any, cIdx: number) => {`
);

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("Updated PlanElementsPdf.tsx!");
