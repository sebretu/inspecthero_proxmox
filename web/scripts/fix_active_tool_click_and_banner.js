const fs = require("fs");
const path = require("path");

const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaPath, "utf8");

// 1. Fix mousemove and click in MapEventsHandler
content = content.replace(
  `      mousemove: (e: any) => {
        if (
          (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length > 0) ||
          (activeSymbolType === "led_stripe" && drawingLedStripeStart)
        ) {
          setHoverLatLng(e.latlng);
        }
      },
      click: (e: any) => {
        if (!activeSymbolType || !isAdminOrMod) return;`,
  `      mousemove: (e: any) => {
        if (
          (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length > 0) ||
          (activeSymbolType === "led_stripe" && drawingLedStripeStart) ||
          (activeSymbolType === "geraet_box" && drawingGeraetBoxStart) ||
          (activeTool === "cable_connect" && drawingCableStartSymbol) ||
          (activeTool === "free_line" && drawingFreeLinePoints.length > 0)
        ) {
          setHoverLatLng(e.latlng);
        }
      },
      click: (e: any) => {
        if ((!activeSymbolType && !activeTool) || !isAdminOrMod) return;`
);

// 2. Fix floating banner to appear for activeTool as well
content = content.replace(
  `      {/* Hint banner / floating control bar when placing */}
      {isAdminOrMod && activeSymbolType && (`,
  `      {/* Hint banner / floating control bar when placing */}
      {isAdminOrMod && (activeSymbolType || activeTool) && (`
);

// Add banner branches for cable_connect and free_line
content = content.replace(
  `              {activeSymbolType === "kabelbahn" ? (`,
  `              {activeTool === "cable_connect" ? (
                <>
                  🔌 <b>Kabel verbinden:</b> {drawingCableStartSymbol ? (
                    <span style={{ color: "#38bdf8" }}>
                      Start: <b>{drawingCableStartSymbol.label || "Gerät A"}</b> ➔ Klicken Sie Wegpunkte oder das Ziel-Gerät ({drawingCableWaypoints.length} Wegpunkte)
                    </span>
                  ) : (
                    <span>Klicken Sie auf das <b>Start-Gerät</b> auf dem Plan</span>
                  )}
                </>
              ) : activeTool === "free_line" ? (
                <>
                  〰 <b>Freie Leitung zeichnen:</b> {drawingFreeLinePoints.length > 0 ? (
                    <span>{drawingFreeLinePoints.length} Punkte gesetzt (Klicken für weitere Punkte)</span>
                  ) : (
                    <span>Klicken Sie auf den Plan, um die Leitung zu beginnen</span>
                  )}
                </>
              ) : activeSymbolType === "kabelbahn" ? (`
);

// Add action buttons in banner for cable_connect and free_line
const actionButtons = `
            {/* Quick finish for Free Line */}
            {activeTool === "free_line" && drawingFreeLinePoints.length >= 2 && (
              <button
                type="button"
                className={styles.finishBtn}
                onClick={handleFinishFreeLine}
                style={{ background: "#22c55e", color: "#ffffff", padding: "4px 10px", borderRadius: 6, fontWeight: 800 }}
              >
                ✓ {t("planBma", "finishKabelbahn", "Fertig (Enter)")}
              </button>
            )}

            {/* Cancel Button */}
            <button
              type="button"
              className={styles.cancelPlaceBtn}
              onClick={() => {
                setActiveSymbolType(null);
                setActiveTool(null);
                setDrawingKabelbahnPoints([]);
                setDrawingLedStripeStart(null);
                setDrawingGeraetBoxStart(null);
                setDrawingCableStartSymbol(null);
                setDrawingCableWaypoints([]);
                setDrawingFreeLinePoints([]);
                setHoverLatLng(null);
              }}
              style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", color: "#f87171", padding: "4px 8px", borderRadius: 6 }}
            >
              ✕ {t("planBma", "cancel", "Abbrechen (ESC)")}
            </button>
`;

content = content.replace(
  `            {/* Cancel button */}
            <button
              type="button"
              className={styles.cancelPlaceBtn}`,
  actionButtons + `\n            {/* Original Cancel Button */}
            <button
              type="button"
              style={{ display: "none" }}
              className={styles.cancelPlaceBtn}`
);

fs.writeFileSync(bmaPath, content, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with activeTool click handler and interactive banner!");
