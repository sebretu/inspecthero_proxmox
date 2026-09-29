const fs = require("fs");
const path = require("path");

const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaPath, "utf8");

// 1. Add handleDeviceClick callback
const handleDeviceClickDef = `
  // Unified handler for clicking any device/symbol on the map (Point symbols, GeraetBox, LedStripe, etc.)
  const handleDeviceClick = useCallback(
    (s: BmaSymbolRow, e?: any) => {
      if (e?.originalEvent) e.originalEvent.stopPropagation();

      // If Cable Connect tool is active: clicking symbol handles start / target selection
      if (activeTool === "cable_connect") {
        if (!drawingCableStartSymbol) {
          setDrawingCableStartSymbol(s);
          return;
        } else if (drawingCableStartSymbol.id !== s.id) {
          // Finish connection!
          const pts = [
            { x_norm: drawingCableStartSymbol.x_norm, y_norm: drawingCableStartSymbol.y_norm },
            ...drawingCableWaypoints,
            { x_norm: s.x_norm, y_norm: s.y_norm },
          ];
          const len = calculatePathLengthMeters(pts);
          setCableModalSource({ id: drawingCableStartSymbol.id, label: drawingCableStartSymbol.label || "Gerät A", plan_id: planId });
          setCableModalTarget({ id: s.id, label: s.label || "Gerät B", plan_id: planId });
          setCableModalWaypoints(drawingCableWaypoints);
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
    [activeTool, drawingCableStartSymbol, drawingCableWaypoints, calculatePathLengthMeters, planId, cableConnections.length, activeSymbolType]
  );
`;

if (!content.includes("const handleDeviceClick = useCallback")) {
  content = content.replace(
    "const handleFinishFreeLine = () => {",
    handleDeviceClickDef + "\n  const handleFinishFreeLine = () => {"
  );
}

// 2. Update renderGeraetBox Polygon and Center Marker to use handleDeviceClick
content = content.replace(
  `            eventHandlers={{
              click: (e: any) => {
                if (activeSymbolType) return;
                if (e?.originalEvent) e.originalEvent.stopPropagation();
                setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
              },
            }}
          />
          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}
            icon={L.divIcon({`,
  `            eventHandlers={{
              click: (e: any) => handleDeviceClick(s, e),
            }}
          />
          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}
            icon={L.divIcon({`
);

content = content.replace(
  `            eventHandlers={{
              click: (e: any) => {
                if (activeSymbolType) return;
                if (e?.originalEvent) e.originalEvent.stopPropagation();
                setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
              },
            }}
          >
            {openTooltipId === s.id && !activeSymbolType && (`,
  `            eventHandlers={{
              click: (e: any) => handleDeviceClick(s, e),
            }}
          >
            {openTooltipId === s.id && !activeSymbolType && !activeTool && (`
);

// 3. Update main symbol MarkerAny to use handleDeviceClick
content = content.replace(
  `            eventHandlers={{
              dragend: (e: any) => handleDragEnd(s.id, e),
              click: (e: any) => {
                if (activeSymbolType) return;
                if (e?.originalEvent) e.originalEvent.stopPropagation();
                setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
              },
            }}`,
  `            eventHandlers={{
              dragend: (e: any) => handleDragEnd(s.id, e),
              click: (e: any) => handleDeviceClick(s, e),
            }}`
);

// 4. Update renderLedStripe to use handleDeviceClick
content = content.replace(
  `            eventHandlers={{
              click: (e: any) => {
                if (activeSymbolType) return;
                if (e?.originalEvent) e.originalEvent.stopPropagation();
                setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
              },
            }}
          />
          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}`,
  `            eventHandlers={{
              click: (e: any) => handleDeviceClick(s, e),
            }}
          />
          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}`
);

// 5. Add visual green glow ring around drawingCableStartSymbol
const startDeviceGlowRing = `
      {/* 🌟 Glowing ring on selected start device during cable connection */}
      {activeTool === "cable_connect" && drawingCableStartSymbol && (
        <MarkerAny
          position={normCoordsToLatLng(drawingCableStartSymbol.x_norm, drawingCableStartSymbol.y_norm)}
          interactive={false}
          icon={L.divIcon({
            className: "start-device-pulse-ring",
            html: \`
              <div style="
                width: 50px;
                height: 50px;
                border: 3px solid #22c55e;
                border-radius: 50%;
                background: rgba(34, 197, 94, 0.25);
                box-shadow: 0 0 16px #22c55e;
                animation: pulse 1.2s infinite;
                transform: translate(-50%, -50%);
                pointer-events: none;
              "></div>
            \`,
            iconSize: [0, 0],
          })}
        />
      )}
`;

if (!content.includes("Glowing ring on selected start device")) {
  content = content.replace(
    "{/* Live Active Cable Drawing Polyline & Rubber Line */}",
    startDeviceGlowRing + "\n      {/* Live Active Cable Drawing Polyline & Rubber Line */}"
  );
}

fs.writeFileSync(bmaPath, content, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with handleDeviceClick and start device pulse glow!");
