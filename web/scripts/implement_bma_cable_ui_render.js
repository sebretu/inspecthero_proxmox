const fs = require("fs");
const path = require("path");

const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaPath, "utf8");

// 1. Update MapClickHandler for Cable Connect & Free Line
const mapClickHandling = `
        // Active Cable Connection: click on map adds waypoint
        if (activeTool === "cable_connect") {
          if (drawingCableStartSymbol) {
            setDrawingCableWaypoints((prev) => [...prev, { x_norm, y_norm }]);
            return;
          }
        }

        // Active Free Line: click on map adds point
        if (activeTool === "free_line") {
          setDrawingFreeLinePoints((prev) => [...prev, { x_norm, y_norm }]);
          return;
        }
`;

if (!content.includes('if (activeTool === "cable_connect")')) {
  content = content.replace(
    '// If LED Stripe drawing mode is active: click 1 sets corner 1, click 2 finishes rectangle',
    mapClickHandling + '\n        // If LED Stripe drawing mode is active: click 1 sets corner 1, click 2 finishes rectangle'
  );
}

// 2. Add Finish Free Line function
const finishFreeLineCode = `
  const handleFinishFreeLine = () => {
    if (drawingFreeLinePoints.length < 2) {
      setActiveTool(null);
      setDrawingFreeLinePoints([]);
      return;
    }
    const len = calculatePathLengthMeters(drawingFreeLinePoints);
    setCableModalSource(null);
    setCableModalTarget(null);
    setCableModalWaypoints(drawingFreeLinePoints);
    setCableModalIsFreeLine(true);
    setCableNumberInput(\`L-\${String(cableConnections.filter(c => c.type === 'FREE_LINE').length + 1).padStart(3, "0")}\`);
    setCableDescInput("Freie Zuleitung");
    setCableLengthCalculated(len);
    setCableModalOpen(true);
  };
`;

if (!content.includes("handleFinishFreeLine")) {
  content = content.replace(
    "const handleSaveCableConnection = async () => {",
    finishFreeLineCode + "\n  const handleSaveCableConnection = async () => {"
  );
}

// 3. Add Cable Tools to QuickBar
const cableQuickBarButtons = `
      {/* 🔌 Cable Connections & Free Line Tools */}
      <button
        type="button"
        className={\`\${styles.quickBtn} \${activeTool === "cable_connect" ? styles.quickBtnActive : ""}\`}
        onClick={() => {
          if (activeTool === "cable_connect") {
            setActiveTool(null);
            setDrawingCableStartSymbol(null);
            setDrawingCableWaypoints([]);
            setHoverLatLng(null);
          } else {
            onEnsureLayerVisible?.("cables");
            setActiveSymbolType(null);
            setDrawingKabelbahnPoints([]);
            setDrawingLedStripeStart(null);
            setDrawingGeraetBoxStart(null);
            setActiveTool("cable_connect");
            setDrawingCableStartSymbol(null);
            setDrawingCableWaypoints([]);
            setHoverLatLng(null);
          }
        }}
        title="Geräte mit Kabel verbinden (Kabelverbindung)"
        style={activeTool === "cable_connect" ? { background: "#0284c7", color: "#ffffff", borderColor: "#38bdf8" } : { borderColor: "#0284c766", color: "#38bdf8" }}
      >
        <span>🔌</span>
        <span>{t("planBma", "quickCableConnect", "Kabel verbinden")}</span>
        {activeTool === "cable_connect" && <span style={{ fontSize: 10, marginLeft: 2 }}>●</span>}
      </button>

      <button
        type="button"
        className={\`\${styles.quickBtn} \${activeTool === "free_line" ? styles.quickBtnActive : ""}\`}
        onClick={() => {
          if (activeTool === "free_line") {
            setActiveTool(null);
            setDrawingFreeLinePoints([]);
            setHoverLatLng(null);
          } else {
            onEnsureLayerVisible?.("cables");
            setActiveSymbolType(null);
            setDrawingKabelbahnPoints([]);
            setDrawingLedStripeStart(null);
            setDrawingGeraetBoxStart(null);
            setActiveTool("free_line");
            setDrawingFreeLinePoints([]);
            setHoverLatLng(null);
          }
        }}
        title="Freie Leitung / Zuleitung zeichnen"
        style={activeTool === "free_line" ? { background: "#d97706", color: "#ffffff", borderColor: "#f59e0b" } : { borderColor: "#d9770666", color: "#fbbf24" }}
      >
        <span>〰</span>
        <span>{t("planBma", "quickFreeLine", "Freie Leitung")}</span>
        {activeTool === "free_line" && <span style={{ fontSize: 10, marginLeft: 2 }}>●</span>}
      </button>

      <button
        type="button"
        className={\`\${styles.quickBtn} \${isWhiteSchemaMode ? styles.quickBtnActive : ""}\`}
        onClick={() => setIsWhiteSchemaMode((prev) => !prev)}
        title="Zwischen Grundriss und weißem Schemaplan umschalten"
        style={isWhiteSchemaMode ? { background: "#ffffff", color: "#0f172a", borderColor: "#cbd5e1", fontWeight: 800 } : { borderColor: "#94a3b866", color: "#cbd5e1" }}
      >
        <span>{isWhiteSchemaMode ? "🗺️" : "⚪"}</span>
        <span>{isWhiteSchemaMode ? t("planBma", "floorplanMode", "Grundriss") : t("planBma", "schemaMode", "Weißes Schema")}</span>
      </button>
`;

if (!content.includes('title="Geräte mit Kabel verbinden (Kabelverbindung)"')) {
  content = content.replace(
    '{/* Button to configure Lamp Types and Reference Photos */}',
    cableQuickBarButtons + '\n      {/* Button to configure Lamp Types and Reference Photos */}'
  );
}

// 4. Add Cable Banner Notification during drawing
const cableBannerUi = `
              ) : activeTool === "cable_connect" ? (
                <span>
                  🔌 {drawingCableStartSymbol
                    ? \`Verbunden von: \${drawingCableStartSymbol.label || "Gerät A"} ➔ Klicken Sie Wegpunkte oder das Ziel-Gerät zum Abschließen\`
                    : t("planBma", "drawCableStartHint", "Klicken Sie auf das Start-Gerät für das Kabel")}
                </span>
              ) : activeTool === "free_line" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>
                    〰 {t("planBma", "drawFreeLineHint", "Punkte auf dem Plan anklicken, mit Enter abschließen")}
                    {drawingFreeLinePoints.length > 0 && \` (\${drawingFreeLinePoints.length} Punkte)\`}
                  </span>
                  {drawingFreeLinePoints.length >= 2 && (
                    <button
                      type="button"
                      onClick={handleFinishFreeLine}
                      style={{
                        background: "#22c55e",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      ✓ {t("planBma", "finishKabelbahn", "Fertig (Enter)")}
                    </button>
                  )}
                </div>
`;

if (!content.includes('activeTool === "cable_connect"')) {
  content = content.replace(
    ') : activeSymbolType === "geraet_box" ? (',
    ') : activeSymbolType === "geraet_box" ? (' + '\n' + cableBannerUi
  );
}

// 5. Add rendering of Cable Connections, Free Lines and Live Preview on Leaflet
const cableMapRenderCode = `
      {/* ── CABLE CONNECTIONS & FREE LINES RENDERING ── */}
      {layersVisibility?.cables !== false && cableConnections.map((c, cIdx) => {
        const m = c.metadata || {};
        const isFree = c.type === "FREE_LINE" || m.is_free_line;
        const strokeColor = c.color || (isFree ? "#f59e0b" : "#0284c7");
        const isSelected = selectedCableId === c.id;

        let latLngs: Array<[number, number]> = [];

        if (isFree) {
          const wps = m.waypoints || [];
          if (wps.length < 2) return null;
          latLngs = wps.map((p) => normCoordsToLatLng(p.x_norm, p.y_norm));
        } else {
          const s1 = symbols.find((s) => s.id === m.source_symbol_id);
          const s2 = symbols.find((s) => s.id === m.target_symbol_id);

          const startX = s1 ? s1.x_norm : (m.waypoints?.[0]?.x_norm || 0);
          const startY = s1 ? s1.y_norm : (m.waypoints?.[0]?.y_norm || 0);
          const endX = s2 ? s2.x_norm : (m.waypoints?.length ? m.waypoints[m.waypoints.length - 1].x_norm : startX);
          const endY = s2 ? s2.y_norm : (m.waypoints?.length ? m.waypoints[m.waypoints.length - 1].y_norm : startY);

          latLngs.push(normCoordsToLatLng(startX, startY));
          if (m.waypoints && Array.isArray(m.waypoints)) {
            for (const wp of m.waypoints) {
              latLngs.push(normCoordsToLatLng(wp.x_norm, wp.y_norm));
            }
          }
          latLngs.push(normCoordsToLatLng(endX, endY));
        }

        if (latLngs.length < 2) return null;

        // Collision offset: if multiple cables share segment, offset slightly
        const offsetPx = (cIdx % 3 - 1) * 3;
        const midIdx = Math.floor(latLngs.length / 2);
        const midP1 = latLngs[midIdx - 1] || latLngs[0];
        const midP2 = latLngs[midIdx] || latLngs[latLngs.length - 1];
        const badgeLatLng: [number, number] = [
          (midP1[0] + midP2[0]) / 2,
          (midP1[1] + midP2[1]) / 2,
        ];

        const labelText = [m.cable_number || c.name, m.cable_type].filter(Boolean).join(" - ") + (m.length_meters ? \` (\${m.length_meters}m)\` : "");

        return (
          <React.Fragment key={\`cable-conn-\${c.id || cIdx}\`}>
            <Polyline
              positions={latLngs}
              pathOptions={{
                color: isSelected ? "#38bdf8" : strokeColor,
                weight: isSelected ? 4.5 : 3,
                opacity: 0.88,
                dashArray: isFree ? "6, 6" : undefined,
              }}
              eventHandlers={{
                click: (e: any) => {
                  if (activeTool || activeSymbolType) return;
                  if (e?.originalEvent) e.originalEvent.stopPropagation();
                  setSelectedCableId((prev) => (prev === c.id ? null : c.id));
                },
              }}
            />

            {/* Cable Midpoint Badge / Popup */}
            <MarkerAny
              position={badgeLatLng}
              interactive={!activeTool && !activeSymbolType}
              icon={L.divIcon({
                className: "cable-badge-icon",
                html: \`
                  <div style="
                    display: inline-flex;
                    align-items: center;
                    background: #0f172a;
                    border: 1.5px solid \${isSelected ? '#38bdf8' : strokeColor};
                    color: #ffffff;
                    border-radius: 6px;
                    padding: 2px 6px;
                    font-size: 10px;
                    font-weight: 800;
                    white-space: nowrap;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
                    cursor: pointer;
                    transform: translate(-50%, -50%);
                  ">
                    <span>\${isFree ? '〰' : '🔌'} \${labelText || 'Kabel'}</span>
                  </div>
                \`,
              })}
              eventHandlers={{
                click: (e: any) => {
                  if (activeTool || activeSymbolType) return;
                  if (e?.originalEvent) e.originalEvent.stopPropagation();
                  setSelectedCableId((prev) => (prev === c.id ? null : c.id));
                },
              }}
            >
              {selectedCableId === c.id && (
                <TooltipAny permanent interactive opacity={1} direction="top" offset={[0, -10]}>
                  <div style={{ padding: 4, minWidth: 200, maxWidth: 280 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: strokeColor, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                      <span>{isFree ? "〰 Freie Leitung" : "🔌 Kabelverbindung"}</span>
                      {m.cable_number && <span style={{ color: "#38bdf8" }}>[{m.cable_number}]</span>}
                    </div>

                    {!isFree && (
                      <div style={{ fontSize: 11, color: "#f8fafc", marginBottom: 3 }}>
                        <b>Von:</b> {m.source_device_label || "Gerät A"} ➔ <b>Nach:</b> {m.target_device_label || "Gerät B"}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                      <b>Typ:</b> <span style={{ color: "#e2e8f0" }}>{m.cable_type || "NYY-J 5x2,5 mm²"}</span>
                    </div>

                    {m.length_meters && (
                      <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, marginBottom: 2 }}>
                        ⚡ Länge: {m.length_meters} m
                      </div>
                    )}

                    {m.description && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                        {m.description}
                      </div>
                    )}

                    {isAdminOrMod && (
                      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConnection(c);
                            setCableModalSource(m.source_symbol_id ? { id: m.source_symbol_id, label: m.source_device_label || "Gerät", plan_id: m.source_plan_id || planId } : null);
                            setCableModalTarget(m.target_symbol_id ? { id: m.target_symbol_id, label: m.target_device_label || "Gerät", plan_id: m.target_plan_id || planId } : null);
                            setCableModalIsFreeLine(isFree);
                            setCableTypeInput(m.cable_type || "NYY-J 5x2,5 mm²");
                            setCableNumberInput(m.cable_number || c.name || "");
                            setCableDescInput(m.description || "");
                            setCableLengthCalculated(m.length_meters || null);
                            setCableModalOpen(true);
                            setSelectedCableId(null);
                          }}
                          style={{
                            flex: 1,
                            background: "rgba(59, 130, 246, 0.2)",
                            border: "1px solid rgba(59, 130, 246, 0.5)",
                            color: "#60a5fa",
                            borderRadius: 6,
                            padding: "4px 6px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ✏️ {t("planBma", "edit", "Bearbeiten")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCableConnection(c.id);
                          }}
                          style={{
                            flex: 1,
                            background: "#ef4444",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 6,
                            padding: "4px 6px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          🗑 {t("planBma", "delete", "Löschen")}
                        </button>
                      </div>
                    )}
                  </div>
                </TooltipAny>
              )}
            </MarkerAny>
          </React.Fragment>
        );
      })}

      {/* Live Active Cable Drawing Polyline & Rubber Line */}
      {activeTool === "cable_connect" && drawingCableStartSymbol && (() => {
        const startLL = normCoordsToLatLng(drawingCableStartSymbol.x_norm, drawingCableStartSymbol.y_norm);
        const wpLLs = drawingCableWaypoints.map((p) => normCoordsToLatLng(p.x_norm, p.y_norm));
        const allPts = [startLL, ...wpLLs];
        if (hoverLatLng) allPts.push([hoverLatLng.lat, hoverLatLng.lng]);

        return (
          <Polyline
            positions={allPts}
            pathOptions={{
              color: "#38bdf8",
              weight: 3.5,
              dashArray: "6, 6",
            }}
          />
        );
      })()}

      {/* Live Free Line Drawing Polyline */}
      {activeTool === "free_line" && drawingFreeLinePoints.length > 0 && (() => {
        const pts = drawingFreeLinePoints.map((p) => normCoordsToLatLng(p.x_norm, p.y_norm));
        if (hoverLatLng) pts.push([hoverLatLng.lat, hoverLatLng.lng]);

        return (
          <Polyline
            positions={pts}
            pathOptions={{
              color: "#f59e0b",
              weight: 3.5,
              dashArray: "6, 6",
            }}
          />
        );
      })()}
`;

if (!content.includes("CABLE CONNECTIONS & FREE LINES RENDERING")) {
  content = content.replace(
    "{/* Active LED Stripe 2-Corner Drawing Preview */}",
    cableMapRenderCode + "\n\n      {/* Active LED Stripe 2-Corner Drawing Preview */}"
  );
}

// 6. Connect symbol click in device marker to cable connection tool
const symbolClickCableHandling = `
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
`;

if (!content.includes('if (activeTool === "cable_connect") {') && content.includes('eventHandlers={{') && content.includes('click: (e: any) => {')) {
  content = content.replace(
    'if (activeSymbolType) return;',
    'if (activeSymbolType) return;\n' + symbolClickCableHandling
  );
}

// 7. Add Cable Connection Modal Dialog UI
const cableModalUiCode = `
      {/* ── CABLE CONNECTION & FREE LINE FORM MODAL ── */}
      {cableModalOpen && typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div className={styles.paletteModal} onClick={() => setCableModalOpen(false)}>
            <div
              className={styles.paletteCard}
              style={{ maxWidth: 440, background: "#1e293b", border: "2px solid #0284c7", borderRadius: 12, padding: 18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle} style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{cableModalIsFreeLine ? "〰 Freie Leitung" : "🔌 Kabelverbindung"}</span>
                </h3>
                <button type="button" className={styles.closeBtn} onClick={() => setCableModalOpen(false)}>✕</button>
              </div>

              {!cableModalIsFreeLine && cableModalSource && cableModalTarget && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14, background: "rgba(255,255,255,0.05)", padding: 10, borderRadius: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 2 }}>
                      Von (Quelle):
                    </label>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#38bdf8" }}>
                      {cableModalSource.label}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 2 }}>
                      Nach (Ziel):
                    </label>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#4ade80" }}>
                      {cableModalTarget.label}
                    </div>
                  </div>
                </div>
              )}

              {/* Cable Type Select & Input */}
              <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                <label className={styles.label}>
                  🔌 {t("planBma", "cableType", "Kabeltyp / Querschnitt")}
                </label>
                <select
                  value={cableTypeInput}
                  onChange={(e) => setCableTypeInput(e.target.value)}
                  className={styles.input}
                  style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12, marginBottom: 6 }}
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
                  className={styles.input}
                  style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
                />
              </div>

              {/* Cable Number */}
              <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                <label className={styles.label}>
                  🏷️ {t("planBma", "cableNumber", "Kabel-Nummer")}
                </label>
                <input
                  type="text"
                  value={cableNumberInput}
                  onChange={(e) => setCableNumberInput(e.target.value)}
                  placeholder="z.B. K-001"
                  className={styles.input}
                  style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
                />
              </div>

              {/* Description */}
              <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                <label className={styles.label}>
                  📝 {t("planBma", "cableDescription", "Beschreibung / Zweck")}
                </label>
                <input
                  type="text"
                  value={cableDescInput}
                  onChange={(e) => setCableDescInput(e.target.value)}
                  placeholder="z.B. Zuleitung Wärmepumpe / Steuerung"
                  className={styles.input}
                  style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}
                />
              </div>

              {/* Length */}
              <div style={{ marginBottom: 14, fontSize: 12, color: "#94a3b8" }}>
                <b>Länge:</b>{" "}
                <span style={{ color: "#38bdf8", fontWeight: 800 }}>
                  {cableLengthCalculated ? \`\${cableLengthCalculated} m\` : "nicht kalibriert"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCableModalOpen(false)}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.1)",
                    border: "none",
                    borderRadius: 6,
                    color: "#f8fafc",
                    padding: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t("planBma", "cancel", "Abbrechen")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveCableConnection}
                  style={{
                    flex: 1,
                    background: "#0284c7",
                    border: "none",
                    borderRadius: 6,
                    color: "#ffffff",
                    padding: "8px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ✓ {t("planBma", "save", "Speichern")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
`;

if (!content.includes("CABLE CONNECTION & FREE LINE FORM MODAL")) {
  content = content.replace(
    "{/* ── LAMP TYPES CONFIGURATION MODAL ── */}",
    cableModalUiCode + "\n\n      {/* ── LAMP TYPES CONFIGURATION MODAL ── */}"
  );
}

fs.writeFileSync(bmaPath, content, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with UI, Cable Modal and Interactive Leaflet Rendering!");
