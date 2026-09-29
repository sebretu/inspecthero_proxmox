const fs = require("fs");
const path = require("path");

console.log("Starting integration of thin WP Innengerät icon and Leaflet Cable Rendering...");

// 1. Create elegant thin-lined warmepumpe_innen.svg matching warmepumpe_aussen
const innenSvgPath = path.join(__dirname, "../public/symbols/bma/warmepumpe_innen.svg");
const bmaDataPath = path.join(__dirname, "../src/lib/bmaSymbolsData.ts");

const thinInnenSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Clean white background and thin casing -->
  <rect x="5" y="5" width="90" height="90" rx="1.5" ry="1.5" fill="#ffffff" stroke="#1e293b" stroke-width="1.8" />
  
  <!-- Thin top header divider line -->
  <line x1="5" y1="20" x2="95" y2="20" stroke="#1e293b" stroke-width="1.8" />

  <!-- Concentric circle ventilator housing -->
  <circle cx="50" cy="58" r="29" fill="#ffffff" stroke="#334155" stroke-width="1.2" />
  <circle cx="50" cy="58" r="26.5" fill="#ffffff" stroke="#64748b" stroke-width="0.8" />

  <!-- 6-blade centrifugal fan turbine with matching elegant thin styling -->
  <g transform="translate(50, 58)">
    <!-- Blade 1 -->
    <path d="M 0 0 C 3 -6, 10 -13, 18 -15 C 22 -11, 21 -4, 15 2 C 9 3, 3 2, 0 0 Z" fill="#1e293b" />
    <!-- Blade 2 -->
    <path d="M 0 0 C 3 -6, 10 -13, 18 -15 C 22 -11, 21 -4, 15 2 C 9 3, 3 2, 0 0 Z" fill="#1e293b" transform="rotate(60)" />
    <!-- Blade 3 -->
    <path d="M 0 0 C 3 -6, 10 -13, 18 -15 C 22 -11, 21 -4, 15 2 C 9 3, 3 2, 0 0 Z" fill="#1e293b" transform="rotate(120)" />
    <!-- Blade 4 -->
    <path d="M 0 0 C 3 -6, 10 -13, 18 -15 C 22 -11, 21 -4, 15 2 C 9 3, 3 2, 0 0 Z" fill="#1e293b" transform="rotate(180)" />
    <!-- Blade 5 -->
    <path d="M 0 0 C 3 -6, 10 -13, 18 -15 C 22 -11, 21 -4, 15 2 C 9 3, 3 2, 0 0 Z" fill="#1e293b" transform="rotate(240)" />
    <!-- Blade 6 -->
    <path d="M 0 0 C 3 -6, 10 -13, 18 -15 C 22 -11, 21 -4, 15 2 C 9 3, 3 2, 0 0 Z" fill="#1e293b" transform="rotate(300)" />
    <!-- Center hub dot -->
    <circle cx="0" cy="0" r="2.5" fill="#1e293b" />
  </g>
</svg>`;

fs.writeFileSync(innenSvgPath, thinInnenSvg, "utf8");
console.log("Updated warmepumpe_innen.svg with thin elegant stroke styling!");

// Update base64 in bmaSymbolsData.ts
let bmaData = fs.readFileSync(bmaDataPath, "utf8");
const newInnenDataUri = "data:image/svg+xml;base64," + Buffer.from(thinInnenSvg).toString("base64");
bmaData = bmaData.replace(/warmepumpe_innen:\s*"[^"]+",/, `warmepumpe_innen: "${newInnenDataUri}",`);
fs.writeFileSync(bmaDataPath, bmaData, "utf8");
console.log("Updated bmaSymbolsData.ts with thin warmepumpe_innen!");

// 2. Update PlanBmaSymbolsModule.tsx
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaModPath, "utf8");

// Add handleToggleTool
if (!content.includes("const handleToggleTool =")) {
  content = content.replace(
    "const resetAllToolsAndDrawing = useCallback(() => {",
    `const resetAllToolsAndDrawing = useCallback(() => {
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

  const handleToggleTool = useCallback((tool: "cable_connect" | "free_line") => {
    setActiveSymbolType(null);
    setDrawingKabelbahnPoints([]);
    setDrawingLedStripeStart(null);
    setDrawingGeraetBoxStart(null);
    setHoverLatLng(null);
    setActiveTool((prev) => {
      if (prev === tool) {
        setDrawingCableStartSymbol(null);
        setDrawingCableWaypoints([]);
        setDrawingFreeLinePoints([]);
        return null;
      } else {
        setDrawingCableStartSymbol(null);
        setDrawingCableWaypoints([]);
        setDrawingFreeLinePoints([]);
        return tool;
      }
    });
  }, []);`
  );
}

// Update quick toolbar buttons to use handleToggleTool
content = content.replace(
  `onClick={() => setActiveTool((prev) => (prev === "cable_connect" ? null : "cable_connect"))}`,
  `onClick={() => handleToggleTool("cable_connect")}`
);
content = content.replace(
  `onClick={() => setActiveTool((prev) => (prev === "free_line" ? null : "free_line"))}`,
  `onClick={() => handleToggleTool("free_line")}`
);

// Add Live Cable / Free Line and Saved Cable vector rendering into map render tree
const cableMapRendering = `
      {/* ── LIVE PREVIEW: CABLE CONNECTION (Start -> Waypoints -> Mouse Hover) ── */}
      {activeTool === "cable_connect" && drawingCableStartSymbol && (() => {
        const startPt = normCoordsToLatLng(drawingCableStartSymbol.x_norm, drawingCableStartSymbol.y_norm);
        const waypointPts = drawingCableWaypoints.map(p => normCoordsToLatLng(p.x_norm, p.y_norm));
        const pts = [startPt, ...waypointPts];
        if (hoverLatLng) {
          pts.push(hoverLatLng);
        }
        return (
          <>
            {/* Green start device glow ring */}
            <CircleMarkerAny
              center={startPt}
              radius={24}
              pathOptions={{
                color: "#22c55e",
                fillColor: "#22c55e",
                fillOpacity: 0.3,
                weight: 3,
                dashArray: "4, 4",
              }}
            />
            {/* Live outer glow */}
            <PolylineAny
              positions={pts}
              pathOptions={{ color: "#38bdf8", weight: 7, opacity: 0.45 }}
            />
            {/* Live inner line */}
            <PolylineAny
              positions={pts}
              pathOptions={{ color: "#0284c7", weight: 3.5, dashArray: "6, 6" }}
            />
            {/* Dots on waypoints */}
            {drawingCableWaypoints.map((p, idx) => (
              <CircleMarkerAny
                key={\`wp-dot-\${idx}\`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                pathOptions={{ color: "#0284c7", fillColor: "#ffffff", fillOpacity: 1, weight: 2.5 }}
              />
            ))}
          </>
        );
      })()}

      {/* ── LIVE PREVIEW: FREE LINE (Points -> Mouse Hover) ── */}
      {activeTool === "free_line" && drawingFreeLinePoints.length > 0 && (() => {
        const pts = drawingFreeLinePoints.map(p => normCoordsToLatLng(p.x_norm, p.y_norm));
        if (hoverLatLng) pts.push(hoverLatLng);
        return (
          <>
            <PolylineAny
              positions={pts}
              pathOptions={{ color: "#10b981", weight: 6, opacity: 0.4 }}
            />
            <PolylineAny
              positions={pts}
              pathOptions={{ color: "#059669", weight: 3.5, dashArray: "4, 4" }}
            />
            {drawingFreeLinePoints.map((p, idx) => (
              <CircleMarkerAny
                key={\`fl-dot-\${idx}\`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                pathOptions={{ color: "#059669", fillColor: "#ffffff", fillOpacity: 1, weight: 2.5 }}
              />
            ))}
          </>
        );
      })()}

      {/* ── SAVED CABLE CONNECTIONS & FREE LINES LAYER ── */}
      {layersVisibility?.cables !== false && cableConnections.map((conn) => {
        let routePts: any[] = [];
        if (conn.is_free_line || conn.type === 'FREE_LINE') {
          if (conn.waypoints && conn.waypoints.length >= 2) {
            routePts = conn.waypoints.map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));
          }
        } else {
          const s1 = symbols.find(s => s.id === conn.source_symbol_id);
          const s2 = symbols.find(s => s.id === conn.target_symbol_id);
          if (s1 && s2) {
            const startPt = normCoordsToLatLng(s1.x_norm, s1.y_norm);
            const endPt = normCoordsToLatLng(s2.x_norm, s2.y_norm);
            const wpts = (conn.waypoints || []).map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));
            routePts = [startPt, ...wpts, endPt];
          } else if (conn.waypoints && conn.waypoints.length >= 2) {
            routePts = conn.waypoints.map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));
          }
        }
        if (routePts.length < 2) return null;

        const midIdx = Math.floor(routePts.length / 2);
        const labelPos = routePts[midIdx] || routePts[0];
        const lineColor = conn.color || "#0284c7";

        return (
          <React.Fragment key={\`conn-\${conn.id}\`}>
            {/* Broad clickable buffer */}
            <PolylineAny
              positions={routePts}
              pathOptions={{ color: "transparent", weight: 22, opacity: 0.001 }}
              interactive={true}
              eventHandlers={{
                click: (e: any) => {
                  if (e?.originalEvent) e.originalEvent.stopPropagation();
                  setOpenTooltipId((prev) => (prev === conn.id ? null : conn.id));
                }
              }}
            >
              {openTooltipId === conn.id && (
                <TooltipAny permanent direction="top" opacity={1}>
                  <div style={{ padding: 6, minWidth: 160 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#0284c7" }}>
                      🔌 {conn.cable_number || "Kabel"}
                    </div>
                    {conn.cable_type && (
                      <div style={{ fontSize: 11, color: "#334155" }}>
                        Typ: <b>{conn.cable_type}</b>
                      </div>
                    )}
                    {conn.length_meters && (
                      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                        Länge: <b>{conn.length_meters} m</b>
                      </div>
                    )}
                    {conn.description && (
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {conn.description}
                      </div>
                    )}
                    {isAdminOrMod && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditCableConnection(conn);
                          }}
                          style={{ background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          ✏️ Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCableConnection(conn.id);
                          }}
                          style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          🗑️ Löschen
                        </button>
                      </div>
                    )}
                  </div>
                </TooltipAny>
              )}
            </PolylineAny>

            {/* Visible Cable Polyline */}
            <PolylineAny
              positions={routePts}
              pathOptions={{ color: lineColor, weight: 3.5, opacity: 0.95 }}
            />

            {/* Center Cable Label Badge */}
            <MarkerAny
              position={labelPos}
              icon={L.divIcon({
                className: "cable-badge",
                html: \`<div style="background:#0f172a;color:#ffffff;border:1px solid #38bdf8;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);">\${conn.cable_number || 'Kabel'}\${conn.length_meters ? ' (' + conn.length_meters + 'm)' : ''}</div>\`,
                iconSize: [60, 18],
                iconAnchor: [30, 9],
              })}
            />
          </React.Fragment>
        );
      })}
`;

// Insert cableMapRendering right before "Render all BMA / Notlicht / Kabelbahn"
if (!content.includes("LIVE PREVIEW: CABLE CONNECTION")) {
  content = content.replace(
    "{/* Render all BMA / Notlicht / Kabelbahn / LED Stripe symbols on map */}",
    cableMapRendering + "\n      {/* Render all BMA / Notlicht / Kabelbahn / LED Stripe symbols on map */}"
  );
}

fs.writeFileSync(bmaModPath, content, "utf8");
console.log("Successfully integrated live polyline and saved cable map rendering into PlanBmaSymbolsModule.tsx!");
