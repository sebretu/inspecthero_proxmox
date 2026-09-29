const fs = require("fs");
const path = require("path");

const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaModPath, "utf8");

// 1. Make all live preview polylines and markers NON-INTERACTIVE so they don't block clicking devices underneath
content = content.replace(
  `{/* ── LIVE PREVIEW: CABLE CONNECTION (Start -> Waypoints -> Mouse Hover) ── */}
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
      })()}`,
  `{/* ── LIVE PREVIEW: CABLE CONNECTION (Start -> Waypoints -> Mouse Hover) ── */}
      {activeTool === "cable_connect" && drawingCableStartSymbol && (() => {
        const startPt = normCoordsToLatLng(drawingCableStartSymbol.x_norm, drawingCableStartSymbol.y_norm);
        const waypointPts = drawingCableWaypoints.map(p => normCoordsToLatLng(p.x_norm, p.y_norm));
        const pts = [startPt, ...waypointPts];
        if (hoverLatLng) {
          pts.push(hoverLatLng);
        }
        return (
          <>
            {/* Green start device glow ring - strictly non-interactive */}
            <CircleMarkerAny
              center={startPt}
              radius={24}
              interactive={false}
              pathOptions={{
                color: "#22c55e",
                fillColor: "#22c55e",
                fillOpacity: 0.3,
                weight: 3,
                dashArray: "4, 4",
              }}
            />
            {/* Live outer glow - strictly non-interactive so clicks hit devices underneath */}
            <PolylineAny
              positions={pts}
              interactive={false}
              pathOptions={{ color: "#38bdf8", weight: 7, opacity: 0.45 }}
            />
            {/* Live inner line - strictly non-interactive */}
            <PolylineAny
              positions={pts}
              interactive={false}
              pathOptions={{ color: "#0284c7", weight: 3.5, dashArray: "6, 6" }}
            />
            {/* Dots on waypoints - strictly non-interactive */}
            {drawingCableWaypoints.map((p, idx) => (
              <CircleMarkerAny
                key={\`wp-dot-\${idx}\`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                interactive={false}
                pathOptions={{ color: "#0284c7", fillColor: "#ffffff", fillOpacity: 1, weight: 2.5 }}
              />
            ))}
          </>
        );
      })()}`
);

// 2. Free line preview - strictly non-interactive
content = content.replace(
  `{/* ── LIVE PREVIEW: FREE LINE (Points -> Mouse Hover) ── */}
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
      })()}`,
  `{/* ── LIVE PREVIEW: FREE LINE (Points -> Mouse Hover) ── */}
      {activeTool === "free_line" && drawingFreeLinePoints.length > 0 && (() => {
        const pts = drawingFreeLinePoints.map(p => normCoordsToLatLng(p.x_norm, p.y_norm));
        if (hoverLatLng) pts.push(hoverLatLng);
        return (
          <>
            <PolylineAny
              positions={pts}
              interactive={false}
              pathOptions={{ color: "#10b981", weight: 6, opacity: 0.4 }}
            />
            <PolylineAny
              positions={pts}
              interactive={false}
              pathOptions={{ color: "#059669", weight: 3.5, dashArray: "4, 4" }}
            />
            {drawingFreeLinePoints.map((p, idx) => (
              <CircleMarkerAny
                key={\`fl-dot-\${idx}\`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                interactive={false}
                pathOptions={{ color: "#059669", fillColor: "#ffffff", fillOpacity: 1, weight: 2.5 }}
              />
            ))}
          </>
        );
      })()}`
);

// 3. Add Cable Connection Modal Dialog JSX Portal to the return statement
const cableModalJsx = `
      {/* ── CABLE CONNECTION & FREE LINE FORM MODAL ── */}
      {cableModalOpen && typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className={styles.paletteModal}
            style={{ zIndex: 99999 }}
            onClick={() => {
              setCableModalOpen(false);
              setEditingConnection(null);
            }}
          >
            <div
              className={styles.paletteCard}
              style={{
                maxWidth: 440,
                width: "90%",
                background: "#0f172a",
                border: "2px solid #0284c7",
                borderRadius: 14,
                padding: 20,
                boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                color: "#f8fafc",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{cableModalIsFreeLine ? "〰 Freie Leitung" : "🔌 Kabelverbindung"}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setCableModalOpen(false);
                    setEditingConnection(null);
                  }}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>

              {!cableModalIsFreeLine && cableModalSource && cableModalTarget && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginBottom: 14, background: "rgba(255,255,255,0.06)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Start (Gerät A):</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8" }}>{cableModalSource.label}</div>
                  </div>
                  <div style={{ fontSize: 16, color: "#94a3b8" }}>➔</div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Ziel (Gerät B):</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#4ade80" }}>{cableModalTarget.label}</div>
                  </div>
                </div>
              )}

              {/* Cable Type Select & Input */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: 4 }}>
                  🔌 Kabeltyp / Querschnitt:
                </label>
                <select
                  value={cableTypeInput}
                  onChange={(e) => setCableTypeInput(e.target.value)}
                  style={{ width: "100%", background: "#1e293b", color: "#f8fafc", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "1px solid #334155", marginBottom: 6 }}
                >
                  {CABLE_TYPES_CATALOG.map((ct) => (
                    <option key={ct} value={ct}>{ct}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={cableTypeInput}
                  onChange={(e) => setCableTypeInput(e.target.value)}
                  placeholder="oder eigener Kabeltyp..."
                  style={{ width: "100%", background: "#1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: 6, fontSize: 12, border: "1px solid #334155" }}
                />
              </div>

              {/* Cable Number */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: 4 }}>
                  🏷️ Kabel-Nummer:
                </label>
                <input
                  type="text"
                  value={cableNumberInput}
                  onChange={(e) => setCableNumberInput(e.target.value)}
                  placeholder="z.B. K-001"
                  style={{ width: "100%", background: "#1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: 6, fontSize: 12, border: "1px solid #334155" }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: 4 }}>
                  📝 Zweck / Beschreibung:
                </label>
                <input
                  type="text"
                  value={cableDescInput}
                  onChange={(e) => setCableDescInput(e.target.value)}
                  placeholder="z.B. Zuleitung Wärmepumpe / Steuerung"
                  style={{ width: "100%", background: "#1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: 6, fontSize: 12, border: "1px solid #334155" }}
                />
              </div>

              {/* Length */}
              <div style={{ marginBottom: 16, fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 6 }}>
                <span>Gemessene Trassenlänge:</span>
                <span style={{ color: "#38bdf8", fontWeight: 800, fontSize: 13 }}>
                  {cableLengthCalculated ? \`\${cableLengthCalculated} m\` : "nicht kalibriert"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setCableModalOpen(false);
                    setEditingConnection(null);
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#f8fafc",
                    padding: "9px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleSaveCableConnection}
                  style={{
                    flex: 1.5,
                    background: "#0284c7",
                    border: "none",
                    borderRadius: 8,
                    color: "#ffffff",
                    padding: "9px 12px",
                    fontWeight: 800,
                    cursor: "pointer",
                    fontSize: 12,
                    boxShadow: "0 4px 12px rgba(2,132,199,0.4)",
                  }}
                >
                  💾 Kabel speichern
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
`;

// Inject before the final closing fragment of the component
if (!content.includes("CABLE CONNECTION & FREE LINE FORM MODAL")) {
  const lastIndex = content.lastIndexOf("</>");
  if (lastIndex !== -1) {
    content = content.slice(0, lastIndex) + cableModalJsx + "\n    </>";
  }
}

fs.writeFileSync(bmaModPath, content, "utf8");
console.log("Successfully injected Cable Connection Modal Dialog Portal and non-interactive live previews!");
