const fs = require("fs");
const path = require("path");

const bmaPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let content = fs.readFileSync(bmaPath, "utf8");

// 1. Add CableConnectionRow type definition
const cableTypesCode = `
export type CableConnectionRow = {
  id: string;
  project_id: string;
  name: string;
  type: "CABLE_CONNECTION" | "FREE_LINE";
  color: string;
  metadata: {
    plan_id?: string;
    source_symbol_id?: string;
    target_symbol_id?: string;
    source_plan_id?: string;
    target_plan_id?: string;
    source_device_label?: string;
    target_device_label?: string;
    source_plan_title?: string;
    target_plan_title?: string;
    is_free_line?: boolean;
    cable_type?: string;
    cable_number?: string;
    description?: string;
    waypoints?: Array<{ x_norm: number; y_norm: number }>;
    length_meters?: number;
    status?: string;
    schema_x_source?: number;
    schema_y_source?: number;
    schema_x_target?: number;
    schema_y_target?: number;
    schema_waypoints?: Array<{ x_norm: number; y_norm: number }>;
  };
  created_at?: string;
};
`;

if (!content.includes("export type CableConnectionRow")) {
  content = content.replace(
    "export type BmaSymbolRow =",
    cableTypesCode + "\nexport type BmaSymbolRow ="
  );
}

// 2. Add props: projectId and planScale
if (!content.includes("projectId?: string;")) {
  content = content.replace(
    "onCountsChange?: (counts: { bma?: number; lighting?: number; notlicht?: number; heating?: number; kabelbahn?: number; kabelauslass?: number }) => void;",
    `onCountsChange?: (counts: { bma?: number; lighting?: number; notlicht?: number; heating?: number; cables?: number; kabelbahn?: number; kabelauslass?: number }) => void;
  projectId?: string;
  planScale?: number;`
  );
  content = content.replace(
    "onEnsureLayerVisible,\n  onCountsChange,\n}: Props) {",
    "onEnsureLayerVisible,\n  onCountsChange,\n  projectId,\n  planScale,\n}: Props) {"
  );
}

// 3. Add Cable connections state and handlers
const cableStateCode = `
  // ── CABLE CONNECTIONS & WHITE SCHEMA STATE ──
  const [cableConnections, setCableConnections] = useState<CableConnectionRow[]>([]);
  const [activeTool, setActiveTool] = useState<null | "cable_connect" | "free_line">(null);
  const [isWhiteSchemaMode, setIsWhiteSchemaMode] = useState(false);
  const [drawingCableStartSymbol, setDrawingCableStartSymbol] = useState<BmaSymbolRow | null>(null);
  const [drawingCableWaypoints, setDrawingCableWaypoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const [drawingFreeLinePoints, setDrawingFreeLinePoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const [cableModalOpen, setCableModalOpen] = useState(false);
  const [cableModalSource, setCableModalSource] = useState<{ id: string; label: string; plan_id: string; plan_title?: string } | null>(null);
  const [cableModalTarget, setCableModalTarget] = useState<{ id: string; label: string; plan_id: string; plan_title?: string } | null>(null);
  const [cableModalWaypoints, setCableModalWaypoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const [cableModalIsFreeLine, setCableModalIsFreeLine] = useState(false);
  const [cableTypeInput, setCableTypeInput] = useState("NYY-J 5x2,5 mm²");
  const [cableNumberInput, setCableNumberInput] = useState("");
  const [cableDescInput, setCableDescInput] = useState("");
  const [cableLengthCalculated, setCableLengthCalculated] = useState<number | null>(null);
  const [editingConnection, setEditingConnection] = useState<CableConnectionRow | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [schemaDevices, setSchemaDevices] = useState<Array<{ id: string; x_norm: number; y_norm: number; symbol: BmaSymbolRow }>>([]);
  const [schemaAddModalOpen, setSchemaAddModalOpen] = useState(false);
  const [allProjectSymbols, setAllProjectSymbols] = useState<BmaSymbolRow[]>([]);
  const [allProjectPlans, setAllProjectPlans] = useState<Array<{ id: string; title: string }>>([]);

  const CABLE_TYPES_CATALOG = [
    "NYY-J 5x2,5 mm²",
    "NYY-J 5x4 mm²",
    "NYY-J 5x6 mm²",
    "NYY-J 5x10 mm²",
    "NYY-J 3x2,5 mm²",
    "NYM-J 3x1,5 mm²",
    "NYM-J 5x1,5 mm²",
    "NYM-J 5x2,5 mm²",
    "ÖLFLEX 4x1,5 mm²",
    "ÖLFLEX 5x2,5 mm²",
    "Steuerleitung 2x0,8",
    "CAT 7 Duplex",
    "Fernmeldekabel J-Y(St)Y",
  ];
`;

if (!content.includes("const [cableConnections, setCableConnections]")) {
  content = content.replace(
    "const [paletteOpen, setPaletteOpen] = useState(false);",
    "const [paletteOpen, setPaletteOpen] = useState(false);" + cableStateCode
  );
}

// 4. Fetch cable connections from API
const fetchCablesCode = `
  // Fetch cable connections
  const fetchCableConnections = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const url = \`/api/plans/\${planId}/cable-connections\${projectId ? \`?projectId=\${projectId}\` : ""}\`;
      const res = await fetch(url, {
        headers: { Authorization: \`Bearer \${token}\` },
      });
      if (res.ok) {
        const json = await res.json();
        setCableConnections(json.connections || []);
      }
    } catch (e) {
      console.warn("Failed to fetch cable connections:", e);
    }
  }, [planId, projectId]);

  useEffect(() => {
    fetchCableConnections();
  }, [fetchCableConnections]);

  // Update cable counts
  useEffect(() => {
    if (onCountsChange) {
      onCountsChange({
        cables: cableConnections.length,
      });
    }
  }, [cableConnections, onCountsChange]);
`;

if (!content.includes("fetchCableConnections")) {
  content = content.replace(
    "// Fetch lamp types config for this plan",
    fetchCablesCode + "\n  // Fetch lamp types config for this plan"
  );
}

// 5. Length calculation helper
const lengthCalcHelper = `
  // Calculate real meters along path using planScale or worldPx
  const calculatePathLengthMeters = useCallback(
    (pts: Array<{ x_norm: number; y_norm: number }>) => {
      if (pts.length < 2) return null;
      if (!planScale || planScale <= 0) return null;

      let totalPx = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = (p2.x_norm - p1.x_norm) * worldPxW;
        const dy = (p2.y_norm - p1.y_norm) * worldPxH;
        totalPx += Math.sqrt(dx * dx + dy * dy);
      }
      const meters = totalPx / planScale;
      return Math.round(meters * 10) / 10;
    },
    [planScale, worldPxW, worldPxH]
  );
`;

if (!content.includes("calculatePathLengthMeters")) {
  content = content.replace(
    "// Kabelbahn path distance in meters",
    lengthCalcHelper + "\n  // Kabelbahn path distance in meters"
  );
}

// 6. Save and Delete Cable Connection
const saveCableConnCode = `
  // Save cable connection
  const handleSaveCableConnection = async () => {
    const token = await getToken();
    if (!token) return;

    try {
      if (editingConnection) {
        // PATCH
        const res = await fetch(
          \`/api/plans/\${planId}/cable-connections?connectionId=\${encodeURIComponent(editingConnection.id)}\`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
            body: JSON.stringify({
              name: cableNumberInput.trim() || cableDescInput.trim() || "Kabel",
              metadata: {
                cable_type: cableTypeInput.trim(),
                cable_number: cableNumberInput.trim(),
                description: cableDescInput.trim(),
                length_meters: cableLengthCalculated || undefined,
              },
            }),
          }
        );
        if (res.ok) {
          const json = await res.json();
          setCableConnections((prev) => prev.map((c) => (c.id === editingConnection.id ? json.connection : c)));
          setCableModalOpen(false);
          setEditingConnection(null);
        }
      } else {
        // POST
        const isFree = cableModalIsFreeLine;
        const res = await fetch(\`/api/plans/\${planId}/cable-connections\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
          body: JSON.stringify({
            project_id: projectId || "00000000-0000-0000-0000-000000000000",
            name: cableNumberInput.trim() || cableDescInput.trim() || (isFree ? "Freie Leitung" : "Kabel"),
            type: isFree ? "FREE_LINE" : "CABLE_CONNECTION",
            color: isFree ? "#f59e0b" : "#0284c7",
            metadata: {
              is_free_line: isFree,
              source_symbol_id: cableModalSource?.id,
              target_symbol_id: cableModalTarget?.id,
              source_device_label: cableModalSource?.label,
              target_device_label: cableModalTarget?.label,
              source_plan_id: cableModalSource?.plan_id || planId,
              target_plan_id: cableModalTarget?.plan_id || planId,
              cable_type: cableTypeInput.trim(),
              cable_number: cableNumberInput.trim(),
              description: cableDescInput.trim(),
              waypoints: cableModalWaypoints,
              length_meters: cableLengthCalculated || undefined,
              status: "planned",
            },
          }),
        });

        if (res.ok) {
          const json = await res.json();
          setCableConnections((prev) => [...prev, json.connection]);
          setCableModalOpen(false);
          setActiveTool(null);
          setDrawingCableStartSymbol(null);
          setDrawingCableWaypoints([]);
          setDrawingFreeLinePoints([]);
          setHoverLatLng(null);
        }
      }
    } catch (e) {
      console.error("Failed to save cable connection:", e);
    }
  };

  const handleDeleteCableConnection = async (connId: string) => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(\`/api/plans/\${planId}/cable-connections?connectionId=\${encodeURIComponent(connId)}\`, {
        method: "DELETE",
        headers: { Authorization: \`Bearer \${token}\` },
      });
      if (res.ok) {
        setCableConnections((prev) => prev.filter((c) => c.id !== connId));
        setSelectedCableId(null);
      }
    } catch (e) {
      console.error("Failed to delete cable connection:", e);
    }
  };
`;

if (!content.includes("handleSaveCableConnection")) {
  content = content.replace(
    "// Save new or updated BMA symbol",
    saveCableConnCode + "\n  // Save new or updated BMA symbol"
  );
}

fs.writeFileSync(bmaPath, content, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with Cable state & API handlers!");
