const fs = require("fs");
const path = require("path");

const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaModPath, "utf8");

// 1. Add Refs to solve React-Leaflet Marker event listener closure staleness
if (!content.includes("const drawingCableStartSymbolRef =")) {
  content = content.replace(
    "const [drawingCableStartSymbol, setDrawingCableStartSymbol] = useState<BmaSymbolRow | null>(null);",
    `const [drawingCableStartSymbol, setDrawingCableStartSymbol] = useState<BmaSymbolRow | null>(null);
  const drawingCableStartSymbolRef = useRef<BmaSymbolRow | null>(null);
  const drawingCableWaypointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);
  const activeToolRef = useRef<string | null>(null);

  useEffect(() => {
    drawingCableStartSymbolRef.current = drawingCableStartSymbol;
  }, [drawingCableStartSymbol]);

  useEffect(() => {
    drawingCableWaypointsRef.current = drawingCableWaypoints;
  }, [drawingCableWaypoints]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);`
  );
}

// 2. Update handleDeviceClick to use the live Refs
content = content.replace(
  `  const handleDeviceClick = useCallback(
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
  );`,
  `  const handleDeviceClick = useCallback(
    (s: BmaSymbolRow, e?: any) => {
      if (e?.originalEvent) e.originalEvent.stopPropagation();

      const currentTool = activeToolRef.current || activeTool;
      const currentStart = drawingCableStartSymbolRef.current || drawingCableStartSymbol;
      const currentWaypoints = drawingCableWaypointsRef.current || drawingCableWaypoints;

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
    [activeTool, drawingCableStartSymbol, drawingCableWaypoints, calculatePathLengthMeters, planId, cableConnections.length, activeSymbolType]
  );`
);

// 3. Add handleAddParallelCable function
if (!content.includes("const handleAddParallelCable =")) {
  content = content.replace(
    "const handleDeleteCableConnection = async (connId: string) => {",
    `const handleAddParallelCable = (existingConn: CableConnectionRow) => {
    const meta = existingConn.metadata || {};
    setEditingConnection(null);
    setCableModalSource(meta.source_symbol_id ? {
      id: meta.source_symbol_id,
      label: meta.source_device_label || "Gerät A",
      plan_id: meta.source_plan_id || planId
    } : null);
    setCableModalTarget(meta.target_symbol_id ? {
      id: meta.target_symbol_id,
      label: meta.target_device_label || "Gerät B",
      plan_id: meta.target_plan_id || planId
    } : null);
    setCableModalWaypoints(meta.waypoints || []);
    setCableModalIsFreeLine(!!meta.is_free_line);
    setCableNumberInput(\`K-\${String(cableConnections.length + 1).padStart(3, "0")}\`);
    setCableTypeInput("Steuerleitung");
    setCableDescInput(\`Paralleles Kabel zu \${existingConn.name || "Kabel"}\`);
    setCableLengthCalculated(meta.length_meters || 0);
    setCableModalOpen(true);
  };

  const handleDeleteCableConnection = async (connId: string) => {`
  );
}

// 4. Add "➕ Kabel parallel hinzufügen" button in cable tooltip on map
content = content.replace(
  `<button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCableConnection(conn.id);
                          }}
                          style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          🗑️ Löschen
                        </button>`,
  `<button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddParallelCable(conn);
                          }}
                          style={{ background: "#0ea5e9", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          ➕ Parallel-Kabel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCableConnection(conn.id);
                          }}
                          style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          🗑️ Löschen
                        </button>`
);

// 5. In Map rendering: calculate parallel offsets for multiple cables on the same path
const parallelCableMapLogic = `      {/* ── SAVED CABLE CONNECTIONS & FREE LINES LAYER (with parallel visual offsets) ── */}
      {layersVisibility?.cables !== false && (() => {
        // Group connections by device pair to calculate parallel spacing
        const groups: Record<string, CableConnectionRow[]> = {};
        cableConnections.forEach((c) => {
          const m = c.metadata || {};
          const k = m.is_free_line
            ? \`free_\${c.id}\`
            : [m.source_symbol_id || "a", m.target_symbol_id || "b"].sort().join("_");
          if (!groups[k]) groups[k] = [];
          groups[k].push(c);
        });

        const CABLE_COLORS = ["#0284c7", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

        return cableConnections.map((conn) => {
          const meta = conn.metadata || {};
          let routePts: any[] = [];
          if (meta.is_free_line || conn.type === "FREE_LINE") {
            if (meta.waypoints && meta.waypoints.length >= 2) {
              routePts = meta.waypoints.map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));
            }
          } else {
            const s1 = symbols.find((s) => s.id === meta.source_symbol_id);
            const s2 = symbols.find((s) => s.id === meta.target_symbol_id);
            if (s1 && s2) {
              const startPt = normCoordsToLatLng(s1.x_norm, s1.y_norm);
              const endPt = normCoordsToLatLng(s2.x_norm, s2.y_norm);
              const wpts = (meta.waypoints || []).map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));
              routePts = [startPt, ...wpts, endPt];
            } else if (meta.waypoints && meta.waypoints.length >= 2) {
              routePts = meta.waypoints.map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));
            }
          }
          if (routePts.length < 2) return null;

          const groupKey = meta.is_free_line
            ? \`free_\${conn.id}\`
            : [meta.source_symbol_id || "a", meta.target_symbol_id || "b"].sort().join("_");
          const group = groups[groupKey] || [conn];
          const cableIdx = group.findIndex((c) => c.id === conn.id);
          const totalInGroup = group.length;

          // Compute lateral parallel pixel offset if multiple cables exist on this path
          let displayPts = routePts;
          if (totalInGroup > 1 && meta.plan_id === planId) {
            const offsetDist = (cableIdx - (totalInGroup - 1) / 2) * 5; // 5px separation
            displayPts = routePts.map((pt, i, arr) => {
              if (arr.length < 2) return pt;
              const nextPt = arr[i + 1] || pt;
              const prevPt = arr[i - 1] || pt;
              const dLat = (nextPt.lat - prevPt.lat);
              const dLng = (nextPt.lng - prevPt.lng);
              const len = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
              // Normal vector
              const nLat = -dLng / len;
              const nLng = dLat / len;
              return L.latLng(pt.lat + nLat * offsetDist * 0.05, pt.lng + nLng * offsetDist * 0.05);
            });
          }

          const midIdx = Math.floor(displayPts.length / 2);
          const labelPos = displayPts[midIdx] || displayPts[0];
          const lineColor = conn.color || CABLE_COLORS[cableIdx % CABLE_COLORS.length] || "#0284c7";
          const cableNum = meta.cable_number || conn.name || "Kabel";
          const cableLen = meta.length_meters ? \`\${meta.length_meters} m\` : "";

          return (
            <React.Fragment key={\`conn-\${conn.id}\`}>
              {/* Broad clickable buffer */}
              <PolylineAny
                positions={displayPts}
                pathOptions={{ color: "transparent", weight: 22, opacity: 0.001 }}
                interactive={true}
                eventHandlers={{
                  click: (e: any) => {
                    if (e?.originalEvent) e.originalEvent.stopPropagation();
                    setOpenTooltipId((prev) => (prev === conn.id ? null : conn.id));
                  },
                }}
              >
                {openTooltipId === conn.id && (
                  <TooltipAny permanent direction="top" opacity={1}>
                    <div style={{ padding: 6, minWidth: 170 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: lineColor }}>
                        🔌 {cableNum} {totalInGroup > 1 ? \`(\${cableIdx + 1}/\${totalInGroup})\` : ""}
                      </div>
                      {meta.cable_type && (
                        <div style={{ fontSize: 11, color: "#334155" }}>
                          Typ: <b>{meta.cable_type}</b>
                        </div>
                      )}
                      {meta.length_meters && (
                        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                          Länge: <b>{cableLen}</b>
                        </div>
                      )}
                      {meta.description && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {meta.description}
                        </div>
                      )}
                      {isAdminOrMod && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddParallelCable(conn);
                            }}
                            style={{ background: "#0ea5e9", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            ➕ Parallel-Kabel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCableConnection(conn.id);
                            }}
                            style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
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
                positions={displayPts}
                pathOptions={{ color: lineColor, weight: 3.5, opacity: 0.95 }}
              />

              {/* Center Cable Label Badge */}
              <MarkerAny
                position={labelPos}
                icon={L.divIcon({
                  className: "cable-badge",
                  html: \`<div style="background:#0f172a;color:#ffffff;border:1px solid \${lineColor};padding:1px 5px;border-radius:4px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);">\${cableNum}\${cableLen ? ' (' + cableLen + ')' : ''}</div>\`,
                  iconSize: [60, 18],
                  iconAnchor: [30, 9],
                })}
              />
            </React.Fragment>
          );
        });
      })()}`;

content = content.replace(
  /\{\/\* ── SAVED CABLE CONNECTIONS & FREE LINES LAYER ── \*\/\}[\s\S]*?\{\/\* Render all BMA \/ Notlicht \/ Kabelbahn/,
  parallelCableMapLogic + "\n\n      {/* Render all BMA / Notlicht / Kabelbahn"
);

fs.writeFileSync(bmaModPath, content, "utf8");
console.log("Successfully added closure-safe device clicking and parallel cable routing support!");
