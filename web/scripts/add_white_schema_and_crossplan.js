const fs = require("fs");
const path = require("path");

const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaPath, "utf8");

// 1. Add fetch project plans and symbols for Cross-Plan connection
const crossPlanFetchCode = `
  // Fetch project plans for cross-plan connections
  const fetchProjectPlansAndDevices = useCallback(async () => {
    if (!projectId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(\`/api/projects/\${projectId}/plans\`, {
        headers: { Authorization: \`Bearer \${token}\` },
      });
      if (res.ok) {
        const json = await res.json();
        const plans = json.plans || json.data || [];
        setAllProjectPlans(plans.map((p: any) => ({ id: p.id, title: p.name || p.title || \`Plan v\${p.version}\` })));
      }
    } catch (e) {
      console.warn("Failed to fetch project plans:", e);
    }
  }, [projectId]);

  useEffect(() => {
    if (cableModalOpen || schemaAddModalOpen) {
      fetchProjectPlansAndDevices();
    }
  }, [cableModalOpen, schemaAddModalOpen, fetchProjectPlansAndDevices]);
`;

if (!content.includes("fetchProjectPlansAndDevices")) {
  content = content.replace(
    "const handleFinishFreeLine = () => {",
    crossPlanFetchCode + "\n  const handleFinishFreeLine = () => {"
  );
}

// 2. Add White Schema CSS & Fit Schema button
const whiteSchemaStyleAndFitBtn = `
      {/* White Schema Mode Style Override */}
      {isWhiteSchemaMode && (
        <style>{\`
          .leaflet-tile-pane { display: none !important; }
          .leaflet-container { background: #ffffff !important; }
        \`}</style>
      )}

      {isWhiteSchemaMode && (
        <button
          type="button"
          className={styles.quickBtn}
          onClick={() => {
            if (symbols.length === 0) return;
            const lats = symbols.map((s) => normCoordsToLatLng(s.x_norm, s.y_norm));
            const bounds = L.latLngBounds(lats);
            map.fitBounds(bounds, { padding: [60, 60] });
          }}
          style={{ background: "rgba(2, 132, 199, 0.25)", border: "1px solid #38bdf8", color: "#38bdf8", fontWeight: 700 }}
          title="Alle Schema-Elemente zentrieren und einpassen"
        >
          <span>🔍</span>
          <span>{t("planBma", "fitSchema", "Fit Schema")}</span>
        </button>
      )}
`;

if (!content.includes("White Schema Mode Style Override")) {
  content = content.replace(
    '{/* ── CABLE CONNECTIONS & FREE LINES RENDERING ── */}',
    whiteSchemaStyleAndFitBtn + '\n      {/* ── CABLE CONNECTIONS & FREE LINES RENDERING ── */}'
  );
}

fs.writeFileSync(bmaPath, content, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with White Schema CSS, Fit Schema and Cross-Plan handlers!");
