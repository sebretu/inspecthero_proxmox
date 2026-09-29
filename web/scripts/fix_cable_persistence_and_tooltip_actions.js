const fs = require("fs");
const path = require("path");

const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaModPath, "utf8");

// 1. Add loadCableConnections callback and useEffect on mount
const loadCableConnectionsCode = `
  // Load cable connections from API
  const loadCableConnections = useCallback(async () => {
    if (!planId) return;
    const token = await getToken();
    if (!token) return;
    try {
      const url = projectId
        ? \`/api/plans/\${planId}/cable-connections?projectId=\${encodeURIComponent(projectId)}\`
        : \`/api/plans/\${planId}/cable-connections\`;
      const res = await fetch(url, {
        headers: { Authorization: \`Bearer \${token}\` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && Array.isArray(json.connections)) {
        setCableConnections(json.connections);
      }
    } catch (e) {
      console.error("Failed to load cable connections:", e);
    }
  }, [planId, projectId]);

  useEffect(() => {
    loadCableConnections();
  }, [loadCableConnections]);
`;

if (!content.includes("const loadCableConnections = useCallback(")) {
  content = content.replace(
    `  useEffect(() => {\n    loadSymbols();\n  }, [loadSymbols]);`,
    `  useEffect(() => {\n    loadSymbols();\n  }, [loadSymbols]);\n` + loadCableConnectionsCode
  );
}

// 2. Fix Tooltip interactivity and button handlers on cables
content = content.replace(
  `{openTooltipId === conn.id && (
                  <TooltipAny permanent direction="top" opacity={1}>`,
  `{openTooltipId === conn.id && (
                  <TooltipAny permanent interactive={true} direction="top" opacity={1}>`
);

// 3. Make sure handleDeleteCableConnection also closes tooltip
content = content.replace(
  `      if (res.ok) {
        setCableConnections((prev) => prev.filter((c) => c.id !== connId));
        setSelectedCableId(null);
      }`,
  `      if (res.ok) {
        setCableConnections((prev) => prev.filter((c) => c.id !== connId));
        setSelectedCableId(null);
        setOpenTooltipId(null);
      }`
);

// 4. Make sure handleAddParallelCable closes the tooltip when opening modal
content = content.replace(
  `  const handleAddParallelCable = (existingConn: CableConnectionRow) => {`,
  `  const handleAddParallelCable = (existingConn: CableConnectionRow) => {
    setOpenTooltipId(null);`
);

fs.writeFileSync(bmaModPath, content, "utf8");
console.log("Successfully added loadCableConnections and fixed tooltip interactivity in PlanBmaSymbolsModule.tsx!");
