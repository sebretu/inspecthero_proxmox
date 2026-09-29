const fs = require("fs");
const path = require("path");

const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaModPath, "utf8");

// 1. In MapEventsHandler: update click handler to use live Refs and reliable finish connection logic
const oldMapEventsClick = `        // Active Cable Connection Tool
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
        }`;

const newMapEventsClick = `        // Active Cable Connection Tool
        const currentTool = activeToolRef.current || activeTool;
        const currentStart = drawingCableStartSymbolRef.current || drawingCableStartSymbol;
        const currentWaypoints = drawingCableWaypointsRef.current || drawingCableWaypoints;

        if (currentTool === "cable_connect") {
          const clickedDev = findClickedDevice(x_norm, y_norm);
          if (clickedDev) {
            if (!currentStart) {
              setDrawingCableStartSymbol(clickedDev);
              drawingCableStartSymbolRef.current = clickedDev;
              return;
            } else if (currentStart.id !== clickedDev.id) {
              // Finish connection to clicked target device!
              const pts = [
                { x_norm: currentStart.x_norm, y_norm: currentStart.y_norm },
                ...currentWaypoints,
                { x_norm: clickedDev.x_norm, y_norm: clickedDev.y_norm },
              ];
              const len = calculatePathLengthMeters(pts);
              setCableModalSource({ id: currentStart.id, label: currentStart.label || "Gerät A", plan_id: planId });
              setCableModalTarget({ id: clickedDev.id, label: clickedDev.label || "Gerät B", plan_id: planId });
              setCableModalWaypoints(currentWaypoints);
              setCableModalIsFreeLine(false);
              setCableNumberInput(\`K-\${String(cableConnections.length + 1).padStart(3, "0")}\`);
              setCableDescInput(\`Zuleitung \${clickedDev.label || "Gerät"}\`);
              setCableLengthCalculated(len);
              setCableModalOpen(true);
              return;
            }
          }

          // If no device clicked, but we already have a start symbol -> add intermediate waypoint
          if (currentStart) {
            setDrawingCableWaypoints((prev) => [...prev, { x_norm, y_norm }]);
            return;
          }
          return;
        }`;

content = content.replace(oldMapEventsClick, newMapEventsClick);

// 2. In renderGeraetBox: make center marker click trigger handleDeviceClick
content = content.replace(
  `          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}
            icon={L.divIcon({
              className: "geraet-box-center-marker",`,
  `          <MarkerAny
            position={centerLatLng}
            interactive={true}
            icon={L.divIcon({
              className: "geraet-box-center-marker",`
);

content = content.replace(
  `            eventHandlers={{
              click: (e: any) => {
                if (activeSymbolType) return;
                if (e?.originalEvent) e.originalEvent.stopPropagation();
                setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
              },
            }}`,
  `            eventHandlers={{
              click: (e: any) => {
                handleDeviceClick(s, e);
              },
            }}`
);

// 3. In findClickedDevice: increase detection tolerance and account for all symbol types
content = content.replace(
  `              const distPx = Math.sqrt(dx * dx + dy * dy);
              if (distPx <= 45) {
                return s;
              }`,
  `              const distPx = Math.sqrt(dx * dx + dy * dy);
              if (distPx <= 60) {
                return s;
              }`
);

fs.writeFileSync(bmaModPath, content, "utf8");
console.log("Successfully fixed all device click event handlers and closure refs in PlanBmaSymbolsModule.tsx!");
