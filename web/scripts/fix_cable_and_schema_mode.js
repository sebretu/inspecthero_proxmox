const fs = require("fs");
const path = require("path");

console.log("Updating PlanMap.tsx and PlanBmaSymbolsModule.tsx for foolproof Cable Connect & White Schema Mode...");

// 1. Update PlanMap.tsx
const planMapPath = path.join(__dirname, "../src/components/PlanMap.tsx");
let planMapContent = fs.readFileSync(planMapPath, "utf8");

if (!planMapContent.includes("const [isWhiteSchemaMode, setIsWhiteSchemaMode] = useState(false);")) {
  planMapContent = planMapContent.replace(
    "const [cableCount, setCableCount] = useState(0);",
    "const [cableCount, setCableCount] = useState(0);\n  const [isWhiteSchemaMode, setIsWhiteSchemaMode] = useState(false);"
  );
}

planMapContent = planMapContent.replace(
  `        {token && (
          <TileLayer 
            url={getApiUrl(\`/api/tiles/\${planId}/{z}/{x}/{y}.png?token=\${token}&v=\${(meta as any)?.activeVersionId || ''}\`)} 
            {...({ maxNativeZoom: meta.maxZoom } as any)}
          />
        )}`,
  `        {token && !isWhiteSchemaMode && (
          <TileLayer 
            url={getApiUrl(\`/api/tiles/\${planId}/{z}/{x}/{y}.png?token=\${token}&v=\${(meta as any)?.activeVersionId || ''}\`)} 
            {...({ maxNativeZoom: meta.maxZoom } as any)}
          />
        )}`
);

planMapContent = planMapContent.replace(
  `        <PlanBmaSymbolsModule
          planId={planId}
          meta={meta}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          layersVisibility={layersVisibility}
          onEnsureLayerVisible={(key) => ensureLayerVisible(key)}
          onCountsChange={handleBmaCounts}
          projectId={projectId || undefined}
        />`,
  `        <PlanBmaSymbolsModule
          planId={planId}
          meta={meta}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          layersVisibility={layersVisibility}
          onEnsureLayerVisible={(key) => ensureLayerVisible(key)}
          onCountsChange={handleBmaCounts}
          projectId={projectId || undefined}
          isWhiteSchemaMode={isWhiteSchemaMode}
          onToggleWhiteSchemaMode={() => setIsWhiteSchemaMode((prev) => !prev)}
        />`
);

fs.writeFileSync(planMapPath, planMapContent, "utf8");
console.log("Updated PlanMap.tsx with isWhiteSchemaMode and TileLayer control!");

// 2. Update PlanBmaSymbolsModule.tsx
const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaPath, "utf8");

// Update Props definition for isWhiteSchemaMode and onToggleWhiteSchemaMode
bmaContent = bmaContent.replace(
  `  onEnsureLayerVisible,
  onCountsChange,
  projectId,
}: {
  planId: string;
  meta: Meta;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  layersVisibility?: any;
  onEnsureLayerVisible?: (layerKey: any) => void;
  onCountsChange?: (counts: any) => void;
  projectId?: string;
}) {`,
  `  onEnsureLayerVisible,
  onCountsChange,
  projectId,
  isWhiteSchemaMode: isWhiteSchemaModeProp,
  onToggleWhiteSchemaMode,
}: {
  planId: string;
  meta: Meta;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  layersVisibility?: any;
  onEnsureLayerVisible?: (layerKey: any) => void;
  onCountsChange?: (counts: any) => void;
  projectId?: string;
  isWhiteSchemaMode?: boolean;
  onToggleWhiteSchemaMode?: () => void;
}) {`
);

// Synchronize isWhiteSchemaMode with prop if provided
bmaContent = bmaContent.replace(
  "const [isWhiteSchemaMode, setIsWhiteSchemaMode] = useState(false);",
  "const [isWhiteSchemaModeInternal, setIsWhiteSchemaModeInternal] = useState(false);\n  const isWhiteSchemaMode = typeof isWhiteSchemaModeProp === 'boolean' ? isWhiteSchemaModeProp : isWhiteSchemaModeInternal;\n  const toggleWhiteSchemaMode = onToggleWhiteSchemaMode || (() => setIsWhiteSchemaModeInternal((p) => !p));"
);

bmaContent = bmaContent.replace(
  `onClick={() => setIsWhiteSchemaMode((prev) => !prev)}`,
  `onClick={toggleWhiteSchemaMode}`
);

// Add geometric device finder in MapClickHandler
const geometricDeviceFinder = `
        // Geometric Device Finder: detects if click occurred on or near any device (within 40px radius or inside box)
        const findClickedDevice = (clickX: number, clickY: number) => {
          for (const s of symbols) {
            if (!isSymbolTypeVisible(s.symbol_type)) continue;

            if (s.symbol_type === "geraet_box" || s.symbol_type === "led_stripe") {
              let w_norm = 0.06;
              let h_norm = 0.035;
              try {
                const parsed = JSON.parse(s.description || "{}");
                if (typeof parsed.w_norm === "number") w_norm = parsed.w_norm;
                if (typeof parsed.h_norm === "number") h_norm = parsed.h_norm;
              } catch {}
              if (
                clickX >= s.x_norm - 0.02 &&
                clickX <= s.x_norm + w_norm + 0.02 &&
                clickY >= s.y_norm - 0.02 &&
                clickY <= s.y_norm + h_norm + 0.02
              ) {
                return s;
              }
            } else {
              const dx = (s.x_norm - clickX) * worldPxW;
              const dy = (s.y_norm - clickY) * worldPxH;
              const distPx = Math.sqrt(dx * dx + dy * dy);
              if (distPx <= 45) {
                return s;
              }
            }
          }
          return null;
        };

        // Active Cable Connection Tool
        if (activeTool === "cable_connect") {
          const clickedDev = findClickedDevice(x_norm, y_norm);
          if (clickedDev) {
            if (!drawingCableStartSymbol) {
              setDrawingCableStartSymbol(clickedDev);
              return;
            } else if (drawingCableStartSymbol.id !== clickedDev.id) {
              // Finish connection to clicked target device!
              const pts = [
                { x_norm: drawingCableStartSymbol.x_norm, y_norm: drawingCableStartSymbol.y_norm },
                ...drawingCableWaypoints,
                { x_norm: clickedDev.x_norm, y_norm: clickedDev.y_norm },
              ];
              const len = calculatePathLengthMeters(pts);
              setCableModalSource({ id: drawingCableStartSymbol.id, label: drawingCableStartSymbol.label || "Gerät A", plan_id: planId });
              setCableModalTarget({ id: clickedDev.id, label: clickedDev.label || "Gerät B", plan_id: planId });
              setCableModalWaypoints(drawingCableWaypoints);
              setCableModalIsFreeLine(false);
              setCableNumberInput(\`K-\${String(cableConnections.length + 1).padStart(3, "0")}\`);
              setCableDescInput(\`Zuleitung \${clickedDev.label || "Gerät"}\`);
              setCableLengthCalculated(len);
              setCableModalOpen(true);
              return;
            }
          }

          // If no device clicked, but we already have a start symbol -> add intermediate waypoint
          if (drawingCableStartSymbol) {
            setDrawingCableWaypoints((prev) => [...prev, { x_norm, y_norm }]);
            return;
          }
          return;
        }
`;

// Replace activeTool === "cable_connect" block in MapClickHandler
bmaContent = bmaContent.replace(
  `        // Active Cable Connection: click on map adds waypoint
        if (activeTool === "cable_connect") {
          if (drawingCableStartSymbol) {
            setDrawingCableWaypoints((prev) => [...prev, { x_norm, y_norm }]);
            return;
          }
        }`,
  geometricDeviceFinder
);

fs.writeFileSync(bmaPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with Geometric Device Snapping & White Schema sync!");
