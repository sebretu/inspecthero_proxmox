const fs = require("fs");
const path = require("path");

const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaPath, "utf8");

// 1. Move calculatePathLengthMeters to the top right after isAdminOrMod
const calcFnAtTop = `
  const isAdminOrMod = useMemo(() => {
    const role = (currentUserRole || "").toUpperCase();
    return role === "ADMIN" || role === "MODERATOR";
  }, [currentUserRole]);

  // Calculate real meters along path using planScale or worldPx (Available everywhere in module)
  const calculatePathLengthMeters = useCallback(
    (pts: Array<{ x_norm: number; y_norm: number }>) => {
      if (pts.length < 2) return null;
      if (!planScale || planScale <= 0) return null;

      let totalPx = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = (p2.x_norm - p1.x_norm) * worldPxW;
        const dy = (p2.y_norm - p1.y_norm) * worldPxH;
        totalPx += Math.sqrt(dx * dx + dy * dy);
      }
      const meters = totalPx / planScale;
      return Math.round(meters * 10) / 10;
    },
    [planScale, worldPxW, worldPxH]
  );
`;

content = content.replace(
  `  const isAdminOrMod = useMemo(() => {
    const role = (currentUserRole || "").toUpperCase();
    return role === "ADMIN" || role === "MODERATOR";
  }, [currentUserRole]);`,
  calcFnAtTop
);

// 2. Comprehensive reset function
const resetAllToolsFn = `
  const resetAllToolsAndDrawing = useCallback(() => {
    setActiveSymbolType(null);
    setActiveTool(null);
    setDrawingCableStartSymbol(null);
    setDrawingCableWaypoints([]);
    setDrawingFreeLinePoints([]);
    setDrawingKabelbahnPoints([]);
    setDrawingLedStripeStart(null);
    setDrawingGeraetBoxStart(null);
    setHoverLatLng(null);
  }, []);
`;

if (!content.includes("resetAllToolsAndDrawing")) {
  content = content.replace(
    "const loadLampTypes = useCallback(async () => {",
    resetAllToolsFn + "\n  const loadLampTypes = useCallback(async () => {"
  );
}

// 3. Fix the Cancel Button in the Floating Banner to use resetAllToolsAndDrawing
content = content.replace(
  `            <button
              type="button"
              onClick={() => {
                setActiveSymbolType(null);
                setDrawingKabelbahnPoints([]);
                setDrawingLedStripeStart(null);
                setHoverLatLng(null);
              }}`,
  `            <button
              type="button"
              onClick={resetAllToolsAndDrawing}`
);

// Also fix ESC key handling
const escKeyHandler = `
  // Global ESC key to cancel any active drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetAllToolsAndDrawing();
      } else if (e.key === "Enter") {
        if (activeTool === "free_line" && drawingFreeLinePoints.length >= 2) {
          handleFinishFreeLine();
        } else if (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length >= 2) {
          handleFinishKabelbahn();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, activeSymbolType, drawingFreeLinePoints.length, drawingKabelbahnPoints.length, resetAllToolsAndDrawing]);
`;

if (!content.includes("Global ESC key to cancel any active drawing mode")) {
  content = content.replace(
    "// Unified handler for clicking any device/symbol on the map",
    escKeyHandler + "\n  // Unified handler for clicking any device/symbol on the map"
  );
}

fs.writeFileSync(bmaPath, content, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with calculatePathLengthMeters at top and resetAllToolsAndDrawing!");
