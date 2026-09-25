
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { Marker, Tooltip, Polyline, Polygon, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { BrowserMultiFormatReader } from "@zxing/library";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/apiClient";
import { getPiktoDirection, getPiktoIconUrl, PiktoDirection } from "@/lib/bmaSymbolsData";
import styles from "./PlanBmaSymbols.module.css";

function snapOrtho(prevPt: { x_norm: number; y_norm: number }, currPt: { x_norm: number; y_norm: number }, _isShift?: boolean) {
  // Always snap to 90° (mandatory orthogonal - no diagonal lines allowed)
  if (!prevPt) return currPt;
  const dx = Math.abs(currPt.x_norm - prevPt.x_norm);
  const dy = Math.abs(currPt.y_norm - prevPt.y_norm);
  if (dx >= dy) {
    return { x_norm: currPt.x_norm, y_norm: prevPt.y_norm }; // Lock horizontal
  } else {
    return { x_norm: prevPt.x_norm, y_norm: currPt.y_norm }; // Lock vertical
  }
}

function makeStrictOrthoPolyline(
  pts: Array<{ x_norm: number; y_norm: number }>,
  s1?: any,
  s2?: any
): Array<{ x_norm: number; y_norm: number }> {
  if (pts.length < 2) return pts;

  const result: Array<{ x_norm: number; y_norm: number }> = [pts[0]];

  for (let i = 0; i < pts.length - 1; i++) {
    const pA = result[result.length - 1];
    const pB = pts[i + 1];

    const dx = pB.x_norm - pA.x_norm;
    const dy = pB.y_norm - pA.y_norm;

    if (Math.abs(dx) < 0.0001 || Math.abs(dy) < 0.0001) {
      result.push(pB);
      continue;
    }

    let corner: { x_norm: number; y_norm: number };

    if (i === pts.length - 2 && s2) {
      if (s2.symbol_type === "geraet_box") {
        const isSenkrecht = (() => {
          try {
            const pObj = JSON.parse(s2.description || "{}");
            return pObj.orientation === "senkrecht" || pObj.direction === "senkrecht" || pObj.direction === "down" || pObj.direction === "up";
          } catch { return false; }
        })();
        const w_norm = isSenkrecht ? 0.0036 : 0.015;
        const h_norm = isSenkrecht ? 0.025 : 0.006;
        const cx = s2.x_norm + w_norm / 2;
        const cy = s2.y_norm + h_norm / 2;

        const isLeftRightEdge = Math.abs(pA.x_norm - cx) > Math.abs(pA.y_norm - cy);
        if (isLeftRightEdge) {
          corner = { x_norm: pA.x_norm, y_norm: pB.y_norm };
        } else {
          corner = { x_norm: pB.x_norm, y_norm: pA.y_norm };
        }
      } else {
        corner = Math.abs(dx) >= Math.abs(dy)
          ? { x_norm: pB.x_norm, y_norm: pA.y_norm }
          : { x_norm: pA.x_norm, y_norm: pB.y_norm };
      }
    } else if (i === 0 && s1) {
      if (s1.symbol_type === "geraet_box") {
        const isSenkrecht = (() => {
          try {
            const pObj = JSON.parse(s1.description || "{}");
            return pObj.orientation === "senkrecht" || pObj.direction === "senkrecht" || pObj.direction === "down" || pObj.direction === "up";
          } catch { return false; }
        })();
        const w_norm = isSenkrecht ? 0.0036 : 0.015;
        const h_norm = isSenkrecht ? 0.025 : 0.006;
        const cx = s1.x_norm + w_norm / 2;
        const cy = s1.y_norm + h_norm / 2;

        const isLeftRightEdge = Math.abs(pB.x_norm - cx) > Math.abs(pB.y_norm - cy);
        if (isLeftRightEdge) {
          corner = { x_norm: pB.x_norm, y_norm: pA.y_norm };
        } else {
          corner = { x_norm: pA.x_norm, y_norm: pB.y_norm };
        }
      } else {
        corner = Math.abs(dx) >= Math.abs(dy)
          ? { x_norm: pB.x_norm, y_norm: pA.y_norm }
          : { x_norm: pA.x_norm, y_norm: pB.y_norm };
      }
    } else {
      if (Math.abs(dx) >= Math.abs(dy)) {
        corner = { x_norm: pB.x_norm, y_norm: pA.y_norm };
      } else {
        corner = { x_norm: pA.x_norm, y_norm: pB.y_norm };
      }
    }

    result.push(corner, pB);
  }

  const cleaned: Array<{ x_norm: number; y_norm: number }> = [result[0]];
  for (let i = 1; i < result.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = result[i];
    if (Math.abs(curr.x_norm - prev.x_norm) < 0.0001 && Math.abs(curr.y_norm - prev.y_norm) < 0.0001) {
      continue;
    }
    if (cleaned.length >= 2) {
      const prevPrev = cleaned[cleaned.length - 2];
      const isHoriz = Math.abs(prev.y_norm - prevPrev.y_norm) < 0.0001 && Math.abs(curr.y_norm - prev.y_norm) < 0.0001;
      const isVert = Math.abs(prev.x_norm - prevPrev.x_norm) < 0.0001 && Math.abs(curr.x_norm - prev.x_norm) < 0.0001;
      if (isHoriz || isVert) {
        cleaned[cleaned.length - 1] = curr;
        continue;
      }
    }
    cleaned.push(curr);
  }

  return cleaned;
}

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

export type BmaSymbolType =
  | "dis_signalgeber"
  | "sirene"
  | "detector_blue"
  | "detector_red"
  | "notlicht_lampe"
  | "notlicht_pikto"
  | "notlicht_pikto_gross"
  | "lampe"
  | "led_stripe"
  | "kabelauslass"
  | "kabelbahn"
  | "warmepumpe_aussen"
  | "warmepumpe_innen"
  | "infrarotheizung"
  | "geraet_box"
  | "temperaturfuehler"
  | "ueberspannungsschutz"
  | "abdeckung_box"
  | "revision_cloud";


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
    is_pe_line?: boolean;
    execution_status?: string;
    problem_description?: string;
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
    [key: string]: any;
  };
  created_at?: string;
};

export type BmaSymbolRow = {
  id: string;
  plan_id: string;
  symbol_type: BmaSymbolType;
  x_norm: number;
  y_norm: number;
  label?: string | null;
  loop_number?: string | null;
  address?: string | null;
  description?: string | null;
  created_by?: string | null;
  created_at?: string;
};

export const BMA_SYMBOLS_CONFIG: Record<
  BmaSymbolType,
  { name: string; iconUrl: string; width: number; height: number; defaultPrefix: string; isEmergency?: boolean; isLight?: boolean; isOutlet?: boolean; isLadder?: boolean; isStripe?: boolean; isHeating?: boolean; isBigScale?: boolean }
> = {
  dis_signalgeber: {
    name: "D-Melder mit Sirene",
    iconUrl: "/symbols/bma/dis_signalgeber.svg",
    width: 36,
    height: 36,
    defaultPrefix: "DIS",
  },
  sirene: {
    name: "Sirene (Signalgeber)",
    iconUrl: "/symbols/bma/sirene.svg",
    width: 36,
    height: 36,
    defaultPrefix: "BMA",
  },
  detector_blue: {
    name: "ZWD-Melder",
    iconUrl: "/symbols/bma/detector_blue.svg",
    width: 36,
    height: 36,
    defaultPrefix: "BMA",
  },
  detector_red: {
    name: "D-Melder",
    iconUrl: "/symbols/bma/detector_red.svg",
    width: 36,
    height: 36,
    defaultPrefix: "BMA",
  },
  lampe: {
    name: "Lampe (Leuchte)",
    iconUrl: "/symbols/bma/lampe.svg",
    width: 36,
    height: 36,
    defaultPrefix: "L",
    isLight: true,
  },
  led_stripe: {
    name: "LED Stripe (Pasek LED)",
    iconUrl: "/symbols/bma/led_stripe.svg",
    width: 36,
    height: 36,
    defaultPrefix: "LED",
    isLight: true,
    isStripe: true,
  },
  notlicht_lampe: {
    name: "Notbeleuchtung Lampe (Sicherheitsleuchte)",
    iconUrl: "/symbols/bma/notlicht_lampe.svg",
    width: 36,
    height: 36,
    defaultPrefix: "NL",
    isEmergency: true,
  },
  notlicht_pikto: {
    name: "Rettungszeichen klein (RZ-K)",
    iconUrl: "/symbols/bma/notlicht_pikto.svg",
    width: 36,
    height: 36,
    defaultPrefix: "RZ-K",
    isEmergency: true,
  },
  notlicht_pikto_gross: {
    name: "Rettungszeichen groß (RZ-G)",
    iconUrl: "/symbols/bma/notlicht_pikto_gross.svg",
    width: 60,
    height: 30,
    defaultPrefix: "RZ-G",
    isEmergency: true,
  },
  kabelauslass: {
    name: "Kabelauslass",
    iconUrl: "/symbols/bma/kabelauslass.svg",
    width: 36,
    height: 36,
    defaultPrefix: "KA",
    isOutlet: true,
  },
  ueberspannungsschutz: {
    name: "Überspannungsschutz (SPD)",
    iconUrl: "/symbols/bma/ueberspannungsschutz.svg",
    width: 36,
    height: 43,
    defaultPrefix: "SPD",
    isOutlet: true,
  },
  kabelbahn: {
    name: "Kabelbahn (Kabeltrasse)",
    iconUrl: "/symbols/bma/kabelbahn.svg",
    width: 36,
    height: 36,
    defaultPrefix: "KB",
    isLadder: true,
  },
  warmepumpe_aussen: {
    name: "Wärmepumpe Außen",
    iconUrl: "/symbols/bma/warmepumpe_aussen.svg",
    width: 72,
    height: 144,
    defaultPrefix: "WP-A",
    isHeating: true,
    isBigScale: true,
  },
  warmepumpe_innen: {
    name: "Wärmepumpe Innen",
    iconUrl: "/symbols/bma/warmepumpe_innen.svg",
    width: 120,
    height: 120,
    defaultPrefix: "WP-I",
    isHeating: true,
    isBigScale: true,
  },
  infrarotheizung: {
    name: "Infrarotheizung",
    iconUrl: "/symbols/bma/infrarotheizung.svg",
    width: 160,
    height: 56,
    defaultPrefix: "IH",
    isHeating: true,
    isBigScale: true,
  },
  temperaturfuehler: {
    name: "Temperaturfühler",
    iconUrl: "/symbols/bma/temperaturfuehler.svg",
    width: 36,
    height: 36,
    defaultPrefix: "TF",
    isHeating: true,
  },
  geraet_box: {
    name: "Gerät / Steuerung (Prostokąt)",
    iconUrl: "/symbols/bma/geraet_box.svg",
    width: 48,
    height: 32,
    defaultPrefix: "G",
    isHeating: true,
  },
  abdeckung_box: {
    name: "Abdeckung (Maskier-Rechteck)",
    iconUrl: "/symbols/bma/abdeckung_box.svg",
    width: 40,
    height: 30,
    defaultPrefix: "",
    isOutlet: true,
  },
  revision_cloud: {
    name: "Änderungswolke (Revision)",
    iconUrl: "/symbols/bma/revision_cloud.svg",
    width: 40,
    height: 30,
    defaultPrefix: "REV",
    isOutlet: true,
  },
};

const CRS = L.CRS.Simple;
const MarkerAny: any = Marker;
const TooltipAny: any = Tooltip;
const PolylineAny: any = Polyline;
const PolygonAny: any = Polygon;
const CircleMarkerAny: any = CircleMarker;

export type PlanBmaLayersVisibility = {
  bma?: boolean;
  lighting?: boolean;
  notlicht?: boolean;
  kabelbahn?: boolean;
  kabelauslass?: boolean;
  heating?: boolean;
};

export default function PlanBmaSymbolsModule({
  planId,
  meta,
  currentUserId,
  currentUserRole,
  layersVisibility,
  onEnsureLayerVisible,
  onCountsChange,
  projectId,
  isWhiteSchemaMode = false,
  onToggleWhiteSchemaMode,
}: {
  planId: string;
  meta: Meta;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  layersVisibility?: any;
  onEnsureLayerVisible?: (layerKey: any) => void;
  onCountsChange?: (counts: any) => void;
  projectId?: string;
  isWhiteSchemaMode?: boolean;
  onToggleWhiteSchemaMode?: () => void;
}) {
  const { t } = useLanguage();
  const map = useMap();

  const [symbols, setSymbols] = useState<BmaSymbolRow[]>([]);
  const [planScale, setPlanScale] = useState<number | null>(null);

  // Load plan scale from /api/plans/[id]/scale
  useEffect(() => {
    async function loadPlanScale() {
      try {
        const token = await getToken();
        const res = await fetch(`/api/plans/${planId}/scale`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          const ppm = json.scale?.pixels_per_meter ?? json.scale?.pixelsPerMeter;
          if (ppm && Number(ppm) > 0) {
            setPlanScale(Number(ppm));
            console.log(`Plan scale loaded: ${ppm} px/meter`);
          }
        }
      } catch (err) {
        console.error("Error loading plan scale:", err);
      }
    }
    loadPlanScale();
  }, [planId]);

  const [activeSymbolType, setActiveSymbolType] = useState<BmaSymbolType | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [recentSymbols, setRecentSymbols] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("bma_recent_symbols");
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const recordRecentSymbol = useCallback((symType: string) => {
    setRecentSymbols((prev) => {
      const filtered = prev.filter((s) => s !== symType);
      const updated = [symType, ...filtered].slice(0, 6);
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("bma_recent_symbols", JSON.stringify(updated));
        }
      } catch {}
      return updated;
    });
  }, []);

  const [userFavorites, setUserFavorites] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("bma_user_favorites");
        return stored ? JSON.parse(stored) : ["lampe", "pe_line", "cable_connect", "detector_red", "notlicht_lampe"];
      } catch {
        return ["lampe", "pe_line", "cable_connect", "detector_red", "notlicht_lampe"];
      }
    }
    return ["lampe", "pe_line", "cable_connect", "detector_red", "notlicht_lampe"];
  });

  const toggleFavorite = useCallback((symType: string) => {
    setUserFavorites((prev) => {
      const isFav = prev.includes(symType);
      const updated = isFav ? prev.filter((s) => s !== symType) : [...prev, symType];
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("bma_user_favorites", JSON.stringify(updated));
        }
      } catch {}
      return updated;
    });
  }, []);

  // ── CABLE CONNECTIONS & WHITE SCHEMA STATE ──
  const [cableConnections, setCableConnections] = useState<CableConnectionRow[]>([]);
  const [activeTool, setActiveTool] = useState<null | "cable_connect" | "free_line" | "pe_line">(null);
  const [geraetDirection, setGeraetDirection] = useState<'waagerecht' | 'senkrecht'>('waagerecht');
  const [geraetSize, setGeraetSize] = useState<'normal' | 'small'>('normal');
  const [showAddDeviceType, setShowAddDeviceType] = useState(false);
  const [newDevName, setNewDevName] = useState("");
  const [newDevModel, setNewDevModel] = useState("");
  const [newDevColor, setNewDevColor] = useState("#0284c7");
  const [newDevPhotoBase64, setNewDevPhotoBase64] = useState<string | null>(null);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editDevName, setEditDevName] = useState("");
  const [editDevColor, setEditDevColor] = useState("#0284c7");
  const [editDevPhotoBase64, setEditDevPhotoBase64] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const toggleWhiteSchemaMode = onToggleWhiteSchemaMode || (() => {});
  const [drawingCableStartSymbol, setDrawingCableStartSymbol] = useState<BmaSymbolRow | null>(null);
  const [drawingCableWaypoints, setDrawingCableWaypoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const [drawingFreeLinePoints, setDrawingFreeLinePoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const drawingFreeLinePointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);

  const [cableModalOpen, setCableModalOpen] = useState(false);
  const [cableModalSource, setCableModalSource] = useState<{ id: string; label: string; plan_id: string; plan_title?: string } | null>(null);
  const [cableModalTarget, setCableModalTarget] = useState<{ id: string; label: string; plan_id: string; plan_title?: string } | null>(null);
  const [cableModalWaypoints, setCableModalWaypoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const [cableModalIsFreeLine, setCableModalIsFreeLine] = useState(false);
  const [cableTypeInput, setCableTypeInput] = useState("NYY-J 5x2,5 mm²");
  const [cableColorInput, setCableColorInput] = useState<string>("#0284c7");

  // ── ROUTE EDITING & UNDO STATE & REFS (Declared before useEffect listeners) ──
  const [editingRouteCable, setEditingRouteCable] = useState<CableConnectionRow | null>(null);
  const [editingRouteWaypoints, setEditingRouteWaypoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  const editingRouteCableRef = useRef<CableConnectionRow | null>(null);
  const editingRouteWaypointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);
  const handleSaveEditedRouteRef = useRef<(() => void) | null>(null);
  const [deletedItemsStack, setDeletedItemsStack] = useState<Array<{ type: "cable" | "symbol"; item: any }>>([]);
  const [lastDeletedMessage, setLastDeletedMessage] = useState<string | null>(null);
  const deletedItemsStackRef = useRef<Array<{ type: "cable" | "symbol"; item: any }>>([]);

  useEffect(() => { editingRouteCableRef.current = editingRouteCable; }, [editingRouteCable]);
  useEffect(() => { editingRouteWaypointsRef.current = editingRouteWaypoints; }, [editingRouteWaypoints]);
  const getNextUniqueCableNumber = useCallback((prefix: "K" | "L" | "PE" = "K") => {
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}[-_]?(\\d+)`, "i");
    for (const c of cableConnections) {
      const m = c.metadata || {};
      const numStr = m.cable_number || c.name || "";
      const match = numStr.match(regex);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > maxNum) {
          maxNum = val;
        }
      }
    }
    return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
  }, [cableConnections]);

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const isShiftPressedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(true);
        isShiftPressedRef.current = true;
      }
      if (e.key === "Escape" || e.key === "Backspace") {
        if (editingRouteCableRef.current) {
          e.preventDefault();
          if (editingRouteWaypointsRef.current.length > 0) {
            setEditingRouteWaypoints((prev) => prev.slice(0, -1));
          } else if (e.key === "Escape") {
            setEditingRouteCable(null);
          }
        } else if ((activeToolRef.current === "free_line" || activeToolRef.current === "pe_line") && drawingFreeLinePointsRef.current.length > 0) {
          if (e.key === "Backspace") {
            e.preventDefault();
            setDrawingFreeLinePoints((prev) => {
              const updated = prev.slice(0, -1);
              drawingFreeLinePointsRef.current = updated;
              return updated;
            });
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDrawingFreeLinePoints([]);
            drawingFreeLinePointsRef.current = [];
            setActiveTool(null);
          }
        }
      }
      if (e.key === "Enter") {
        if (editingRouteCableRef.current) {
          e.preventDefault();
          handleSaveEditedRouteRef.current?.();
        } else if ((activeToolRef.current === "free_line" || activeToolRef.current === "pe_line") && drawingFreeLinePointsRef.current.length >= 2) {
          e.preventDefault();
          handleFinishFreeLineRef.current?.();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
        isShiftPressedRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const drawingCableStartSymbolRef = useRef<BmaSymbolRow | null>(null);
  const drawingCableWaypointsRef = useRef<Array<{ x_norm: number; y_norm: number }>>([]);
  const activeToolRef = useRef<string | null>(null);
  const handleFinishFreeLineRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    drawingCableStartSymbolRef.current = drawingCableStartSymbol;
  }, [drawingCableStartSymbol]);

  useEffect(() => {
    drawingCableWaypointsRef.current = drawingCableWaypoints;
  }, [drawingCableWaypoints]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  const [cableNumberInput, setCableNumberInput] = useState("");
  const [cableDescInput, setCableDescInput] = useState("");
  const [cableLengthCalculated, setCableLengthCalculated] = useState<number | null>(null);
  const [editingConnection, setEditingConnection] = useState<CableConnectionRow | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [schemaDevices, setSchemaDevices] = useState<Array<{ id: string; x_norm: number; y_norm: number; symbol: BmaSymbolRow }>>([]);
  const [schemaAddModalOpen, setSchemaAddModalOpen] = useState(false);
  const [allProjectSymbols, setAllProjectSymbols] = useState<BmaSymbolRow[]>([]);
  const [allProjectPlans, setAllProjectPlans] = useState<Array<{ id: string; title: string }>>([]);

  const INITIAL_CABLE_TYPES = [
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

  const [cableTypesList, setCableTypesList] = useState<string[]>(INITIAL_CABLE_TYPES);

  // Fetch shared server cable types from PostgreSQL database for all users
  useEffect(() => {
    const fetchSharedCableTypes = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/cable-types?projectId=${projectId || ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
            setCableTypesList((prev) => Array.from(new Set([...prev, ...json.data])));
          }
        }
      } catch {}
    };
    fetchSharedCableTypes();
  }, [projectId]);

  useEffect(() => {
    if (cableConnections && cableConnections.length > 0) {
      const customTypes = cableConnections
        .map((c) => c.metadata?.cable_type)
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0);

      if (customTypes.length > 0) {
        setCableTypesList((prev) => Array.from(new Set([...prev, ...customTypes])));
      }
    }
  }, [cableConnections]);


  // Kabelbahn drawing state
  const [drawingKabelbahnPoints, setDrawingKabelbahnPoints] = useState<Array<{ x_norm: number; y_norm: number }>>([]);
  // LED Stripe drawing state (2 corners for rectangle)
  const [drawingLedStripeStart, setDrawingLedStripeStart] = useState<{ x_norm: number; y_norm: number } | null>(null);
  // Geraet Box drawing state (2 corners for rectangle)
  const [drawingGeraetBoxStart, setDrawingGeraetBoxStart] = useState<{ x_norm: number; y_norm: number } | null>(null);
  // Abdeckung Box drawing state (2 corners for white mask rectangle)
  const [drawingAbdeckungBoxStart, setDrawingAbdeckungBoxStart] = useState<{ x_norm: number; y_norm: number } | null>(null);
  // Revision Cloud drawing state (2 corners for revision cloud rectangle)
  const [drawingRevisionCloudStart, setDrawingRevisionCloudStart] = useState<{ x_norm: number; y_norm: number } | null>(null);
  const drawingRevisionCloudStartRef = useRef<{ x_norm: number; y_norm: number } | null>(null);
  const [hoverLatLng, setHoverLatLng] = useState<any>(null);

  // Modal placement & editing state
  const [modalCoords, setModalCoords] = useState<{ x_norm: number; y_norm: number; symbol_type: BmaSymbolType } | null>(null);
  const [editingSymbol, setEditingSymbol] = useState<BmaSymbolRow | null>(null);
  const [loopInput, setLoopInput] = useState("1");
  const [addressInput, setAddressInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [powerKwInput, setPowerKwInput] = useState("");
  const [zuleitungInput, setZuleitungInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [serialNumberInput, setSerialNumberInput] = useState("");
  const [photosInput, setPhotosInput] = useState<string[]>([]);
  const [isScanningSerial, setIsScanningSerial] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [arrowDirection, setArrowDirection] = useState<PiktoDirection>("right");
  const [saving, setSaving] = useState(false);

  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);
  const [fullscreenPhotoUrl, setFullscreenPhotoUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [lampTypesModalOpen, setLampTypesModalOpen] = useState(false);
  const [lampTypesData, setLampTypesData] = useState<{
    notlicht_lampe?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    notlicht_pikto?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    notlicht_pikto_gross?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    warmepumpe_aussen?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    warmepumpe_innen?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    infrarotheizung?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    geraet_box?: { model?: string; photoUrl?: string; photoBase64?: string; notes?: string; [key: string]: any };
    variants?: Array<{
      id: string;
      category: "notlicht_lampe" | "notlicht_pikto" | "notlicht_pikto_gross" | "lampe" | "warmepumpe_aussen" | "warmepumpe_innen" | "infrarotheizung" | "geraet_box";
      name: string;
      model: string;
      color: string;
      notes?: string;
      photoUrl?: string;
      photoBase64?: string;
    }>;
    [key: string]: any;
  }>({});
  const [savingLampTypes, setSavingLampTypes] = useState(false);
  const [isFromGlobalLibrary, setIsFromGlobalLibrary] = useState(false);
  const [saveToGlobalDefault, setSaveToGlobalDefault] = useState(true);
  const [lampTypePhotosToUpload, setLampTypePhotosToUpload] = useState<Record<string, File>>({});
  const [lampTypePhotosToRemove, setLampTypePhotosToRemove] = useState<Record<string, boolean>>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");

  const quickScanFileInputRef = useRef<HTMLInputElement>(null);
  const quickPhotoFileInputRef = useRef<HTMLInputElement>(null);
  const targetQuickSymbolRef = useRef<BmaSymbolRow | null>(null);

  const [quickScanningSymbolId, setQuickScanningSymbolId] = useState<string | null>(null);
  const [quickUploadingSymbolId, setQuickUploadingSymbolId] = useState<string | null>(null);
  const [editingSerialSymbolId, setEditingSerialSymbolId] = useState<string | null>(null);
  const [inlineSerialText, setInlineSerialText] = useState<string>("");

  const normalizeDescObj = (description?: string | null) => {
    let descObj: any = {};
    if (!description) return descObj;
    try {
      if (typeof description === "string" && description.startsWith("{")) {
        descObj = JSON.parse(description);
      } else if (typeof description === "string") {
        descObj = { desc: description };
      }
    } catch {
      descObj = { desc: description };
    }
    if (descObj.serialNumber && !descObj.serial_number) {
      descObj.serial_number = descObj.serialNumber;
    }
    return descObj;
  };

  // Helper to scale down huge phone camera photos (12-48MP) to crisp ~1920px max dimension for instant upload and reliable OCR
  const optimizeImageForScan = async (file: File): Promise<{ base64: string; dataUrl: string; optimizedBlob: Blob }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1920;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              const rawDataUrl = e.target?.result as string;
              return resolve({ base64: rawDataUrl.split(",")[1], dataUrl: rawDataUrl, optimizedBlob: file });
            }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
            const base64 = dataUrl.split(",")[1];
            canvas.toBlob(
              (blob) => {
                resolve({
                  base64,
                  dataUrl,
                  optimizedBlob: blob || file,
                });
              },
              "image/jpeg",
              0.90
            );
          } catch (canvasErr) {
            const rawDataUrl = e.target?.result as string;
            resolve({ base64: rawDataUrl.split(",")[1], dataUrl: rawDataUrl, optimizedBlob: file });
          }
        };
        img.onerror = (imgErr) => reject(imgErr);
        img.src = e.target?.result as string;
      };
      reader.onerror = (readErr) => reject(readErr);
      reader.readAsDataURL(file);
    });
  };

  const handleQuickScanSerial = async (symbol: BmaSymbolRow, file: File) => {
    setQuickScanningSymbolId(symbol.id);
    setOpenTooltipId(symbol.id);
    try {
      const token = await getToken();
      const currentSym = symbols.find((s) => s.id === symbol.id) || symbol;
      const descObj = normalizeDescObj(currentSym.description);

      // Preprocess & optimize image for fast transfer and high OCR accuracy
      const { base64, dataUrl, optimizedBlob } = await optimizeImageForScan(file);

      // 1. Upload optimized photo to attach to photos
      try {
        const uploadFile = new File([optimizedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
        const fd = new FormData();
        fd.append("file", uploadFile);
        const upRes = await fetch("/api/upload", {
          method: "POST",
          body: fd,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const upJson = await upRes.json();
        if (upJson.ok && upJson.data?.url) {
          const currentPhotos = Array.isArray(descObj.photos) ? descObj.photos : [];
          if (!currentPhotos.includes(upJson.data.url)) {
            descObj.photos = [...currentPhotos, upJson.data.url];
          }
        }
      } catch (e) {
        console.error("Quick photo upload error:", e);
      }

      // 2. Decode Barcode with ZXing or fallback to AI OCR
      let foundSerial = "";
      try {
        const zx = new BrowserMultiFormatReader();
        const img = new Image();
        img.src = dataUrl;
        await new Promise((r) => (img.onload = r));
        const result = await zx.decodeFromImageElement(img);
        if (result && result.getText()) {
          foundSerial = result.getText().trim();
        }
      } catch {}

      if (!foundSerial) {
        try {
          const res = await fetch("/api/bma/scan-serial", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ imageBase64: base64 }),
          });
          const rj = await res.json();
          if (rj.serialNumber && rj.serialNumber !== "UNKNOWN") {
            foundSerial = rj.serialNumber;
          }
        } catch (e) {
          console.error("AI serial scan error:", e);
        }
      }

      if (foundSerial) {
        descObj.serial_number = foundSerial.trim();
      }

      const updatedDesc = JSON.stringify(descObj);
      const res = await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(symbol.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ description: updatedDesc }),
      });
      if (res.ok) {
        const json = await res.json();
        setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? json.symbol : s)));
        setOpenTooltipId(symbol.id);
      }
    } catch (err) {
      console.error("Quick scan error:", err);
    } finally {
      setQuickScanningSymbolId(null);
      setOpenTooltipId(symbol.id);
    }
  };

  const handleQuickAddPhoto = async (symbol: BmaSymbolRow, file: File) => {
    setQuickUploadingSymbolId(symbol.id);
    setOpenTooltipId(symbol.id);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const upJson = await upRes.json();
      if (upJson.ok && upJson.data?.url) {
        const currentSym = symbols.find((s) => s.id === symbol.id) || symbol;
        const descObj = normalizeDescObj(currentSym.description);

        const currentPhotos = Array.isArray(descObj.photos) ? descObj.photos : [];
        descObj.photos = [...currentPhotos, upJson.data.url];
        const updatedDesc = JSON.stringify(descObj);

        const res = await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(symbol.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ description: updatedDesc }),
        });
        if (res.ok) {
          const json = await res.json();
          setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? json.symbol : s)));
          setOpenTooltipId(symbol.id);
        }
      } else {
        alert("Błąd uploadu zdjęcia: " + (upJson?.error?.message || "Nieznany błąd"));
      }
    } catch (e: any) {
      console.error("Quick photo upload error:", e);
      alert("Błąd podczas dodawania zdjęcia");
    } finally {
      setQuickUploadingSymbolId(null);
      setOpenTooltipId(symbol.id);
    }
  };

  const handleQuickDeletePhoto = async (symbol: BmaSymbolRow, photoIndex: number) => {
    try {
      const token = await getToken();
      const currentSym = symbols.find((s) => s.id === symbol.id) || symbol;
      const descObj = normalizeDescObj(currentSym.description);

      const currentPhotos = Array.isArray(descObj.photos) ? descObj.photos : [];
      descObj.photos = currentPhotos.filter((_p: string, i: number) => i !== photoIndex);

      // Explicitly ensure existing serial number is NEVER deleted when removing a photo
      const existingSerial = descObj.serial_number || descObj.serialNumber;
      if (existingSerial) {
        descObj.serial_number = existingSerial;
      }

      const updatedDesc = JSON.stringify(descObj);

      const res = await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(symbol.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ description: updatedDesc }),
      });
      if (res.ok) {
        const json = await res.json();
        setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? json.symbol : s)));
        setOpenTooltipId(symbol.id);
      }
    } catch (e) {
      console.error("Quick delete photo error:", e);
    }
  };

  const handleQuickSaveSerial = async (symbol: BmaSymbolRow, serial: string) => {
    const currentSym = symbols.find((s) => s.id === symbol.id) || symbol;
    const descObj = normalizeDescObj(currentSym.description);

    if (serial.trim()) {
      descObj.serial_number = serial.trim();
    } else {
      delete descObj.serial_number;
      delete descObj.serialNumber;
    }
    const updatedDesc = JSON.stringify(descObj);

    // Optimistic local update
    const optimisticSymbol: BmaSymbolRow = { ...currentSym, description: updatedDesc };
    setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? optimisticSymbol : s)));
    setEditingSerialSymbolId(null);
    setOpenTooltipId(symbol.id);

    try {
      const token = await getToken();
      const res = await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(symbol.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ description: updatedDesc }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.symbol) {
          setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? json.symbol : s)));
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error("Quick save serial API error:", errJson);
        alert("Błąd podczas zapisywania numeru seryjnego: " + (errJson.error || res.statusText));
      }
    } catch (e: any) {
      console.error("Quick save serial error:", e);
      alert("Błąd połączenia podczas zapisywania numeru seryjnego");
    } finally {
      setOpenTooltipId(symbol.id);
    }
  };

  const renderTooltipQuickSerialAndPhotos = (s: BmaSymbolRow) => {
    const parsed = normalizeDescObj(s.description);
    const serial = parsed.serial_number || parsed.serialNumber || null;
    const photos: string[] = Array.isArray(parsed.photos) ? parsed.photos : [];
    const isScanning = quickScanningSymbolId === s.id;
    const isUploading = quickUploadingSymbolId === s.id;
    const isEditingInline = editingSerialSymbolId === s.id;

    return (
      <div
        ref={(el) => {
          if (el) {
            L.DomEvent.disableClickPropagation(el);
            L.DomEvent.disableScrollPropagation(el);
          }
        }}
        style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", gap: 6 }}
        onClick={(e) => { e.stopPropagation(); }}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onPointerDown={(e) => { e.stopPropagation(); }}
        onDoubleClick={(e) => { e.stopPropagation(); }}
      >
        {/* Serial Number Direct Section */}
        {isEditingInline ? (
          <div
            style={{ display: "flex", gap: 4, alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              autoFocus
              value={inlineSerialText}
              placeholder="Numer seryjny..."
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setInlineSerialText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleQuickSaveSerial(s, inlineSerialText);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingSerialSymbolId(null);
                }
              }}
              style={{
                flex: 1,
                background: "#0f172a",
                border: "1px solid #38bdf8",
                borderRadius: 5,
                color: "#fff",
                fontSize: 11,
                padding: "4px 6px",
                outline: "none",
              }}
            />
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleQuickSaveSerial(s, inlineSerialText);
              }}
              style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: "bold" }}
              title="Zapisz"
            >
              ✓
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setEditingSerialSymbolId(null);
              }}
              style={{ background: "#475569", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
              title="Anuluj"
            >
              ✕
            </button>
          </div>
        ) : isScanning ? (
          <div style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.4)", borderRadius: 6, padding: "5px 8px", fontSize: 10, color: "#38bdf8", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⏳ Skanowanie aparatem / AI OCR...</span>
          </div>
        ) : serial ? (
          <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
              <span style={{ fontSize: 12 }}>🏷️</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 8, color: "#86efac", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>Serial Number</div>
                <div style={{ fontSize: 11, color: "#ffffff", fontWeight: 800, fontFamily: "monospace", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{serial}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 3, alignItems: "center", marginLeft: 4 }}>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpenTooltipId(s.id);
                  setEditingSerialSymbolId(s.id);
                  setInlineSerialText(serial);
                }}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 4, padding: "2px 5px", fontSize: 10, color: "#cbd5e1", cursor: "pointer" }}
                title="Edytuj numer seryjny"
              >
                ✏️
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpenTooltipId(s.id);
                  targetQuickSymbolRef.current = s;
                  if (quickScanFileInputRef.current) {
                    quickScanFileInputRef.current.value = "";
                    quickScanFileInputRef.current.click();
                  }
                }}
                style={{ background: "rgba(56,189,248,0.2)", border: "1px solid rgba(56,189,248,0.4)", borderRadius: 4, padding: "2px 5px", fontSize: 10, color: "#38bdf8", cursor: "pointer", display: "flex", alignItems: "center" }}
                title="Zeskanuj ponownie aparatem"
              >
                📷
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleQuickSaveSerial(s, "");
                }}
                style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 4, padding: "2px 5px", fontSize: 10, color: "#f87171", cursor: "pointer" }}
                title="Usuń numer seryjny"
              >
                🗑️
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpenTooltipId(s.id);
                targetQuickSymbolRef.current = s;
                if (quickScanFileInputRef.current) {
                  quickScanFileInputRef.current.value = "";
                  quickScanFileInputRef.current.click();
                }
              }}
              style={{
                flex: 1,
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                border: "none",
                color: "#ffffff",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                boxShadow: "0 2px 6px rgba(37,99,235,0.35)",
              }}
              title="Zrób zdjęcie / Zeskanuj numer seryjny aparatem"
            >
              <span>📷</span>
              <span>Skanuj Serial</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpenTooltipId(s.id);
                setEditingSerialSymbolId(s.id);
                setInlineSerialText("");
              }}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#cbd5e1",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
              title="Wpisz numer ręcznie"
            >
              ⌨️
            </button>
          </div>
        )}

        {/* Photos Mini Gallery */}
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2, marginTop: 2 }}>
            {photos.map((pUrl, pIdx) => (
              <div
                key={pIdx}
                style={{
                  position: "relative",
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  borderRadius: 6,
                  overflow: "hidden",
                  background: "#020617",
                  border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenPhotoUrl(pUrl);
                }}
                title="Powiększ zdjęcie"
              >
                <img src={pUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleQuickDeletePhoto(s, pIdx);
                  }}
                  style={{
                    position: "absolute",
                    top: 1,
                    right: 1,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "rgba(239,68,68,0.9)",
                    color: "#fff",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title="Usuń zdjęcie"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quick Add Photo Button */}
        <button
          type="button"
          disabled={isUploading}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpenTooltipId(s.id);
            targetQuickSymbolRef.current = s;
            if (quickPhotoFileInputRef.current) {
              quickPhotoFileInputRef.current.value = "";
              quickPhotoFileInputRef.current.click();
            }
          }}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px dashed rgba(255,255,255,0.25)",
            borderRadius: 6,
            padding: "5px 8px",
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            cursor: isUploading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            transition: "all 0.2s",
            width: "100%",
          }}
        >
          {isUploading ? (
            <span>⏳ Przesyłanie zdjęcia...</span>
          ) : (
            <>
              <span>📸</span>
              <span>{photos.length > 0 ? "Dodaj kolejne zdjęcie" : "Dodaj zdjęcie"}</span>
            </>
          )}
        </button>
      </div>
    );
  };

  const toolbarRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;


  const isAdmin = useMemo(() => {
    const role = (currentUserRole || "").toUpperCase();
    return role === "ADMIN";
  }, [currentUserRole]);

  const isAdminOrMod = useMemo(() => {
    const role = (currentUserRole || "").toUpperCase();
    return role === "ADMIN";
  }, [currentUserRole]);

  // Calculate real meters along path using planScale or worldPx (Available everywhere in module)
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


  // Load lamp types from API
  
  const resetAllToolsAndDrawing = useCallback(() => {
    setActiveSymbolType(null);
    setActiveTool(null);
    if (activeToolRef) activeToolRef.current = null;
    setDrawingCableStartSymbol(null);
    drawingCableStartSymbolRef.current = null;
    setDrawingCableWaypoints([]);
    drawingCableWaypointsRef.current = [];
    setDrawingFreeLinePoints([]);
    drawingFreeLinePointsRef.current = [];
    setDrawingKabelbahnPoints([]);
    setDrawingLedStripeStart(null);
    setDrawingGeraetBoxStart(null);
    setDrawingAbdeckungBoxStart(null);
    setDrawingRevisionCloudStart(null);
    drawingRevisionCloudStartRef.current = null;
    setEditingRouteCable(null);
    editingRouteCableRef.current = null;
    setEditingRouteWaypoints([]);
    editingRouteWaypointsRef.current = [];
    setHoverLatLng(null);
  }, []);

  const handleToggleTool = useCallback((tool: "cable_connect" | "free_line") => {
    setActiveSymbolType(null);
    setDrawingKabelbahnPoints([]);
    setDrawingLedStripeStart(null);
    setDrawingGeraetBoxStart(null);
    setHoverLatLng(null);
    setDrawingCableStartSymbol(null);
    drawingCableStartSymbolRef.current = null;
    setDrawingCableWaypoints([]);
    drawingCableWaypointsRef.current = [];
    setDrawingFreeLinePoints([]);
    drawingFreeLinePointsRef.current = [];
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

    // Global Ctrl+Z / Cmd+Z Undo Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (deletedItemsStackRef.current.length > 0) {
          e.preventDefault();
          handleUndoDelete();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadLampTypes = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await fetch(`/api/plans/${planId}/lamp-types`);
      if (res.ok) {
        const json = await res.json();
        setLampTypesData(json.lampTypes || {});
        setIsFromGlobalLibrary(!!json.isFromGlobalLibrary);
      }
    } catch {}
  }, [planId]);

  useEffect(() => {
    loadLampTypes();
  }, [loadLampTypes]);

  const handleLoadFromGlobalLibrary = async () => {
    try {
      const res = await fetch(`/api/lamp-types/library`);
      if (res.ok) {
        const json = await res.json();
        if (json.library && Object.keys(json.library).length > 0) {
          setLampTypesData(json.library);
          setIsFromGlobalLibrary(true);
          setLampTypePhotosToUpload({});
          setLampTypePhotosToRemove({});
          alert("✓ Wczytano dane z Twojej Globalnej Bazy Opraw!");
        } else {
          alert("Twoja baza opraw jest pusta. Skonfiguruj oprawy i kliknij 'Zapisz do Bazy'.");
        }
      }
    } catch (e: any) {
      alert("Błąd podczas wczytywania bazy: " + e.message);
    }
  };

  const handleSaveAsGlobalLibrary = async () => {
    setSavingLampTypes(true);
    try {
      const formData = new FormData();
      const symbolTypes = ["notlicht_lampe", "notlicht_pikto", "notlicht_pikto_gross", "warmepumpe_aussen", "warmepumpe_innen", "infrarotheizung", "geraet_box"] as const;

      for (const st of symbolTypes) {
        const entry = lampTypesData[st] || {};
        formData.append(`model_${st}`, entry.model || "");
        formData.append(`notes_${st}`, entry.notes || "");
        if (lampTypePhotosToRemove[st]) {
          formData.append(`removePhoto_${st}`, "true");
        }
        if (lampTypePhotosToUpload[st]) {
          formData.append(`photo_${st}`, lampTypePhotosToUpload[st]);
        }
      }

      formData.append("variantsJson", JSON.stringify(lampTypesData.variants || []));

      if (lampTypesData.variants) {
        for (const v of lampTypesData.variants) {
          const file = lampTypePhotosToUpload[`variant_${v.id}`];
          if (file) {
            formData.append(`photo_variant_${v.id}`, file);
          }
          if (lampTypePhotosToRemove[`variant_${v.id}`]) {
            formData.append(`removePhoto_variant_${v.id}`, "true");
          }
        }
      }

      const res = await fetch(`/api/lamp-types/library`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        setLampTypesData(json.library || {});
        setLampTypePhotosToUpload({});
        setLampTypePhotosToRemove({});
        setIsFromGlobalLibrary(true);
        alert("🌟 Pomyślnie zapisano do Twojej Globalnej Bazy Opraw! Od teraz każdy nowy i istniejący plan będzie mógł korzystać z tych opraw i zdjęć.");
      } else {
        alert("Błąd podczas zapisywania do bazy.");
      }
    } catch (e: any) {
      alert("Błąd zapisu bazy: " + e.message);
    } finally {
      setSavingLampTypes(false);
    }
  };

  const handleSaveLampTypes = async () => {
    if (!planId) return;
    setSavingLampTypes(true);
    try {
      const formData = new FormData();
      const symbolTypes = ["notlicht_lampe", "notlicht_pikto", "notlicht_pikto_gross", "warmepumpe_aussen", "warmepumpe_innen", "infrarotheizung", "geraet_box"] as const;

      for (const st of symbolTypes) {
        const entry = lampTypesData[st] || {};
        formData.append(`model_${st}`, entry.model || "");
        formData.append(`notes_${st}`, entry.notes || "");
        if (lampTypePhotosToRemove[st]) {
          formData.append(`removePhoto_${st}`, "true");
        }
        if (lampTypePhotosToUpload[st]) {
          formData.append(`photo_${st}`, lampTypePhotosToUpload[st]);
        }
      }

      // Append variants payload
      formData.append("variantsJson", JSON.stringify(lampTypesData.variants || []));
      formData.append("saveToGlobalLibrary", saveToGlobalDefault ? "true" : "false");

      // Append photos for individual variants
      if (lampTypesData.variants) {
        for (const v of lampTypesData.variants) {
          const file = lampTypePhotosToUpload[`variant_${v.id}`];
          if (file) {
            formData.append(`photo_variant_${v.id}`, file);
          }
          if (lampTypePhotosToRemove[`variant_${v.id}`]) {
            formData.append(`removePhoto_variant_${v.id}`, "true");
          }
        }
      }

      const res = await fetch(`/api/plans/${planId}/lamp-types`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        setLampTypesData(json.lampTypes || {});
        setLampTypePhotosToUpload({});
        setLampTypePhotosToRemove({});
        setLampTypesModalOpen(false);
        await loadSymbols();
      } else {
        alert("Błąd podczas zapisywania typów opraw.");
      }
    } catch (e: any) {
      alert("Błąd zapisu: " + e.message);
    } finally {
      setSavingLampTypes(false);
    }
  };

  // Load symbols from API
  const loadSymbols = useCallback(async () => {
    if (!planId) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/plans/${planId}/bma-symbols`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setSymbols(json.symbols || []);
    } catch {
      // ignore
    }
  }, [planId]);

  useEffect(() => {
    loadSymbols();
  }, [loadSymbols]);

  // Load cable connections from API
  const loadCableConnections = useCallback(async () => {
    if (!planId) return;
    const token = await getToken();
    if (!token) return;
    try {
      const url = projectId
        ? `/api/plans/${planId}/cable-connections?projectId=${encodeURIComponent(projectId)}`
        : `/api/plans/${planId}/cable-connections`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
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


  const onCountsChangeRef = useRef(onCountsChange);
  onCountsChangeRef.current = onCountsChange;

  // Notify parent of individual symbol category counts
  useEffect(() => {
    const bmaCount = symbols.filter(
      (s) => s.symbol_type === "detector_red" || s.symbol_type === "detector_blue" || s.symbol_type === "dis_signalgeber" || s.symbol_type === "sirene"
    ).length;
    const lightingCount = symbols.filter(
      (s) => s.symbol_type === "lampe" || s.symbol_type === "led_stripe"
    ).length;
    const notlichtCount = symbols.filter(
      (s) => s.symbol_type === "notlicht_lampe" || s.symbol_type === "notlicht_pikto"
    ).length;
    const kabelbahnCount = symbols.filter((s) => s.symbol_type === "kabelbahn").length;
    const kabelauslassCount = symbols.filter((s) => s.symbol_type === "kabelauslass").length;
    const heatingCount = symbols.filter(
      (s) => s.symbol_type === "warmepumpe_aussen" || s.symbol_type === "warmepumpe_innen" || s.symbol_type === "infrarotheizung" || s.symbol_type === "geraet_box"
    ).length;
    const abdeckungCount = symbols.filter((s) => s.symbol_type === "abdeckung_box").length;
    const anderungenCount = symbols.filter((s) => s.symbol_type === "revision_cloud").length;

    onCountsChangeRef.current?.({
      bma: bmaCount,
      lighting: lightingCount,
      notlicht: notlichtCount,
      kabelbahn: kabelbahnCount,
      kabelauslass: kabelauslassCount,
      heating: heatingCount,
      abdeckung: abdeckungCount,
      anderungen: anderungenCount,
    });
  }, [symbols]);

  const isSymbolTypeVisible = useCallback(
    (type: BmaSymbolType) => {
      // If currently placing this exact type, always keep it visible
      if (activeSymbolType === type) return true;
      if (!layersVisibility) return true;
      if (type === "detector_red" || type === "detector_blue" || type === "dis_signalgeber" || type === "sirene") {
        return !!layersVisibility.bma;
      }
      if (type === "lampe" || type === "led_stripe") {
        return !!layersVisibility.lighting;
      }
      if (type === "notlicht_lampe" || type === "notlicht_pikto" || type === "notlicht_pikto_gross") {
        return !!layersVisibility.notlicht;
      }
      if (type === "warmepumpe_aussen" || type === "warmepumpe_innen" || type === "infrarotheizung" || type === "geraet_box" || type === "temperaturfuehler") {
        return layersVisibility.heating !== undefined ? !!layersVisibility.heating : !!layersVisibility.lighting;
      }
      if (type === "kabelbahn") {
        return !!layersVisibility.kabelbahn;
      }
      if (type === "kabelauslass") {
        return !!layersVisibility.kabelauslass;
      }
      if (type === "abdeckung_box") {
        return layersVisibility.abdeckung !== undefined ? !!layersVisibility.abdeckung : true;
      }
      if (type === "revision_cloud") {
        return layersVisibility.anderungen !== undefined ? !!layersVisibility.anderungen : true;
      }
      return true;
    },
    [layersVisibility, activeSymbolType]
  );

  // Sync active placement state to map & window
  useEffect(() => {
    const isPlacing = !!activeSymbolType;
    if (map) (map as any)._isBmaPlacing = isPlacing;
    if (typeof window !== "undefined") (window as any)._isBmaPlacing = isPlacing;
    return () => {
      if (map) (map as any)._isBmaPlacing = false;
      if (typeof window !== "undefined") (window as any)._isBmaPlacing = false;
    };
  }, [map, activeSymbolType]);

  // Finish Kabelbahn drawing and save to DB
  const handleFinishKabelbahn = useCallback(async () => {
    if (drawingKabelbahnPoints.length < 2 || saving) return;
    setSaving(true);
    const token = await getToken();
    if (!token) { setSaving(false); return; }

    const pts = [...drawingKabelbahnPoints];
    const kbCount = symbols.filter((s) => s.symbol_type === "kabelbahn").length + 1;
    const label = `KB ${kbCount}`;

    try {
      const res = await fetch(`/api/plans/${planId}/bma-symbols`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          symbol_type: "kabelbahn",
          x_norm: pts[0].x_norm,
          y_norm: pts[0].y_norm,
          label,
          description: JSON.stringify({ points: pts, width_px: 16 }),
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (json.symbol) {
        setSymbols((prev) => [...prev, json.symbol]);
      }
    } catch (err) {
      console.error("Failed to save kabelbahn", err);
    } finally {
      setSaving(false);
      setDrawingKabelbahnPoints([]);
      setHoverLatLng(null);
      setActiveSymbolType(null);
    }
  }, [drawingKabelbahnPoints, saving, planId, symbols]);

  // Keyboard shortcut listener (ESC, Enter, Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetAllToolsAndDrawing();
        setOpenTooltipId(null);
        setFullscreenPhotoUrl(null);
        setSelectedCableId(null);
        setEditingSymbol(null);
        setModalCoords(null);
        setPaletteOpen(false);
        setCableModalOpen(false);
        setLampTypesModalOpen(false);
        setSchemaAddModalOpen(false);
        setShowAddDeviceType(false);
        setEditingVariantId(null);
      } else if (e.key === "Enter") {
        if (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length >= 2) {
          e.preventDefault();
          handleFinishKabelbahn();
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length > 0) {
          e.preventDefault();
          setDrawingKabelbahnPoints((prev) => prev.slice(0, -1));
        } else if (activeSymbolType === "led_stripe" && drawingLedStripeStart) {
          e.preventDefault();
          setDrawingLedStripeStart(null);
        } else if (activeSymbolType === "geraet_box" && drawingGeraetBoxStart) {
          e.preventDefault();
          setDrawingGeraetBoxStart(null);
        } else if (activeSymbolType === "abdeckung_box" && drawingAbdeckungBoxStart) {
          e.preventDefault();
          setDrawingAbdeckungBoxStart(null);
        } else if (activeSymbolType === "revision_cloud" && drawingRevisionCloudStart) {
          e.preventDefault();
          setDrawingRevisionCloudStart(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSymbolType, drawingKabelbahnPoints, drawingLedStripeStart, handleFinishKabelbahn, resetAllToolsAndDrawing]);

  // Helper conversions
  const latLngToNormCoords = useCallback(
    (latlng: any) => {
      const p = CRS.latLngToPoint(latlng, meta.maxZoom);
      const x_norm = Math.max(0, Math.min(1, p.x / worldPxW));
      const y_norm = Math.max(0, Math.min(1, p.y / worldPxH));
      return { x_norm, y_norm };
    },
    [meta.maxZoom, worldPxW, worldPxH]
  );

  const normCoordsToLatLng = useCallback(
    (x_norm: number, y_norm: number) => {
      return CRS.pointToLatLng(L.point(x_norm * worldPxW, y_norm * worldPxH), meta.maxZoom);
    },
    [meta.maxZoom, worldPxW, worldPxH]
  );

  const [currentZoom, setCurrentZoom] = useState<number>(2);
  const [bmaVisibilityMode, setBmaVisibilityMode] = useState<"normal" | "dimmed" | "hidden">("normal");

  // Smart helper: find the next consecutive circuit & address for a symbol type
  const getNextSymbolDetails = useCallback(
    (type: BmaSymbolType) => {
      const isEmergency = BMA_SYMBOLS_CONFIG[type]?.isEmergency;
      const isLight = type === "lampe";
      const isStripe = type === "led_stripe";
      const isOutlet = type === "kabelauslass";
      const isBma =
        type === "detector_red" || type === "detector_blue" || type === "dis_signalgeber" || type === "sirene";
      const isRevisionCloud = type === "revision_cloud";

      if (isRevisionCloud) {
        return {
          loop: "",
          address: "1",
          label: "Hinweis",
        };
      }

      if (isOutlet) {
        const existingOutlets = symbols.filter((s) => s.symbol_type === "kabelauslass");
        let maxNum = 0;
        for (const s of existingOutlets) {
          const parsed = parseInt(s.address || s.label?.replace(/\D/g, "") || "0", 10);
          if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
        }
        const nextNum = maxNum + 1;
        return {
          loop: "",
          address: String(nextNum),
          label: `KA ${nextNum}`,
        };
      }

      if (isStripe) {
        const existingStripes = symbols.filter((s) => s.symbol_type === "led_stripe");
        const lastStripe = existingStripes[existingStripes.length - 1];
        const targetLoop = (lastStripe?.loop_number || "1").trim();
        const inCircuit = existingStripes.filter(
          (s) => (s.loop_number || "1").trim() === targetLoop
        );
        let maxNum = 0;
        for (const s of inCircuit) {
          const parsed = parseInt(s.address || s.label?.replace(/\D/g, "") || "0", 10);
          if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
        }
        const nextNum = maxNum + 1;
        return {
          loop: targetLoop,
          address: String(nextNum),
          label: `LED ${targetLoop ? targetLoop + "/" : ""}${nextNum}`,
        };
      }

      if (isLight) {
        return {
          loop: "",
          address: "",
          label: "",
        };
      }

      if (isEmergency) {
        const existingEmergency = symbols.filter(
          (s) => BMA_SYMBOLS_CONFIG[s.symbol_type]?.isEmergency || s.symbol_type === "lampe"
        );
        const lastEmergency = existingEmergency[existingEmergency.length - 1];
        let targetLoop = (lastEmergency?.loop_number || "").trim();
        if (!targetLoop && lastEmergency?.label) {
          const parts = lastEmergency.label.replace(/^L\s*/, "").split("/");
          targetLoop = parts[0]?.trim() || "";
        }
        if (!targetLoop) targetLoop = "1";

        const inCircuit = existingEmergency.filter((s) => {
          const sLoop = (s.loop_number || "").trim() || (s.label?.replace(/^L\s*/, "").split("/")[0]?.trim() || "1");
          return sLoop.toLowerCase() === targetLoop.toLowerCase();
        });

        let maxNum = 0;
        for (const s of inCircuit) {
          let addrStr = (s.address || "").trim();
          if (!addrStr && s.label) {
            const parts = s.label.replace(/^L\s*/, "").split("/");
            addrStr = parts[1]?.trim() || "";
          }
          const parsed = parseInt(addrStr || s.label?.replace(/\D/g, "") || "0", 10);
          if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
        }
        const nextNum = maxNum + 1;
        return {
          loop: targetLoop,
          address: String(nextNum),
          label: `${targetLoop}/${nextNum}`,
        };
      }

      if (isBma) {
        const existingBma = symbols.filter(
          (s) =>
            s.symbol_type === "detector_red" ||
            s.symbol_type === "detector_blue" ||
            s.symbol_type === "dis_signalgeber" ||
            s.symbol_type === "sirene"
        );
        const lastBma = existingBma[existingBma.length - 1];
        let targetLoop = (lastBma?.loop_number || "").trim();
        if (!targetLoop && lastBma?.label) {
          const parts = lastBma.label.split("/");
          targetLoop = parts[0]?.trim() || "";
        }
        if (!targetLoop) targetLoop = "1";

        const inCircuit = existingBma.filter((s) => {
          const sLoop = (s.loop_number || "").trim() || (s.label?.split("/")[0]?.trim() || "1");
          return sLoop.toLowerCase() === targetLoop.toLowerCase();
        });

        let maxNum = 0;
        for (const s of inCircuit) {
          let addrStr = (s.address || "").trim();
          if (!addrStr && s.label) {
            const parts = s.label.split("/");
            addrStr = parts[1]?.trim() || "";
          }
          const parsed = parseInt(addrStr || s.label?.replace(/\D/g, "") || "0", 10);
          if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
        }
        const nextNum = maxNum + 1;
        return {
          loop: targetLoop,
          address: String(nextNum),
          label: `${targetLoop}/${nextNum}`,
        };
      }

      const isHeating = BMA_SYMBOLS_CONFIG[type]?.isHeating || type === "geraet_box";
      if (isHeating) {
        const sameTypeSymbols = symbols.filter((s) => s.symbol_type === type);
        let maxNum = 0;
        for (const s of sameTypeSymbols) {
          const parsed = parseInt(s.address || s.label?.replace(/\D/g, "") || "0", 10);
          if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
        }
        const nextNum = maxNum + 1;
        const pfx = BMA_SYMBOLS_CONFIG[type]?.defaultPrefix || "G";
        return {
          loop: "",
          address: String(nextNum),
          label: `${pfx} ${nextNum}`,
        };
      }

      const sameTypeSymbols = symbols.filter((s) => s.symbol_type === type);
      const nextNum = sameTypeSymbols.length + 1;
      return {
        loop: "1",
        address: String(nextNum),
        label: `1/${nextNum}`,
      };
    },
    [symbols]
  );

  const getNextAddressForCircuit = useCallback(
    (type: BmaSymbolType, loop: string) => {
      const isEmergency = BMA_SYMBOLS_CONFIG[type]?.isEmergency;
      const isLight = type === "lampe";
      const isStripe = type === "led_stripe";
      const isBma =
        type === "detector_red" || type === "detector_blue" || type === "dis_signalgeber" || type === "sirene";

      const relevant = symbols.filter((s) => {
        if (isEmergency) return BMA_SYMBOLS_CONFIG[s.symbol_type]?.isEmergency || s.symbol_type === "lampe";
        if (isLight) return s.symbol_type === "lampe" || BMA_SYMBOLS_CONFIG[s.symbol_type]?.isEmergency;
        if (isStripe) return s.symbol_type === "led_stripe";
        if (isBma)
          return (
            s.symbol_type === "detector_red" ||
            s.symbol_type === "detector_blue" ||
            s.symbol_type === "dis_signalgeber" ||
            s.symbol_type === "sirene"
          );
        return s.symbol_type === type;
      });

      const inLoop = relevant.filter((s) => {
        const sLoop = (s.loop_number || "").trim() || (s.label?.replace(/^L\s*/, "").split("/")[0]?.trim() || "1");
        return sLoop.toLowerCase() === loop.trim().toLowerCase();
      });

      let maxNum = 0;
      for (const s of inLoop) {
        let addrStr = (s.address || "").trim();
        if (!addrStr && s.label) {
          const parts = s.label.replace(/^L\s*/, "").split("/");
          addrStr = parts[1]?.trim() || "";
        }
        const parsed = parseInt(addrStr || s.label?.replace(/\D/g, "") || "0", 10);
        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
      }
      return maxNum + 1;
    },
    [symbols]
  );

  // Direct symbol creation helper (used for tools that don't need modal attribute configuration)
  const handleCreateSymbolDirectly = async (data: {
    symbol_type: BmaSymbolType;
    x_norm: number;
    y_norm: number;
    description?: string;
    label?: string;
    loop_number?: string;
    address?: string;
  }) => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/plans/${planId}/bma-symbols`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          symbol_type: data.symbol_type,
          x_norm: data.x_norm,
          y_norm: data.y_norm,
          loop_number: data.loop_number || null,
          address: data.address || null,
          label: data.label || null,
          description: data.description || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (json.symbol) {
        setSymbols((prev) => [...prev, json.symbol]);
      }
    } catch (err) {
      console.error("Failed to create symbol directly", err);
    }
  };

  // Map clicks and zoom tracking
  function MapEventsHandler() {
    const map = useMapEvents({
      zoomend: () => {
        setCurrentZoom(map.getZoom());
      },
      mousemove: (e: any) => {
        if (
          (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length > 0) ||
          (activeSymbolType === "led_stripe" && drawingLedStripeStart) ||
          (activeSymbolType === "geraet_box" && drawingGeraetBoxStart) ||
          (activeSymbolType === "abdeckung_box" && drawingAbdeckungBoxStart) ||
          (activeTool === "cable_connect" && drawingCableStartSymbol) ||
          (activeTool === "free_line" && drawingFreeLinePoints.length > 0) ||
          editingRouteCable
        ) {
          setHoverLatLng(e.latlng);
        }
      },
      click: (e: any) => {
        if ((!activeSymbolType && !activeTool && !editingRouteCable) || !isAdminOrMod) return;

        if (e.originalEvent) {
          e.originalEvent._bmaHandled = true;
          e.originalEvent.stopImmediatePropagation?.();
          e.originalEvent.stopPropagation?.();
          e.originalEvent.preventDefault?.();
        }
        (e as any)._bmaHandled = true;

        // Handle click while redrawing existing cable route
        if (editingRouteCable) {
          let { x_norm, y_norm } = latLngToNormCoords(e.latlng);
          const routeMeta = editingRouteCable.metadata || {};
          const s1 = symbols.find((s) => s.id === routeMeta.source_symbol_id);
          const c1 = s1 ? getSymbolConnectionPoint(s1) : (editingRouteWaypoints[0] || { x_norm: 0.5, y_norm: 0.5 });
          const prevNorm = editingRouteWaypoints.length > 0 ? editingRouteWaypoints[editingRouteWaypoints.length - 1] : c1;
          const snapped = snapOrtho(prevNorm, { x_norm, y_norm }, true);
          x_norm = snapped.x_norm;
          y_norm = snapped.y_norm;

          // Check if clicked target device B
          const sTarget = symbols.find((s) => s.id === routeMeta.target_symbol_id);
          let clickedTarget = false;
          if (sTarget) {
            const centerT = getSymbolConnectionPoint(sTarget);
            const dx = (centerT.x_norm - x_norm) * worldPxW;
            const dy = (centerT.y_norm - y_norm) * worldPxH;
            if (Math.sqrt(dx * dx + dy * dy) < 0.05 * worldPxW) {
              clickedTarget = true;
            }
          }

          if (clickedTarget) {
            handleSaveEditedRoute();
            return;
          }

          setEditingRouteWaypoints((prev) => [...prev, { x_norm, y_norm }]);
          return;
        }

        const { x_norm, y_norm } = latLngToNormCoords(e.latlng);

        // If Kabelbahn drawing mode is active: add point to polyline
        if (activeSymbolType === "kabelbahn") {
          setDrawingKabelbahnPoints((prev) => [...prev, { x_norm, y_norm }]);
          return;
        }

        

        // Geometric Device Finder: detects if click occurred on or near any device.
        // Returns the NEAREST matching symbol (not just the first in list order).
        const findClickedDevice = (clickX: number, clickY: number) => {
          let bestCandidate: typeof symbols[0] | null = null;
          let bestDist = Infinity;

          for (const s of symbols) {
            if (!isSymbolTypeVisible(s.symbol_type)) continue;

            if (s.symbol_type === "geraet_box" || s.symbol_type === "led_stripe") {
              let w_norm = 0.06;
              let h_norm = 0.035;
              try {
                const parsed = JSON.parse(s.description || "{}");
                if (typeof parsed.w_norm === "number") w_norm = parsed.w_norm;
                if (typeof parsed.h_norm === "number") h_norm = parsed.h_norm;
              } catch {}
              const cx = s.x_norm + w_norm / 2;
              const cy = s.y_norm + h_norm / 2;
              if (
                clickX >= s.x_norm - 0.01 &&
                clickX <= s.x_norm + w_norm + 0.01 &&
                clickY >= s.y_norm - 0.01 &&
                clickY <= s.y_norm + h_norm + 0.01
              ) {
                const dxPx = (cx - clickX) * worldPxW;
                const dyPx = (cy - clickY) * worldPxH;
                const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
                if (distPx < bestDist) {
                  bestDist = distPx;
                  bestCandidate = s;
                }
              }
            } else {
              const dx = (s.x_norm - clickX) * worldPxW;
              const dy = (s.y_norm - clickY) * worldPxH;
              const distPx = Math.sqrt(dx * dx + dy * dy);
              if (distPx <= 40 && distPx < bestDist) {
                bestDist = distPx;
                bestCandidate = s;
              }
            }
          }
          return bestCandidate;
        };

        // Active Cable Connection Tool
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
              const startCenter = getSymbolCenter(currentStart);
              const endCenter = getSymbolCenter(clickedDev);
              const pts = [
                { x_norm: startCenter.x_norm, y_norm: startCenter.y_norm },
                ...currentWaypoints,
                { x_norm: endCenter.x_norm, y_norm: endCenter.y_norm },
              ];
              const len = calculatePathLengthMeters(pts);
              setCableModalSource({ id: currentStart.id, label: currentStart.label || "Gerät A", plan_id: planId });
              setCableModalTarget({ id: clickedDev.id, label: clickedDev.label || "Gerät B", plan_id: planId });
              const orthoWaypoints = (currentWaypoints.length === 0 && Math.abs(startCenter.x_norm - endCenter.x_norm) > 0.001 && Math.abs(startCenter.y_norm - endCenter.y_norm) > 0.001)
                ? [{ x_norm: endCenter.x_norm, y_norm: startCenter.y_norm }]
                : currentWaypoints;
              setCableModalWaypoints(orthoWaypoints);
              setCableModalIsFreeLine(false);
              setCableNumberInput(getNextUniqueCableNumber("K"));
              const startName1 = currentStart.label || getSymbolName(currentStart.symbol_type);
              setCableDescInput(startName1 ? `Zuleitung ${startName1}` : "Zuleitung");
              setCableLengthCalculated(len);
              setCableModalOpen(true);
              return;
            }
          }

          // If no device clicked, but we already have a start symbol -> add intermediate waypoint (with Shift snap)
          if (currentStart) {
            const lastPt = currentWaypoints.length > 0
              ? currentWaypoints[currentWaypoints.length - 1]
              : { x_norm: currentStart.x_norm, y_norm: currentStart.y_norm };
            const snapped = snapOrtho(lastPt, { x_norm, y_norm }, true);
            setDrawingCableWaypoints((prev) => [...prev, snapped]);
            return;
          }
          return;
        }


        // Active Free Line & PE Line: click on map adds custom point freely (user finishes manually via double-click / finish button)
        if (currentTool === "free_line" || currentTool === "pe_line") {
          const pt = { x_norm, y_norm };
          const currentPts = drawingFreeLinePointsRef.current || drawingFreeLinePoints;
          
          if (currentPts.length === 0) {
            setCableModalSource(null);
            setDrawingFreeLinePoints([pt]);
            drawingFreeLinePointsRef.current = [pt];
          } else {
            // Check double-click: if new point is very close to last point, finish the line
            const lastPt = currentPts[currentPts.length - 1];
            const dx = Math.abs(pt.x_norm - lastPt.x_norm);
            const dy = Math.abs(pt.y_norm - lastPt.y_norm);
            if (dx < 0.005 && dy < 0.005 && currentPts.length >= 2) {
              // Double-click detected: finish free line
              handleFinishFreeLineRef.current?.();
              return;
            }
            const snapped = snapOrtho(lastPt, pt, true);
            const allPts = [...currentPts, snapped];
            setDrawingFreeLinePoints(allPts);
            drawingFreeLinePointsRef.current = allPts;
          }
          return;
        }

        // If LED Stripe drawing mode is active: click 1 sets corner 1, click 2 finishes rectangle
        if (activeSymbolType === "led_stripe") {
          if (!drawingLedStripeStart) {
            setDrawingLedStripeStart({ x_norm, y_norm });
            return;
          } else {
            const start = drawingLedStripeStart;
            setDrawingLedStripeStart(null);
            setHoverLatLng(null);

            const x_min = Math.min(start.x_norm, x_norm);
            const y_min = Math.min(start.y_norm, y_norm);
            const w_norm = Math.max(0.003, Math.abs(x_norm - start.x_norm));
            const h_norm = Math.max(0.003, Math.abs(y_norm - start.y_norm));

            const details = getNextSymbolDetails("led_stripe");
            setLoopInput(details.loop);
            setAddressInput(details.address);
            setLabelInput(details.label);
            setDescriptionInput(JSON.stringify({ w_norm, h_norm, desc: "" }));

            setModalCoords({
              x_norm: x_min,
              y_norm: y_min,
              symbol_type: "led_stripe",
            });
            setActiveSymbolType(null);
            return;
          }
        }

        // If Abdeckung Box (Masking Cover Rectangle) drawing mode is active: click 1 sets corner 1, click 2 saves white rectangle directly (no modal!)
        if (activeSymbolType === "abdeckung_box") {
          if (!drawingAbdeckungBoxStart) {
            setDrawingAbdeckungBoxStart({ x_norm, y_norm });
            return;
          } else {
            const start = drawingAbdeckungBoxStart;
            setDrawingAbdeckungBoxStart(null);
            setHoverLatLng(null);

            const x_min = Math.min(start.x_norm, x_norm);
            const y_min = Math.min(start.y_norm, y_norm);
            const w_norm = Math.max(0.003, Math.abs(x_norm - start.x_norm));
            const h_norm = Math.max(0.003, Math.abs(y_norm - start.y_norm));

            handleCreateSymbolDirectly({
              symbol_type: "abdeckung_box",
              x_norm: x_min,
              y_norm: y_min,
              description: JSON.stringify({ w_norm, h_norm, desc: "Abdeckung" }),
            });
            setActiveSymbolType(null);
            return;
          }
        }

        // If Revision Cloud (Änderungs-Wolke) drawing mode is active: click 1 sets corner 1, click 2 sets corner 2 & saves directly onto the map
        if (activeSymbolType === "revision_cloud") {
          if (!drawingRevisionCloudStart) {
            setDrawingRevisionCloudStart({ x_norm, y_norm });
            return;
          } else {
            const start = drawingRevisionCloudStart;
            setDrawingRevisionCloudStart(null);
            setHoverLatLng(null);

            const x_min = Math.min(start.x_norm, x_norm);
            const y_min = Math.min(start.y_norm, y_norm);
            const w_norm = Math.max(0.003, Math.abs(x_norm - start.x_norm));
            const h_norm = Math.max(0.003, Math.abs(y_norm - start.y_norm));

            const cloudDetails = getNextSymbolDetails("revision_cloud");

            handleCreateSymbolDirectly({
              x_norm: x_min,
              y_norm: y_min,
              symbol_type: "revision_cloud",
              label: cloudDetails.label,
              description: JSON.stringify({ w_norm, h_norm, desc: "" }),
            });
            setActiveSymbolType(null);
            return;
          }
        }
        if (!activeSymbolType) return;
        const details = getNextSymbolDetails(activeSymbolType);
        setLoopInput(details.loop);
        setAddressInput(details.address);
        setLabelInput(details.label);
        setDescriptionInput("");
        setSerialNumberInput("");
        setPhotosInput([]);
        setArrowDirection("right");
        setGeraetSize("normal");

        setModalCoords({
          x_norm,
          y_norm,
          symbol_type: activeSymbolType,
        });

        setSelectedVariantId("");
        setActiveSymbolType(null);
      },
    });

    useEffect(() => {
      if (map) setCurrentZoom(map.getZoom());
    }, [map]);

    return null;
  }

  // Open edit modal for an existing symbol
  const handleOpenEditSymbol = (s: BmaSymbolRow) => {
    setEditingSymbol(s);
    setModalCoords(null);
    setLoopInput(s.loop_number || "");
    setAddressInput(s.address || "");
    setLabelInput(s.label || "");

    let initVarId = "";
    let initPowerKw = "";
    let initSerial = "";
    let initPhotos: string[] = [];
    if (s.description) {
      try {
        const parsed = JSON.parse(s.description);
        if (parsed.serial_number || parsed.serialNumber) initSerial = String(parsed.serial_number || parsed.serialNumber);
        if (Array.isArray(parsed.photos)) initPhotos = parsed.photos;
        if (lampTypesData.variants && lampTypesData.variants.length > 0) {
          const isHeating = s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
          const found = lampTypesData.variants.find((v) => {
            const vIsHeating = v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box';
            if (isHeating !== vIsHeating) return false;
            if (v.category && v.category !== s.symbol_type && !(v.category === 'geraet_box' && s.symbol_type === 'geraet_box')) return false;
            if (parsed.variantId && v.id === parsed.variantId) return true;
            if (parsed.variantName && v.name === parsed.variantName) return true;
            if (parsed.variantModel && v.model && v.model === parsed.variantModel) return true;
            return false;
          });
          if (found) {
            initVarId = found.id;
          } else if (parsed.variantId) {
            initVarId = parsed.variantId;
          }
        } else if (parsed.variantId) {
          initVarId = parsed.variantId;
        }
        if (parsed.powerKw) initPowerKw = parsed.powerKw;
        if (parsed.zuleitung) setZuleitungInput(parsed.zuleitung);
        else setZuleitungInput("");
      } catch {}
    }
    setSelectedVariantId(initVarId);
    setPowerKwInput(initPowerKw);
    setSerialNumberInput(initSerial);
    setPhotosInput(initPhotos);

    if (s.symbol_type === "led_stripe" && s.description?.startsWith("{")) {
      try {
        const parsed = JSON.parse(s.description);
        setDescriptionInput(parsed.desc || "");
      } catch {
        setDescriptionInput(s.description || "");
      }
    } else if (s.symbol_type === "notlicht_pikto" || s.symbol_type === "notlicht_pikto_gross") {
      setArrowDirection(getPiktoDirection(s.description));
      try {
        if (s.description?.startsWith("{")) {
          const parsed = JSON.parse(s.description);
          setDescriptionInput(parsed.desc || "");
        } else {
          setDescriptionInput(s.description === "left" || s.description === "right" || s.description === "down" || s.description === "up" ? "" : s.description || "");
        }
      } catch {
        setDescriptionInput(s.description || "");
      }
    } else {
      try {
        if (s.description?.startsWith("{")) {
          const parsed = JSON.parse(s.description);
          setDescriptionInput(parsed.desc || "");
        } else {
          setDescriptionInput(s.description || "");
        }
      } catch {
        setDescriptionInput(s.description || "");
      }
    }
    setOpenTooltipId(null);
  };

  // Live duplicate warning for Notlicht / BMA / Leuchten
  const duplicateWarning = useMemo(() => {
    const symbolType = modalCoords ? modalCoords.symbol_type : editingSymbol?.symbol_type;
    if (!symbolType) return null;

    const trimmedLoop = loopInput.trim();
    const trimmedAddress = addressInput.trim();
    if (!trimmedLoop || !trimmedAddress) return null;

    const isEmergency = BMA_SYMBOLS_CONFIG[symbolType]?.isEmergency;
    const isLight = symbolType === "lampe" || symbolType === "led_stripe";
    const isBma = symbolType === "detector_red" || symbolType === "detector_blue" || symbolType === "dis_signalgeber" || symbolType === "sirene";

    const otherSymbols = symbols.filter((s) => {
      if (editingSymbol && s.id === editingSymbol.id) return false;
      return true;
    });

    if (isEmergency || isLight) {
      const found = otherSymbols.find(
        (s) =>
          (s.symbol_type === symbolType || (isEmergency && BMA_SYMBOLS_CONFIG[s.symbol_type]?.isEmergency)) &&
          (s.loop_number || "").trim().toLowerCase() === trimmedLoop.toLowerCase() &&
          (s.address || "").trim().toLowerCase() === trimmedAddress.toLowerCase()
      );
      if (found) {
        const warnTpl = t(
          "planBma",
          "duplicateWarning",
          "⚠️ Uwaga: Lampa awaryjna z obwodem '{loop}' i numerem '{address}' już istnieje na tym planie!"
        );
        return warnTpl.replace("{loop}", trimmedLoop).replace("{address}", trimmedAddress);
      }
    } else if (isBma) {
      const found = otherSymbols.find(
        (s) =>
          (s.symbol_type === "detector_red" || s.symbol_type === "detector_blue" || s.symbol_type === "dis_signalgeber" || s.symbol_type === "sirene") &&
          (s.loop_number || "").trim().toLowerCase() === trimmedLoop.toLowerCase() &&
          (s.address || "").trim().toLowerCase() === trimmedAddress.toLowerCase()
      );
      if (found) {
        const warnTpl = t(
          "planBma",
          "duplicateWarningBma",
          "⚠️ Uwaga: Czujka z pętlą '{loop}' i adresem '{address}' już istnieje na tym planie!"
        );
        return warnTpl.replace("{loop}", trimmedLoop).replace("{address}", trimmedAddress);
      }
    }

    return null;
  }, [modalCoords, editingSymbol, loopInput, addressInput, symbols, t]);

  
  // Save cable connection
  
  
  // Fetch project plans for cross-plan connections
  const fetchProjectPlansAndDevices = useCallback(async () => {
    if (!projectId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/projects/${projectId}/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const plans = json.plans || json.data || [];
        setAllProjectPlans(plans.map((p: any) => ({ id: p.id, title: p.name || p.title || `Plan v${p.version}` })));
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


  
  // Global ESC key to cancel any active drawing mode, close open tooltips and photo lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetAllToolsAndDrawing();
        setOpenTooltipId(null);
        setFullscreenPhotoUrl(null);
        setSelectedCableId(null);
        setEditingSymbol(null);
        setModalCoords(null);
        setPaletteOpen(false);
        setCableModalOpen(false);
        setLampTypesModalOpen(false);
        setSchemaAddModalOpen(false);
        setShowAddDeviceType(false);
        setEditingVariantId(null);
      } else if (e.key === "Enter") {
        if (activeTool === "free_line" && drawingFreeLinePoints.length >= 2) {
          handleFinishFreeLine();
        } else if (activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length >= 2) {
          handleFinishKabelbahn();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, activeSymbolType, drawingFreeLinePoints.length, drawingKabelbahnPoints.length, resetAllToolsAndDrawing]);

  // Unified handler for clicking any device/symbol on the map (Point symbols, GeraetBox, LedStripe, etc.)
  const handleDeviceClick = useCallback(
    (s: BmaSymbolRow, e?: any) => {
      if (e?.originalEvent) e.originalEvent.stopPropagation();
      if (e?.stopPropagation) e.stopPropagation();

      const currentTool = activeToolRef.current || activeTool;
      const currentStart = drawingCableStartSymbolRef.current || drawingCableStartSymbol;
      const currentWaypoints = drawingCableWaypointsRef.current || drawingCableWaypoints;
      const currentFreePoints = drawingFreeLinePointsRef.current || drawingFreeLinePoints;

      // Handle Free Line & PE Line click on a device
      if (currentTool === "free_line" || currentTool === "pe_line") {
        const pt = { x_norm: s.x_norm, y_norm: s.y_norm };
        if (currentFreePoints.length === 0) {
          // Snap start to this device
          setCableModalSource({ id: s.id, label: s.label || getSymbolName(s.symbol_type), plan_id: planId });
          setDrawingFreeLinePoints([pt]);
          drawingFreeLinePointsRef.current = [pt];
        } else {
          // Snap end to this device and finish line
          const allPts = [...currentFreePoints, pt];
          setCableModalTarget({ id: s.id, label: s.label || getSymbolName(s.symbol_type), plan_id: planId });
          setDrawingFreeLinePoints(allPts);
          drawingFreeLinePointsRef.current = allPts;
          const len = calculatePathLengthMeters(allPts);
          setCableModalWaypoints(allPts);
          setCableModalIsFreeLine(true);
          if (currentTool === "pe_line") {
            setCableNumberInput(getNextUniqueCableNumber("PE"));
            setCableTypeInput("Potenzialausgleich (PE)");
            setCableColorInput("#16a34a");
            setCableDescInput(t("planBma", "peLineTitle", "Potenzialausgleich (PE)"));
          } else {
            setCableNumberInput(getNextUniqueCableNumber("L"));
            setCableColorInput("#0284c7");
            const startName3 = cableModalSource?.label || (cableModalSource ? getSymbolName((cableModalSource as any).symbol_type || "detector_blue") : "");
            setCableDescInput(startName3 ? `Zuleitung ${startName3}` : "Zuleitung");
          }
          setCableLengthCalculated(len);

          // Clear active drawing state immediately so next line starts fresh
          setDrawingFreeLinePoints([]);
          drawingFreeLinePointsRef.current = [];

          setCableModalOpen(true);
        }
        return;
      }

      // If Cable Connect tool is active: clicking symbol handles start / target selection
      if (currentTool === "cable_connect") {
        if (!currentStart) {
          setDrawingCableStartSymbol(s);
          drawingCableStartSymbolRef.current = s;
          return;
        } else if (currentStart.id !== s.id) {
          // Finish connection to 2nd device!
          const startCenter = getSymbolCenter(currentStart);
          const endCenter = getSymbolCenter(s);
          const pts = [
            { x_norm: startCenter.x_norm, y_norm: startCenter.y_norm },
            ...currentWaypoints,
            { x_norm: endCenter.x_norm, y_norm: endCenter.y_norm },
          ];
          const len = calculatePathLengthMeters(pts);
          setCableModalSource({ id: currentStart.id, label: currentStart.label || "Gerät A", plan_id: planId });
          setCableModalTarget({ id: s.id, label: s.label || "Gerät B", plan_id: planId });
          setCableModalWaypoints(currentWaypoints);
          setCableModalIsFreeLine(false);
          setCableNumberInput(getNextUniqueCableNumber("K"));
          const startName4 = currentStart.label || getSymbolName(currentStart.symbol_type);
          setCableDescInput(startName4 ? `Zuleitung ${startName4}` : "Zuleitung");
          setCableLengthCalculated(len);
          setCableModalOpen(true);
          return;
        }
      }

      if (activeSymbolType || activeTool) return;
      setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
    },
    [activeTool, drawingCableStartSymbol, drawingCableWaypoints, drawingFreeLinePoints, calculatePathLengthMeters, planId, cableConnections, activeSymbolType, cableModalSource]
  );

  const handleFinishFreeLine = () => {
    const pts = [...drawingFreeLinePointsRef.current];
    if (pts.length < 2) {
      setActiveTool(null);
      setDrawingFreeLinePoints([]);
      drawingFreeLinePointsRef.current = [];
      return;
    }
    const len = calculatePathLengthMeters(pts);
    setCableModalSource(cableModalSource);
    setCableModalTarget(cableModalTarget);
    setCableModalWaypoints([...pts]);
    setCableModalIsFreeLine(true);

    const isPe = activeToolRef.current === "pe_line" || activeTool === "pe_line";
    if (isPe) {
      setCableNumberInput(getNextUniqueCableNumber("PE"));
      setCableTypeInput("Potenzialausgleich (PE)");
      setCableColorInput("#16a34a");
      setCableDescInput(t("planBma", "peLineTitle", "Potenzialausgleich (PE)"));
    } else {
      setCableNumberInput(getNextUniqueCableNumber("L"));
      setCableColorInput("#0284c7");
      const startName5 = cableModalSource?.label || (cableModalSource ? getSymbolName((cableModalSource as any).symbol_type || "detector_blue") : "");
      setCableDescInput(startName5 ? `Zuleitung ${startName5}` : "Zuleitung");
    }
    setCableLengthCalculated(len);

    // Clear active drawing state immediately so next free line starts completely fresh
    setDrawingFreeLinePoints([]);
    drawingFreeLinePointsRef.current = [];
    setDrawingCableStartSymbol(null);
    drawingCableStartSymbolRef.current = null;
    setDrawingCableWaypoints([]);
    drawingCableWaypointsRef.current = [];

    setCableModalOpen(true);
  };
  // Wire ref so child components (MapEventsHandler) can call this without stale closures
  handleFinishFreeLineRef.current = handleFinishFreeLine;

    // Open modal to edit existing cable connection or free line
  const handleOpenEditCable = (conn: CableConnectionRow) => {
    const m = conn.metadata || {};
    const isFree = conn.type === "FREE_LINE" || m.is_free_line;
    setEditingConnection(conn);
    setCableModalIsFreeLine(!!isFree);
    setCableTypeInput(m.cable_type || "");
    setCableNumberInput(m.cable_number || conn.name || "");
    setCableDescInput(m.description || "");
    setCableLengthCalculated(m.length_meters || null);
    setCableColorInput(conn.color || (isFree ? "#10b981" : "#0284c7"));

    if (m.source_symbol_id) {
      const s1 = symbols.find((s) => s.id === m.source_symbol_id);
      setCableModalSource(s1 ? { id: s1.id, label: s1.label || getSymbolName(s1.symbol_type), plan_id: planId } : null);
    } else {
      setCableModalSource(null);
    }

    if (m.target_symbol_id) {
      const s2 = symbols.find((s) => s.id === m.target_symbol_id);
      setCableModalTarget(s2 ? { id: s2.id, label: s2.label || getSymbolName(s2.symbol_type), plan_id: planId } : null);
    } else {
      setCableModalTarget(null);
    }

    setCableModalWaypoints(m.waypoints || []);
    setCableModalOpen(true);
    setOpenTooltipId(null);
  };

  const handleCableExecutionSubmit = async (connId: string) => {
    try {
      const token = await getToken();
      const res = await fetch("/api/bma/cable-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ connectionId: connId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Error submitting execution");
      setCableConnections(prev => prev.map(c => c.id === connId ? data.connection : c));
    } catch (e: any) {
      alert(e.message || "Błąd zgłaszania wykonania kabla");
    }
  };

  const handleCableExecutionUndo = async (connId: string) => {
    try {
      const token = await getToken();
      const res = await fetch("/api/bma/cable-execution", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ connectionId: connId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Error undoing execution");
      setCableConnections(prev => prev.map(c => c.id === connId ? data.connection : c));
    } catch (e: any) {
      alert(e.message || "Błąd cofania zgłoszenia");
    }
  };

  const handleCableExecutionAction = async (connId: string, action: "APPROVED" | "REJECTED") => {
    try {
      const token = await getToken();
      const res = await fetch("/api/bma/cable-execution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ connectionId: connId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Error updating execution status");
      setCableConnections(prev => prev.map(c => c.id === connId ? data.connection : c));
    } catch (e: any) {
      alert(e.message || "Błąd zamykania wykonania kabla");
    }
  };

  const handleCableReportProblem = async (conn: CableConnectionRow) => {
    const meta = conn.metadata || {};
    const currentProb = (meta as any).problem_description || "";
    const desc = prompt(
      t("planBma", "describeProblemPrompt", "Opisz problem dla kabla") + ` ${meta.cable_number || conn.name || 'Kabel'}:`,
      currentProb
    );
    if (desc === null) return; // User cancelled

    try {
      const token = await getToken();
      const newMeta = {
        ...meta,
        problem_description: desc.trim() ? desc.trim() : null,
      };

      const res = await fetch(`/api/plans/${planId}/cable-connections?connectionId=${encodeURIComponent(conn.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          metadata: newMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error saving problem");
      setCableConnections(prev => prev.map(c => c.id === conn.id ? data.connection : c));
    } catch (e: any) {
      alert(e.message || "Błąd zapisu problemu");
    }
  };

  const handleCableRemoveProblem = async (conn: CableConnectionRow) => {
    if (!confirm(t("planBma", "confirmRemoveProblem", "Czy na pewno chcesz usunąć zgłoszony problem dla kabla") + ` ${conn.metadata?.cable_number || conn.name || 'Kabel'}?`)) return;

    try {
      const token = await getToken();
      const meta = conn.metadata || {};
      const newMeta = {
        ...meta,
        problem_description: null,
      };

      const res = await fetch(`/api/plans/${planId}/cable-connections?connectionId=${encodeURIComponent(conn.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          metadata: newMeta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error removing problem");
      setCableConnections(prev => prev.map(c => c.id === conn.id ? data.connection : c));
    } catch (e: any) {
      alert(e.message || "Błąd usuwania problemu");
    }
  };

  const handleSaveCableConnection = async () => {
    const token = await getToken();
    if (!token) return;

    const newType = cableTypeInput.trim();
    if (newType && !cableTypesList.includes(newType)) {
      setCableTypesList((prev) => Array.from(new Set([...prev, newType])));
      try {
        fetch("/api/cable-types", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_id: projectId || "00000000-0000-0000-0000-000000000000", name: newType }),
        }).catch(() => {});
      } catch {}
    }
    const num = cableNumberInput.trim();
    if (num) {
      const isDuplicate = cableConnections.some((c) => {
        if (editingConnection && c.id === editingConnection.id) return false;
        const m = c.metadata || {};
        const existingNum = (m.cable_number || c.name || "").trim();
        return existingNum.toLowerCase() === num.toLowerCase();
      });
      if (isDuplicate) {
        const pref = num.toUpperCase().startsWith("L") ? "L" : "K";
        const suggested = getNextUniqueCableNumber(pref);
        alert(`⚠️ Numer kabla / przewodu "${num}" już istnieje na tym planie!\n\nAutomatycznie przypisano unikalny numer: ${suggested}`);
        setCableNumberInput(suggested);
        return;
      }
    }

    try {
      if (editingConnection) {
        // PATCH
        const res = await fetch(
          `/api/plans/${planId}/cable-connections?connectionId=${encodeURIComponent(editingConnection.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              name: cableNumberInput.trim() || cableDescInput.trim() || "Kabel",
              color: cableColorInput,
              metadata: {
                ...editingConnection.metadata,
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
        const res = await fetch(`/api/plans/${planId}/cable-connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            project_id: projectId || "00000000-0000-0000-0000-000000000000",
            name: cableNumberInput.trim() || cableDescInput.trim() || (isFree ? "Freie Leitung" : "Kabel"),
            type: isFree ? "FREE_LINE" : "CABLE_CONNECTION",
            color: cableColorInput || (isFree ? "#10b981" : "#0284c7"),
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
          // Keep activeTool (pe_line / cable_connect / free_line) active so user can immediately draw the next cable
          setDrawingCableStartSymbol(null);
          drawingCableStartSymbolRef.current = null;
          setDrawingCableWaypoints([]);
          drawingCableWaypointsRef.current = [];
          setDrawingFreeLinePoints([]);
          drawingFreeLinePointsRef.current = [];
          setCableModalSource(null);
          setCableModalTarget(null);
          setHoverLatLng(null);
        }
      }
    } catch (e) {
      console.error("Failed to save cable connection:", e);
    }
  };

  const handleAddParallelCable = (existingConn: CableConnectionRow) => {
    setOpenTooltipId(null);
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
    const pref = meta.is_free_line ? "L" : "K";
    setCableNumberInput(getNextUniqueCableNumber(pref));
    setCableTypeInput("Steuerleitung");
    setCableDescInput(`Paralleles Kabel zu ${existingConn.name || "Kabel"}`);
    setCableLengthCalculated(meta.length_meters || 0);
    setCableModalOpen(true);
  };

    // Undo system for deleted cables and symbols
    // Helper: Enforce strict 90-degree orthogonalization between consecutive points
  const enforceStrict90Path = (pts: any[]): any[] => {
    if (pts.length < 2) return pts;
    const res: any[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = Math.abs(p2.lng - p1.lng);
      const dy = Math.abs(p2.lat - p1.lat);
      if (dx > 0.00005 && dy > 0.00005) {
        // Insert 90-degree elbow corner point
        res.push((L as any).latLng(p1.lat, p2.lng));
      }
      res.push(p2);
    }
    return res;
  };

  // Save edited cable route
    useEffect(() => { handleSaveEditedRouteRef.current = handleSaveEditedRoute; });

  const handleSaveEditedRoute = async () => {
    if (!editingRouteCable) return;
    const token = await getToken();
    if (!token) return;

    const metaOld = editingRouteCable.metadata || {};
    const s1 = symbols.find((s) => s.id === metaOld.source_symbol_id);
    const s2 = symbols.find((s) => s.id === metaOld.target_symbol_id);
    let ptsForLen: Array<{ x_norm: number; y_norm: number }> = [...editingRouteWaypoints];
    let savedWaypoints = [...editingRouteWaypoints];
    if (s1 && s2) {
      const c1 = getSymbolConnectionPoint(s1);
      const c2 = getSymbolConnectionPoint(s2);
      const rawPts = [c1, ...editingRouteWaypoints, c2];
      const orthoPts = makeStrictOrthoPolyline(rawPts, s1, s2);
      savedWaypoints = orthoPts.slice(1, -1);
      ptsForLen = orthoPts;
    }
    const newLenMeters = calculatePathLengthMeters(ptsForLen);

    const meta = {
      ...metaOld,
      waypoints: savedWaypoints,
      length_meters: newLenMeters || metaOld.length_meters,
    };

    try {
      const res = await fetch(`/api/plans/${planId}/cable-connections?connectionId=${encodeURIComponent(editingRouteCable.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metadata: meta }),
      });
      if (res.ok) {
        const json = await res.json();
        const updatedConn = json.connection || { ...editingRouteCable, metadata: meta };
        setCableConnections((prev) => prev.map((c) => (c.id === editingRouteCable.id ? updatedConn : c)));
        setEditingRouteCable(null);
        setEditingRouteWaypoints([]);
        setHoverLatLng(null);
        setLastDeletedMessage(`✓ Zapisano nowy przebieg trasy dla kabla ${editingRouteCable.name || ""}`);
      }
    } catch (e) {
      console.error("Failed to update cable route", e);
    }
  };

  const handleUndoDelete = async () => {
    if (deletedItemsStackRef.current.length === 0) return;
    const last = deletedItemsStackRef.current[deletedItemsStackRef.current.length - 1];
    deletedItemsStackRef.current = deletedItemsStackRef.current.slice(0, -1);
    setDeletedItemsStack((prev) => prev.slice(0, -1));
    setLastDeletedMessage(null);

    const token = await getToken();
    if (!token) return;

    if (last.type === "cable") {
      try {
        const res = await fetch(`/api/plans/${planId}/cable-connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: last.item.name,
            color: last.item.color,
            metadata: last.item.metadata,
          }),
        });
        if (res.ok) {
          const restoredJson = await res.json();
          if (restoredJson.connection) {
            setCableConnections((prev) => [...prev, restoredJson.connection]);
          }
        }
      } catch (e) {
        console.error("Undo cable failed", e);
      }
    } else if (last.type === "symbol") {
      try {
        const res = await fetch(`/api/plans/${planId}/bma-symbols`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(last.item),
        });
        if (res.ok) {
          const restoredJson = await res.json();
          if (restoredJson.symbol) {
            setSymbols((prev) => [...prev, restoredJson.symbol]);
            setOpenTooltipId(restoredJson.symbol.id);
          }
        }
      } catch (e) {
        console.error("Undo symbol failed", e);
      }
    }
  };

  const handleDeleteCableConnection = async (connId: string) => {
    const cToDel = cableConnections.find((c) => c.id === connId);
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/plans/${planId}/cable-connections?connectionId=${encodeURIComponent(connId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (cToDel) {
          setDeletedItemsStack((prev) => [...prev, { type: "cable", item: cToDel }]);
          setLastDeletedMessage(`Usunięto kabel ${cToDel.name || ""}`);
        }
        setCableConnections((prev) => prev.filter((c) => c.id !== connId));
        setSelectedCableId(null);
        setOpenTooltipId(null);
      }
    } catch (e) {
      console.error("Failed to delete cable connection:", e);
    }
  };

  // Save new or updated BMA symbol
  const handleSaveSymbol = async () => {
    if ((!modalCoords && !editingSymbol) || saving) return;
    setSaving(true);
    const token = await getToken();
    if (!token) { setSaving(false); return; }

    try {
      if (editingSymbol) {
        let finalDesc = descriptionInput.trim() || null;
        const descObj: Record<string, any> = {};
        if (editingSymbol.description) {
          try {
            if (editingSymbol.description.startsWith("{")) {
              Object.assign(descObj, JSON.parse(editingSymbol.description));
            } else {
              descObj.desc = editingSymbol.description;
            }
          } catch {}
        }
        descObj.desc = descriptionInput.trim();
        if (arrowDirection) descObj.direction = arrowDirection;

        if (selectedVariantId) {
          const foundVar = lampTypesData.variants?.find((v) => v.id === selectedVariantId);
          if (foundVar) {
            descObj.variantId = foundVar.id;
            descObj.variantName = foundVar.name;
            descObj.variantColor = foundVar.color;
            descObj.variantModel = foundVar.model;
          } else {
            delete descObj.variantId;
            delete descObj.variantName;
            delete descObj.variantColor;
            delete descObj.variantModel;
          }
        } else {
          delete descObj.variantId;
          delete descObj.variantName;
          delete descObj.variantColor;
          delete descObj.variantModel;
        }

        if (powerKwInput.trim()) {
          descObj.powerKw = powerKwInput.trim();
        } else {
          delete descObj.powerKw;
        }
        if (zuleitungInput.trim()) {
          descObj.zuleitung = zuleitungInput.trim();
        } else {
          delete descObj.zuleitung;
        }

        if (serialNumberInput.trim()) {
          descObj.serial_number = serialNumberInput.trim();
        } else {
          delete descObj.serial_number;
        }
        if (photosInput.length > 0) {
          descObj.photos = photosInput;
        } else {
          delete descObj.photos;
        }

        if (editingSymbol && (editingSymbol.symbol_type === "geraet_box" || editingSymbol.symbol_type === "infrarotheizung")) {
          descObj.orientation = geraetDirection;
          descObj.direction = geraetDirection;
          if (editingSymbol.symbol_type === "geraet_box") {
            descObj.w_norm = geraetDirection === "senkrecht" ? 0.0036 : 0.015;
            descObj.h_norm = geraetDirection === "senkrecht" ? 0.025 : 0.006;
          }
        }
        finalDesc = JSON.stringify(descObj);

        const res = await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(editingSymbol.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            symbol_type: editingSymbol.symbol_type,
            loop_number: loopInput.trim() || null,
            address: addressInput.trim() || null,
            label: labelInput.trim() || null,
            description: finalDesc,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        setSymbols((prev) => prev.map((s) => (s.id === editingSymbol.id ? json.symbol : s)));
        setEditingSymbol(null);
      } else if (modalCoords) {
        const descObj: Record<string, any> = { desc: descriptionInput.trim() };
        if (arrowDirection) descObj.direction = arrowDirection;

        if (modalCoords.symbol_type === "geraet_box" || modalCoords.symbol_type === "infrarotheizung") {
          const scale = geraetSize === "small" ? 0.5 : 1.0;
          descObj.orientation = geraetDirection;
          descObj.direction = geraetDirection === "senkrecht" ? "down" : "right";
          descObj.geraetSize = geraetSize;
          descObj.isSmall = geraetSize === "small";
          descObj.scale = scale;
          if (modalCoords.symbol_type === "geraet_box") {
            descObj.w_norm = (geraetDirection === "senkrecht" ? 0.0036 : 0.015) * scale;
            descObj.h_norm = (geraetDirection === "senkrecht" ? 0.025 : 0.006) * scale;
          }
        }

        if (selectedVariantId) {
          const foundVar = lampTypesData.variants?.find((v) => v.id === selectedVariantId);
          if (foundVar) {
            descObj.variantId = foundVar.id;
            descObj.variantName = foundVar.name;
            descObj.variantColor = foundVar.color;
            descObj.variantModel = foundVar.model;
          }
        }

        if (powerKwInput.trim()) {
          descObj.powerKw = powerKwInput.trim();
        }

        if (serialNumberInput.trim()) {
          descObj.serial_number = serialNumberInput.trim();
        }
        if (photosInput.length > 0) {
          descObj.photos = photosInput;
        }

        const finalDesc = JSON.stringify(descObj);

        const res = await fetch(`/api/plans/${planId}/bma-symbols`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            symbol_type: modalCoords.symbol_type,
            x_norm: modalCoords.x_norm,
            y_norm: modalCoords.y_norm,
            loop_number: loopInput.trim() || null,
            address: addressInput.trim() || null,
            label: labelInput.trim() || (addressInput ? `${loopInput || "1"}/${addressInput}` : null),
            description: finalDesc,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (json.symbol) {
          setSymbols((prev) => [...prev, json.symbol]);
        }
        setModalCoords(null);
      }
    } catch (err) {
      console.error("Failed to save symbol", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete symbol
  const handleDeleteSymbol = async (symbolId: string) => {
    if (!isAdminOrMod) return;
    const symToDelete = symbols.find((s) => s.id === symbolId);
    setSymbols((prev) => prev.filter((s) => s.id !== symbolId));
    setOpenTooltipId(null);

    if (symToDelete) {
      const label = symToDelete.label || getSymbolName(symToDelete.symbol_type);
      setDeletedItemsStack((prev) => [...prev, { type: "symbol", item: symToDelete }]);
      deletedItemsStackRef.current = [...deletedItemsStackRef.current, { type: "symbol", item: symToDelete }];
      setLastDeletedMessage(`Usunięto symbol: ${label}`);
    }

    const token = await getToken();
    if (!token) return;

    try {
      await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(symbolId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  };

  // Move / Reposition symbol via Drag & Drop
    // Helper to calculate true connection point of any symbol (4-side edge midpoint for geraet_box, center for markers)
  const getSymbolConnectionPoint = (
    s: BmaSymbolRow | null,
    otherPt?: { x_norm: number; y_norm: number },
    cableTerminalIdx: number = 0,
    totalTerminals: number = 1
  ): { x_norm: number; y_norm: number } => {
    if (!s) return { x_norm: 0, y_norm: 0 };

    // Calculate equal 10px parallel terminal offset along device edge
    const termOffsetPx = totalTerminals > 1 ? (cableTerminalIdx - (totalTerminals - 1) / 2) * 10 : 0;
    const termDxNorm = worldPxW > 0 ? termOffsetPx / worldPxW : 0;
    const termDyNorm = worldPxH > 0 ? termOffsetPx / worldPxH : 0;

    if (s.symbol_type === "geraet_box") {
      let w_norm = 0.015;
      let h_norm = 0.006;
      try {
        const pObj = JSON.parse(s.description || "{}");
        const scale = typeof pObj.scale === "number" ? pObj.scale : (pObj.isSmall || pObj.geraetSize === "small" ? 0.5 : 1.0);
        const isSenkrecht = pObj.orientation === "senkrecht" || pObj.direction === "senkrecht" || pObj.direction === "down" || pObj.direction === "up";
        if (typeof pObj.w_norm === "number" && typeof pObj.h_norm === "number") {
          w_norm = pObj.w_norm;
          h_norm = pObj.h_norm;
        } else if (isSenkrecht) {
          w_norm = 0.0036 * scale;
          h_norm = 0.025 * scale;
        } else {
          w_norm = 0.015 * scale;
          h_norm = 0.006 * scale;
        }
      } catch {}

      const cx = s.x_norm + w_norm / 2;
      const cy = s.y_norm + h_norm / 2;
      const x_min = s.x_norm;
      const x_max = s.x_norm + w_norm;
      const y_min = s.y_norm;
      const y_max = s.y_norm + h_norm;

      if (!otherPt) return { x_norm: cx + termDxNorm, y_norm: cy + termDyNorm };

      const dx = otherPt.x_norm - cx;
      const dy = otherPt.y_norm - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Left/Right Edge: shift Y terminal coordinate
        const targetY = Math.max(y_min, Math.min(y_max, cy + termDyNorm));
        return { x_norm: dx > 0 ? x_max : x_min, y_norm: targetY };
      } else {
        // Top/Bottom Edge: shift X terminal coordinate
        const targetX = Math.max(x_min, Math.min(x_max, cx + termDxNorm));
        return { x_norm: targetX, y_norm: dy > 0 ? y_max : y_min };
      }
    }

    if (s.symbol_type === "led_stripe") {
      let w_norm = 0.05;
      let h_norm = 0.02;
      try {
        const pObj = JSON.parse(s.description || "{}");
        if (typeof pObj.w_norm === "number") w_norm = pObj.w_norm;
        if (typeof pObj.h_norm === "number") h_norm = pObj.h_norm;
      } catch {}
      const cx = s.x_norm + w_norm / 2;
      const cy = s.y_norm + h_norm / 2;
      if (!otherPt) return { x_norm: cx, y_norm: cy };
      const dx = otherPt.x_norm - cx;
      const dy = otherPt.y_norm - cy;
      if (Math.abs(dx) > Math.abs(dy)) {
        return { x_norm: dx > 0 ? s.x_norm + w_norm : s.x_norm, y_norm: cy };
      } else {
        return { x_norm: cx, y_norm: dy > 0 ? s.y_norm + h_norm : s.y_norm };
      }
    }

    if (s.symbol_type === "infrarotheizung") {
      let isSenkrecht = false;
      let w_norm = 0;
      let h_norm = 0;
      try {
        const pObj = JSON.parse(s.description || "{}");
        if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up') isSenkrecht = true;
        if (typeof pObj.w_norm === 'number' && typeof pObj.h_norm === 'number') {
          w_norm = pObj.w_norm;
          h_norm = pObj.h_norm;
        }
      } catch {}

      if (!w_norm || !h_norm) {
        const refSize = 24;
        const wPx = isSenkrecht ? refSize * 1.5 : refSize * 4.5;
        const hPx = isSenkrecht ? refSize * 4.5 : refSize * 1.5;
        w_norm = worldPxW > 0 ? wPx / worldPxW : 0.02;
        h_norm = worldPxH > 0 ? hPx / worldPxH : 0.008;
      }

      const cx = s.x_norm;
      const cy = s.y_norm;
      const x_min = cx - w_norm / 2;
      const x_max = cx + w_norm / 2;
      const y_min = cy - h_norm / 2;
      const y_max = cy + h_norm / 2;

      if (!otherPt) return { x_norm: cx + termDxNorm, y_norm: cy + termDyNorm };

      const dx = otherPt.x_norm - cx;
      const dy = otherPt.y_norm - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        const targetY = Math.max(y_min, Math.min(y_max, cy + termDyNorm));
        return { x_norm: dx > 0 ? x_max : x_min, y_norm: targetY };
      } else {
        const targetX = Math.max(x_min, Math.min(x_max, cx + termDxNorm));
        return { x_norm: targetX, y_norm: dy > 0 ? y_max : y_min };
      }
    }

    // For all point markers (warmepumpe_aussen, warmepumpe_innen, temperaturfuehler, detectors, etc.)
    if (otherPt) {
      const dx = otherPt.x_norm - s.x_norm;
      const dy = otherPt.y_norm - s.y_norm;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.0001) {
        const refSize = 24;
        let iconRadiusPx = 10;
        if (s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen') iconRadiusPx = Math.round(refSize * 1.2);
        else if (s.symbol_type === 'temperaturfuehler') iconRadiusPx = Math.round(refSize * 1.1);
        else if (s.symbol_type === 'notlicht_pikto_gross') iconRadiusPx = 13;

        const rNormX = worldPxW > 0 ? iconRadiusPx / worldPxW : 0.006;
        const rNormY = worldPxH > 0 ? iconRadiusPx / worldPxH : 0.006;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > absDy) {
          return {
            x_norm: s.x_norm + (dx > 0 ? rNormX : -rNormX),
            y_norm: s.y_norm + termDyNorm,
          };
        } else {
          return {
            x_norm: s.x_norm + termDxNorm,
            y_norm: s.y_norm + (dy > 0 ? rNormY : -rNormY),
          };
        }
      }
    }

    return { x_norm: s.x_norm, y_norm: s.y_norm };
  };
  const getSymbolCenter = getSymbolConnectionPoint;

  const handleDragEnd = async (id: string, e: any) => {
    if (!isAdmin) return;
    const marker = e.target;
    if (!marker) return;
    const newLatLng = marker.getLatLng();
    const { x_norm, y_norm } = latLngToNormCoords(newLatLng);

    // Optimistically update local state
    setSymbols((prev) =>
      prev.map((s) => (s.id === id ? { ...s, x_norm, y_norm } : s))
    );

    // Persist to backend for all users
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ x_norm, y_norm }),
      });
    } catch (err) {
      console.error("Failed to update symbol position", err);
    }
  };

  // Zoom-scaled base sizing for SVG markers:
  // Full zoom out (zoom <= 1): 7px tiny dot (does not cover the plan)
  // Zoom 2: 10px
  // Zoom 3: 16px
  // Zoom-scaled base sizing for SVG markers (+50% enlarged):
  // Full zoom out (zoom <= 1): 11px
  // Zoom 2: 15px
  // Zoom 3: 24px
  // Zoom 4: 36px (with label)
  // Zoom >= 5: 54px (full size with label)
  let targetSize = 54;
  let showLabel = false;

  if (currentZoom <= 0) {
    targetSize = 11;
    showLabel = false;
  } else if (currentZoom === 1) {
    targetSize = 11;
    showLabel = false;
  } else if (currentZoom === 2) {
    targetSize = 15;
    showLabel = false;
  } else if (currentZoom === 3) {
    targetSize = 24;
    showLabel = false;
  } else if (currentZoom === 4) {
    targetSize = 36;
    showLabel = true;
  } else {
    targetSize = 54;
    showLabel = true;
  }

  const getSymbolIcon = useCallback((type: BmaSymbolType, label?: string | null, desc?: string | null) => {
    const conf = BMA_SYMBOLS_CONFIG[type] || BMA_SYMBOLS_CONFIG.detector_blue;
    const isDis = type === "dis_signalgeber";
    const isPiktoGross = type === "notlicht_pikto_gross";
    const isPiktoKlein = type === "notlicht_pikto";
    const isWpAussen = type === "warmepumpe_aussen";
    const isWpInnen = type === "warmepumpe_innen";
    const isInfra = type === "infrarotheizung";

    let w = targetSize;
    let h = targetSize;
    if (isPiktoGross) {
      w = Math.round(targetSize * 1.7);
      h = Math.round(targetSize * 0.85);
    } else if (isDis) {
      w = Math.round(targetSize * 1.55);
      h = Math.round(targetSize * 1.0);
    } else if (isWpAussen) {
      w = Math.round(targetSize * 3.2);
      h = Math.round(targetSize * 3.2);
    } else if (type === "temperaturfuehler") {
      w = Math.round(targetSize * 2.8);
      h = Math.round(targetSize * 2.8);
    } else if (type === "ueberspannungsschutz") {
      w = Math.round(targetSize * 1.6);
      h = Math.round(targetSize * 1.9);
    } else if (isWpInnen) {
      w = Math.round(targetSize * 3.2);
      h = Math.round(targetSize * 3.2);
    } else if (isInfra) {
      let isSenkrecht = false;
      try {
        const pObj = JSON.parse(desc || "{}");
        if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up') isSenkrecht = true;
      } catch {}
      if (isSenkrecht) {
        w = Math.round(targetSize * 1.5);
        h = Math.round(targetSize * 4.5);
      } else {
        w = Math.round(targetSize * 4.5);
        h = Math.round(targetSize * 1.5);
      }
    }

    let iconUrl = conf.iconUrl;
    if (isPiktoGross || isPiktoKlein || type === "sirene") {
      const dir = getPiktoDirection(desc);
      iconUrl = getPiktoIconUrl(type, dir);
    }

    let variantColor: string | null = null;
    let powerKw: string | null = null;
    if (desc) {
      try {
        const parsed = JSON.parse(desc);
        if (parsed.powerKw) powerKw = parsed.powerKw;
        if (parsed.variantId || parsed.variantName) {
          const found = lampTypesData.variants?.find((v) => v.id === parsed.variantId || v.name === parsed.variantName);
          if (found && found.color) {
            variantColor = found.color;
          }
        }
        if (!variantColor && parsed.variantColor) {
          variantColor = parsed.variantColor;
        }
      } catch {}
    }

    const isBmaDetector = type === "detector_red" || type === "detector_blue" || type === "dis_signalgeber" || type === "sirene";
    const textColor = type === "detector_blue" ? "#2563eb" : isBmaDetector ? "#dc2626" : "#0f172a";
    const bmaFontSize = Math.round(Math.max(12, Math.min(15, targetSize * 0.48)) * 1.5);

    const powerBadge = powerKw ? `<div style="font-size: 11px; color: #0284c7; font-weight: 700; line-height: 1; margin-top: 1px;">⚡ ${powerKw.includes('kW') ? powerKw : powerKw + ' kW'}</div>` : "";
    const labelHtml = (showLabel && (label || powerKw))
      ? `<div style="
          ${isBmaDetector ? `
            position: absolute;
            bottom: calc(100% + 1px);
            right: calc(50% - 4px);
            margin-bottom: 0;
            font-size: ${bmaFontSize}px;
            font-weight: 600;
            color: ${textColor};
            background: transparent;
            padding: 0 2px;
            border-radius: 4px;
            border: none;
            box-shadow: none;
            white-space: nowrap;
            text-align: right;
            line-height: 1.1;
            pointer-events: none;
          ` : `
            margin-bottom: 2px;
            font-size: ${Math.max(13, Math.min(18, targetSize * 0.55))}px;
            font-weight: 700;
            color: ${textColor};
            background: rgba(255, 255, 255, 0.95);
            padding: 1px 4px;
            border-radius: 4px;
            border: ${variantColor ? `1.5px solid ${variantColor}` : '1px solid rgba(0,0,0,0.2)'};
            box-shadow: 0 1px 3px rgba(0,0,0,0.25);
            white-space: nowrap;
            text-align: center;
            line-height: 1.1;
            pointer-events: none;
          `}
        ">${label || ""}${powerBadge}</div>`
      : "";

    const imgRingStyle = variantColor
      ? `box-shadow: 0 0 0 2.5px ${variantColor}, 0 2px 6px rgba(0,0,0,0.4); border-radius: 6px; background: ${variantColor}22; padding: 1.5px;`
      : `filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));`;

    const isInfraSenkrecht = (() => {
      if (type !== 'infrarotheizung') return false;
      try {
        const pObj = JSON.parse(desc || "{}");
        return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
      } catch { return false; }
    })();

    const imgW = isInfraSenkrecht ? h : w;
    const imgH = isInfraSenkrecht ? w : h;
    const rotStyle = isInfraSenkrecht ? 'transform: rotate(90deg); transform-origin: center center;' : '';

    return L.divIcon({
      className: "bma-symbol-marker",
      html: `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: ${activeSymbolType ? "crosshair" : (isAdmin && isEditMode) ? "grab" : "pointer"};
          pointer-events: ${activeSymbolType ? "none" : "auto"};
          user-select: none;
          width: ${w}px;
          height: ${h}px;
          position: relative;
        ">
          ${labelHtml}
          <img src="${iconUrl}" style="display:block; width:${imgW}px; height:${imgH}px; max-width:none !important; max-height:none !important; object-fit:contain; ${imgRingStyle} ${rotStyle} pointer-events: none;" alt="" />
        </div>
      `,
      iconSize: [w, isBmaDetector ? h : (h + (labelHtml ? 18 : 0))],
      iconAnchor: [w / 2, isBmaDetector ? (h / 2) : (h / 2 + (labelHtml ? 10 : 0))],
    });
  }, [targetSize, showLabel, isAdmin, isEditMode, activeSymbolType, lampTypesData.variants]);

  const getSymbolName = useCallback(
    (type: BmaSymbolType) => {
      if (type === "dis_signalgeber") return t("planBma", "disSignalgeber", "D-Melder mit Sirene");
      if (type === "sirene") return t("planBma", "sirene", "Sirene (Signalgeber)");
      if (type === "detector_blue") return t("planBma", "detectorBlue", "ZWD-Melder");
      if (type === "detector_red") return t("planBma", "detectorRed", "D-Melder");
      if (type === "lampe") return t("planBma", "lampe", "Lampe (Leuchte)");
      if (type === "led_stripe") return t("planBma", "ledStripe", "LED Stripe (Pasek LED)");
      if (type === "notlicht_lampe") return t("planBma", "notlichtLampe", "Notbeleuchtung Lampe (Sicherheitsleuchte)");
      if (type === "notlicht_pikto") return t("planBma", "notlichtPiktoKlein", "Rettungszeichen klein (RZ-K)");
      if (type === "notlicht_pikto_gross") return t("planBma", "notlichtPiktoGross", "Rettungszeichen groß (RZ-G)");
      if (type === "kabelauslass") return t("planBma", "kabelauslass", "Kabelauslass");
      if (type === "kabelbahn") return t("planBma", "kabelbahn", "Kabelbahn (Kabeltrasse)");
      if (type === "warmepumpe_aussen") return t("planBma", "warmepumpeAussen", "Wärmepumpe Außen");
      if (type === "warmepumpe_innen") return t("planBma", "warmepumpeInnen", "Wärmepumpe Innen");
      if (type === "infrarotheizung") return t("planBma", "infrarotheizung", "Infrarotheizung");
      if (type === "temperaturfuehler") return t("planBma", "temperaturfuehler", "Temperaturfühler");
      if (type === "geraet_box") return t("planBma", "geraetBox", "Anderes Gerät / Steuerung (Rechteck)");
      if (type === "abdeckung_box") return t("planBma", "abdeckungBox", "Abdeckung");
      if (type === "revision_cloud") return t("planBma", "revisionCloud", "Änderungs-Wolke");
      if (type === "ueberspannungsschutz") return t("planBma", "quickUeberspannungsschutz", "Überspannungsschutz (SPD)");
      return "Symbol";
    },
    [t]
  );

  // Helper to render LED stripe as a yellow glowing / bordered rectangle
  const renderLedStripe = useCallback(
    (s: BmaSymbolRow) => {
      let w_norm = 0.05;
      let h_norm = 0.02;
      let customDesc = "";
      let variantColor = "#eab308";
      try {
        const parsed = JSON.parse(s.description || "{}");
        if (typeof parsed.w_norm === "number") w_norm = parsed.w_norm;
        if (typeof parsed.h_norm === "number") h_norm = parsed.h_norm;
        if (parsed.desc) customDesc = parsed.desc;
        if (parsed.variantColor) variantColor = parsed.variantColor;
      } catch {
        customDesc = s.description || "";
      }

      const c1 = normCoordsToLatLng(s.x_norm, s.y_norm);
      const c2 = normCoordsToLatLng(s.x_norm + w_norm, s.y_norm);
      const c3 = normCoordsToLatLng(s.x_norm + w_norm, s.y_norm + h_norm);
      const c4 = normCoordsToLatLng(s.x_norm, s.y_norm + h_norm);
      const centerLatLng = normCoordsToLatLng(s.x_norm + w_norm / 2, s.y_norm + h_norm / 2);

      return (
        <React.Fragment key={s.id}>
          <PolygonAny
            positions={[c1, c2, c3, c4]}
            interactive={!activeSymbolType}
            pathOptions={{
              color: variantColor,
              fillColor: variantColor,
              fillOpacity: 0.35,
              weight: 2.5,
            }}
            eventHandlers={{
              dragend: async (e: any) => {
                if (!isAdmin) return;
                const marker = e.target;
                if (!marker) return;
                const latlng = marker.getLatLng();
                const norm = latLngToNormCoords(latlng);
                const newX = Math.max(0, Math.min(1 - w_norm, norm.x_norm - w_norm / 2));
                const newY = Math.max(0, Math.min(1 - h_norm, norm.y_norm - h_norm / 2));
                setSymbols((prev) =>
                  prev.map((sym) => (sym.id === s.id ? { ...sym, x_norm: newX, y_norm: newY } : sym))
                );
                const token = await getToken();
                if (!token) return;
                try {
                  await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(s.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ x_norm: newX, y_norm: newY }),
                  });
                } catch (err) {
                  console.error("Failed to move led_stripe", err);
                }
              },
              click: (e: any) => handleDeviceClick(s, e),
            }}
          />
          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}
            draggable={!activeSymbolType && isAdmin && isEditMode}
            icon={L.divIcon({
              className: "led-stripe-center-marker",
              html: `
                <div style="
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  cursor: ${activeSymbolType ? "crosshair" : "pointer"};
                  pointer-events: ${activeSymbolType ? "none" : "auto"};
                  user-select: none;
                ">
                  <div style="
                    font-size: ${Math.max(8, Math.min(11, targetSize * 0.4))}px;
                    font-weight: 800;
                    color: ${variantColor};
                    background: rgba(255, 255, 255, 0.95);
                    padding: 1px 5px;
                    border-radius: 4px;
                    border: 1px solid ${variantColor};
                    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
                    white-space: nowrap;
                    text-align: center;
                    pointer-events: none;
                  ">${s.label || "LED"}</div>
                </div>
              `,
              iconSize: [60, 20],
              iconAnchor: [30, 10],
            })}
            eventHandlers={{
              click: (e: any) => handleDeviceClick(s, e),
            }}
          >
            {openTooltipId === s.id && !activeSymbolType && !activeTool && (
              <TooltipAny permanent interactive opacity={1} direction="top" offset={[0, -10]}>
                <div
                  ref={(el) => {
                    if (el) {
                      L.DomEvent.disableClickPropagation(el);
                      L.DomEvent.disableScrollPropagation(el);
                    }
                  }}
                  style={{ padding: 4, minWidth: 160 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 800, fontSize: 12, color: variantColor, marginBottom: 4 }}>
                    🟡 {t("planBma", "ledStripe", "LED Stripe")}
                  </div>
                  {s.label && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: variantColor, marginBottom: 2 }}>
                      {t("planBma", "addressLabel", "Bezeichnung")}: {s.label}
                    </div>
                  )}
                  {s.loop_number && (
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      Stromkreis: <b style={{ color: variantColor }}>{s.loop_number}</b>
                    </div>
                  )}
                  {customDesc && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{customDesc}</div>
                  )}
                  {isAdminOrMod && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditSymbol(s);
                        }}
                        style={{
                          flex: 1,
                          background: `rgba(${variantColor}, 0.2)`,
                          border: `1px solid ${variantColor}`,
                          color: variantColor,
                          borderRadius: 6,
                          padding: "4px 6px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        ✏️ {t("planBma", "edit", "Bearbeiten")}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSymbol(s.id);
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        🗑 {t("planBma", "delete", "Symbol löschen")}
                      </button>
                    </div>
                  )}
                </div>
              </TooltipAny>
            )}
          </MarkerAny>
        </React.Fragment>
      );
    },
    [normCoordsToLatLng, targetSize, openTooltipId, isAdminOrMod, activeSymbolType, t]
  );

  // Helper to render Abdeckung Box (Masking White Cover Rectangle)
  const renderAbdeckungBox = useCallback(
    (s: BmaSymbolRow) => {
      let w_norm = 0.05;
      let h_norm = 0.05;
      try {
        const pObj = JSON.parse(s.description || "{}");
        if (typeof pObj.w_norm === "number" && typeof pObj.h_norm === "number") {
          w_norm = pObj.w_norm;
          h_norm = pObj.h_norm;
        }
      } catch {}

      const c1 = normCoordsToLatLng(s.x_norm, s.y_norm);
      const c2 = normCoordsToLatLng(s.x_norm + w_norm, s.y_norm);
      const c3 = normCoordsToLatLng(s.x_norm + w_norm, s.y_norm + h_norm);
      const c4 = normCoordsToLatLng(s.x_norm, s.y_norm + h_norm);
      const centerLatLng = normCoordsToLatLng(s.x_norm + w_norm / 2, s.y_norm + h_norm / 2);

      return (
        <React.Fragment key={s.id}>
          <PolygonAny
            positions={[c1, c2, c3, c4]}
            interactive={!activeSymbolType}
            pathOptions={{
              color: isAdminOrMod ? "#94a3b8" : "transparent",
              fillColor: "#ffffff",
              fillOpacity: 1.0,
              weight: 1,
              dashArray: "3, 3",
            }}
            eventHandlers={{
              click: (e: any) => handleDeviceClick(s, e),
            }}
          />
          {isAdminOrMod && (
            <MarkerAny
              position={centerLatLng}
              interactive={!activeSymbolType}
              draggable={!activeSymbolType && isAdmin && isEditMode}
              icon={L.divIcon({
                className: "abdeckung-box-center-marker",
                html: `
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: ${activeSymbolType ? "crosshair" : (isAdmin && isEditMode) ? "grab" : "pointer"};
                    pointer-events: ${activeSymbolType ? "none" : "auto"};
                    user-select: none;
                    opacity: 0.7;
                  ">
                    <div style="
                      font-size: 10px;
                      font-weight: 700;
                      color: #64748b;
                      background: rgba(241, 245, 249, 0.9);
                      padding: 1px 4px;
                      border-radius: 3px;
                      border: 1px dashed #94a3b8;
                      pointer-events: none;
                      white-space: nowrap;
                    ">
                      ⬜ Abdeckung
                    </div>
                  </div>
                `,
                iconSize: [80, 20],
                iconAnchor: [40, 10],
              })}
              eventHandlers={{
                dragend: async (e: any) => {
                  if (!isAdmin) return;
                  const marker = e.target;
                  if (!marker) return;
                  const latlng = marker.getLatLng();
                  const norm = latLngToNormCoords(latlng);
                  const newX = Math.max(0, Math.min(1 - w_norm, norm.x_norm - w_norm / 2));
                  const newY = Math.max(0, Math.min(1 - h_norm, norm.y_norm - h_norm / 2));
                  setSymbols((prev) =>
                    prev.map((sym) => (sym.id === s.id ? { ...sym, x_norm: newX, y_norm: newY } : sym))
                  );
                  const token = await getToken();
                  if (!token) return;
                  try {
                    await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(s.id)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ x_norm: newX, y_norm: newY }),
                    });
                  } catch (err) {
                    console.error("Failed to move abdeckung_box", err);
                  }
                },
                click: (e: any) => {
                  handleDeviceClick(s, e);
                },
              }}
            >
              {openTooltipId === s.id && !activeSymbolType && (
                <TooltipAny permanent interactive opacity={1} direction="top" offset={[0, -10]}>
                  <div
                    ref={(el) => {
                      if (el) {
                        L.DomEvent.disableClickPropagation(el);
                        L.DomEvent.disableScrollPropagation(el);
                      }
                    }}
                    style={{ padding: 4, minWidth: 120 }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#64748b" }}>
                      Abdeckung (Maske)
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      Klicken zum Löschen
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteSymbol(s.id);
                        }}
                        style={{
                          padding: "2px 6px",
                          fontSize: 11,
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          borderRadius: 3,
                          cursor: "pointer",
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                </TooltipAny>
              )}
            </MarkerAny>
          )}
        </React.Fragment>
      );
    },
    [activeSymbolType, isAdminOrMod, handleDeviceClick, handleDeleteSymbol, latLngToNormCoords, normCoordsToLatLng, openTooltipId, planId]
  );

  // Helper to calculate scalloped arc vertices for revision cloud
  const getRevisionCloudPolygonLatLngs = useCallback(
    (x_norm: number, y_norm: number, w_norm: number, h_norm: number) => {
      const xPx = x_norm * worldPxW;
      const yPx = y_norm * worldPxH;
      const wPx = Math.max(10, w_norm * worldPxW);
      const hPx = Math.max(10, h_norm * worldPxH);
      const arcSize = Math.max(14, Math.min(44, Math.min(wPx, hPx) / 2.5));
      const bulge = Math.max(3, arcSize * 0.32);
      const ptsPx: { x: number; y: number }[] = [];

      // Top edge (left to right)
      const topSteps = Math.max(2, Math.round(wPx / arcSize));
      const dxTop = wPx / topSteps;
      for (let i = 0; i < topSteps; i++) {
        const x1 = xPx + i * dxTop;
        const x2 = xPx + (i + 1) * dxTop;
        for (let t = 0; t <= 1; t += 0.25) {
          if (i > 0 && t === 0) continue;
          const u = 1 - t;
          const cx = (x1 + x2) / 2;
          const cy = yPx - bulge;
          const px = u * u * x1 + 2 * u * t * cx + t * t * x2;
          const py = u * u * yPx + 2 * u * t * cy + t * t * yPx;
          ptsPx.push({ x: px, y: py });
        }
      }

      // Right edge (top to bottom)
      const rightSteps = Math.max(2, Math.round(hPx / arcSize));
      const dyRight = hPx / rightSteps;
      for (let i = 0; i < rightSteps; i++) {
        const y1 = yPx + i * dyRight;
        const y2 = yPx + (i + 1) * dyRight;
        for (let t = 0; t <= 1; t += 0.25) {
          if (t === 0) continue;
          const u = 1 - t;
          const cx = xPx + wPx + bulge;
          const cy = (y1 + y2) / 2;
          const px = u * u * (xPx + wPx) + 2 * u * t * cx + t * t * (xPx + wPx);
          const py = u * u * y1 + 2 * u * t * cy + t * t * y2;
          ptsPx.push({ x: px, y: py });
        }
      }

      // Bottom edge (right to left)
      const bottomSteps = Math.max(2, Math.round(wPx / arcSize));
      const dxBottom = wPx / bottomSteps;
      for (let i = 0; i < bottomSteps; i++) {
        const x1 = xPx + wPx - i * dxBottom;
        const x2 = xPx + wPx - (i + 1) * dxBottom;
        for (let t = 0; t <= 1; t += 0.25) {
          if (t === 0) continue;
          const u = 1 - t;
          const cx = (x1 + x2) / 2;
          const cy = yPx + hPx + bulge;
          const px = u * u * x1 + 2 * u * t * cx + t * t * x2;
          const py = u * u * (yPx + hPx) + 2 * u * t * cy + t * t * (yPx + hPx);
          ptsPx.push({ x: px, y: py });
        }
      }

      // Left edge (bottom to top)
      const leftSteps = Math.max(2, Math.round(hPx / arcSize));
      const dyLeft = hPx / leftSteps;
      for (let i = 0; i < leftSteps; i++) {
        const y1 = yPx + hPx - i * dyLeft;
        const y2 = yPx + hPx - (i + 1) * dyLeft;
        for (let t = 0; t <= 1; t += 0.25) {
          if (t === 0) continue;
          const u = 1 - t;
          const cx = xPx - bulge;
          const cy = (y1 + y2) / 2;
          const px = u * u * xPx + 2 * u * t * cx + t * t * xPx;
          const py = u * u * y1 + 2 * u * t * cy + t * t * y2;
          ptsPx.push({ x: px, y: py });
        }
      }

      return ptsPx.map((p) => CRS.pointToLatLng(L.point(p.x, p.y), meta.maxZoom));
    },
    [worldPxW, worldPxH, meta.maxZoom]
  );

  // Helper to render Revision Cloud (Änderungs-Wolke) as a red scalloped polygon box with text badge above
  const renderRevisionCloud = useCallback(
    (s: BmaSymbolRow) => {
      let w_norm = 0.08;
      let h_norm = 0.05;
      let customDesc = "";
      try {
        const pObj = JSON.parse(s.description || "{}");
        if (typeof pObj.w_norm === "number") w_norm = pObj.w_norm;
        if (typeof pObj.h_norm === "number") h_norm = pObj.h_norm;
        if (pObj.desc) customDesc = pObj.desc;
      } catch {
        if (s.description && !s.description.startsWith("{")) customDesc = s.description;
      }

      const cloudPositions = getRevisionCloudPolygonLatLngs(s.x_norm, s.y_norm, w_norm, h_norm);
      const topCenterLatLng = normCoordsToLatLng(s.x_norm + w_norm / 2, s.y_norm);

      // Dimension calculation
      const widthPx = Math.round(w_norm * worldPxW);
      const heightPx = Math.round(h_norm * worldPxH);
      let dimText = `${widthPx}×${heightPx}px`;
      if (planScale && planScale > 0) {
        const widthM = (w_norm * worldPxW) / planScale;
        const heightM = (h_norm * worldPxH) / planScale;
        dimText = `${widthM.toFixed(2)}m × ${heightM.toFixed(2)}m`;
      }

      const labelText = s.label || "Hinweis";
      const [line1, line2] = (() => {
        const cleanHeader = (labelText || "Hinweis").trim();
        const cleanDesc = (customDesc || "").trim();
        if (!cleanDesc) return [cleanHeader, ""];
        const full = `${cleanHeader}: ${cleanDesc}`;
        if (full.length <= 55) {
          if (cleanDesc.length > 20) return [`${cleanHeader}:`, cleanDesc];
          return [full, ""];
        }
        const words = full.split(/\s+/);
        const halfLen = Math.floor(full.length / 2);
        let curLen = 0;
        let splitAtIdx = -1;
        for (let i = 0; i < words.length; i++) {
          curLen += words[i].length + (i > 0 ? 1 : 0);
          if (curLen >= halfLen && splitAtIdx === -1) {
            splitAtIdx = i;
            break;
          }
        }
        if (splitAtIdx === -1) splitAtIdx = Math.floor(words.length / 2);
        return [words.slice(0, splitAtIdx + 1).join(" "), words.slice(splitAtIdx + 1).join(" ")];
      })();

      return (
        <React.Fragment key={s.id}>
          <PolygonAny
            positions={cloudPositions}
            interactive={!activeSymbolType}
            pathOptions={{
              color: "#dc2626",
              fillColor: "#ef4444",
              fillOpacity: 0.12,
              weight: 2.5,
            }}
            eventHandlers={{
              click: (e: any) => {
                if (activeSymbolType) return;
                e.originalEvent?.stopPropagation();
                handleOpenEditSymbol(s);
              },
            }}
          />
          <MarkerAny
            position={topCenterLatLng}
            interactive={!activeSymbolType}
            draggable={!activeSymbolType && isAdmin && isEditMode}
            icon={L.divIcon({
              className: "revision-cloud-top-marker",
              html: `
                <div style="
                  position: absolute;
                  bottom: 0;
                  left: 50%;
                  transform: translate(-50%, -6px);
                  width: max-content;
                  max-width: 580px;
                  cursor: ${activeSymbolType ? "crosshair" : (isAdmin && isEditMode) ? "grab" : "pointer"};
                  pointer-events: ${activeSymbolType ? "none" : "auto"};
                  user-select: none;
                " title="${(isAdmin && isEditMode) ? "Przeciągnij, aby przesunąć chmurkę / Drag to move" : ""}">
                  <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.96);
                    padding: 3px 10px;
                    border-radius: 6px;
                    border: 1.5px solid #dc2626;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                    color: #dc2626;
                    font-size: 11px;
                    font-weight: 800;
                    text-align: center;
                    line-height: 1.3;
                    white-space: nowrap;
                  ">
                    ${line2 ? `
                      <div style="display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                        <span>☁️</span>
                        <span style="letter-spacing: 0.3px;">${line1}</span>
                        <span style="font-size: 9px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; margin-left: 2px;">${dimText}</span>
                      </div>
                      <div style="letter-spacing: 0.2px; font-size: 10.5px; white-space: nowrap; margin-top: 2px;">
                        ${line2}
                      </div>
                    ` : `
                      <div style="display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                        <span>☁️</span>
                        <span style="letter-spacing: 0.3px;">${line1}</span>
                        <span style="font-size: 9px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; margin-left: 2px;">${dimText}</span>
                      </div>
                    `}
                  </div>
                </div>
              `,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
            eventHandlers={{
              click: (e: any) => {
                if (activeSymbolType) return;
                e.originalEvent?.stopPropagation();
                handleOpenEditSymbol(s);
              },
              dragend: async (e: any) => {
                if (!isAdmin) return;
                const marker = e.target;
                if (!marker) return;
                const latlng = marker.getLatLng();
                const norm = latLngToNormCoords(latlng);
                const newX = Math.max(0, Math.min(1 - w_norm, norm.x_norm - w_norm / 2));
                const newY = Math.max(0, Math.min(1 - h_norm, norm.y_norm));
                setSymbols((prev) =>
                  prev.map((sym) => (sym.id === s.id ? { ...sym, x_norm: newX, y_norm: newY } : sym))
                );
                const token = await getToken();
                if (!token) return;
                try {
                  await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(s.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ x_norm: newX, y_norm: newY }),
                  });
                } catch (err) {
                  console.error("Failed to move revision_cloud", err);
                }
              },
            }}
          />
        </React.Fragment>
      );
    },
    [activeSymbolType, isAdminOrMod, handleOpenEditSymbol, latLngToNormCoords, normCoordsToLatLng, planId, getRevisionCloudPolygonLatLngs, worldPxW, worldPxH, planScale]
  );

  // Helper to render custom Device Box (Gerät / Steuerung) as a styled colored rectangle
  const renderGeraetBox = useCallback(
    (s: BmaSymbolRow) => {
      let w_norm = 0.015;
      let h_norm = 0.006;
      let customDesc = "";
      try {
        const pObj = JSON.parse(s.description || "{}");
        const scale = typeof pObj.scale === "number" ? pObj.scale : (pObj.isSmall || pObj.geraetSize === "small" ? 0.5 : 1.0);
        if (typeof pObj.w_norm === "number" && typeof pObj.h_norm === "number") {
          w_norm = pObj.w_norm;
          h_norm = pObj.h_norm;
        } else if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up') {
          w_norm = 0.0036 * scale; h_norm = 0.025 * scale;
        } else {
          w_norm = 0.015 * scale; h_norm = 0.006 * scale;
        }
      } catch {}

      let variantColor = "#0284c7";
      let powerKw = "";
      let variantModel = "";
      let photoUrl: string | null = null;

      try {
        const parsed = JSON.parse(s.description || "{}");
        if (parsed.desc) customDesc = parsed.desc;
        if (parsed.powerKw) powerKw = parsed.powerKw;
        if (parsed.variantColor) variantColor = parsed.variantColor;
        if (parsed.variantModel) variantModel = parsed.variantModel;

        if (lampTypesData.variants && lampTypesData.variants.length > 0) {
          const found = lampTypesData.variants.find((v) => v.id === parsed.variantId || v.name === parsed.variantName);
          if (found) {
            if (found.color) variantColor = found.color;
            if (found.model) variantModel = found.model;
            if (found.photoUrl || found.photoBase64) photoUrl = found.photoUrl || found.photoBase64 || null;
          }
        }
        if (!photoUrl && (parsed.photoUrl || parsed.photoBase64)) {
          photoUrl = parsed.photoUrl || parsed.photoBase64;
        }
      } catch {
        customDesc = s.description || "";
      }

      const c1 = normCoordsToLatLng(s.x_norm, s.y_norm);
      const c2 = normCoordsToLatLng(s.x_norm + w_norm, s.y_norm);
      const c3 = normCoordsToLatLng(s.x_norm + w_norm, s.y_norm + h_norm);
      const c4 = normCoordsToLatLng(s.x_norm, s.y_norm + h_norm);
      const centerLatLng = normCoordsToLatLng(s.x_norm + w_norm / 2, s.y_norm + h_norm / 2);

      const powerBadge = powerKw ? `<span style="color: #38bdf8; font-weight: 800; margin-left: 4px;">⚡ ${powerKw.includes('kW') ? powerKw : powerKw + ' kW'}</span>` : "";

      return (
        <React.Fragment key={s.id}>
          <PolygonAny
            positions={[c1, c2, c3, c4]}
            interactive={!activeSymbolType}
            pathOptions={{
              color: variantColor,
              fillColor: variantColor,
              fillOpacity: 0.28,
              weight: 2.5,
            }}
            eventHandlers={{
              click: (e: any) => handleDeviceClick(s, e),
            }}
          />
          <MarkerAny
            position={centerLatLng}
            interactive={!activeSymbolType}
            draggable={!activeSymbolType && isAdmin && isEditMode}
            icon={L.divIcon({
              className: "geraet-box-center-marker",
              html: `
                <div style="
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  cursor: ${activeSymbolType ? "crosshair" : (isAdmin && isEditMode) ? "grab" : "pointer"};
                  pointer-events: ${activeSymbolType ? "none" : "auto"};
                  user-select: none;
                ">
                  <div style="
                    font-size: ${Math.max(9, Math.min(12, targetSize * 0.45))}px;
                    font-weight: 800;
                    color: #0f172a;
                    background: rgba(255, 255, 255, 0.95);
                    padding: 2px 6px;
                    border-radius: 5px;
                    border: 1.5px solid ${variantColor};
                    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                    white-space: nowrap;
                    text-align: center;
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                    gap: 3px;
                  ">
                    <span>🎛️</span>
                    <span>${s.label || "Gerät"}</span>
                    ${powerBadge}
                  </div>
                </div>
              `,
              iconSize: [100, 24],
              iconAnchor: [50, 12],
            })}
            eventHandlers={{
              dragend: async (e: any) => {
                if (!isAdmin) return;
                const marker = e.target;
                if (!marker) return;
                const latlng = marker.getLatLng();
                const norm = latLngToNormCoords(latlng);
                const newX = Math.max(0, Math.min(1 - w_norm, norm.x_norm - w_norm / 2));
                const newY = Math.max(0, Math.min(1 - h_norm, norm.y_norm - h_norm / 2));
                setSymbols((prev) =>
                  prev.map((sym) => (sym.id === s.id ? { ...sym, x_norm: newX, y_norm: newY } : sym))
                );
                const token = await getToken();
                if (!token) return;
                try {
                  await fetch(`/api/plans/${planId}/bma-symbols?symbolId=${encodeURIComponent(s.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ x_norm: newX, y_norm: newY }),
                  });
                } catch (err) {
                  console.error("Failed to move geraet_box", err);
                }
              },
              click: (e: any) => {
                handleDeviceClick(s, e);
              },
            }}
          >
            {openTooltipId === s.id && !activeSymbolType && (
              <TooltipAny permanent interactive opacity={1} direction="top" offset={[0, -10]}>
                <div
                  ref={(el) => {
                    if (el) {
                      L.DomEvent.disableClickPropagation(el);
                      L.DomEvent.disableScrollPropagation(el);
                    }
                  }}
                  style={{ padding: 4, minWidth: 180, maxWidth: 260 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 800, fontSize: 13, color: variantColor, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span>🎛️</span>
                    <span>{s.label || t("planBma", "geraetBox", "Gerät / Steuerung")}</span>
                  </div>

                  {photoUrl && (
                    <div
                      style={{
                        width: "100%",
                        height: 100,
                        borderRadius: 6,
                        overflow: "hidden",
                        marginBottom: 6,
                        border: "1px solid rgba(255,255,255,0.25)",
                        background: "#0f172a",
                        cursor: "pointer",
                        position: "relative",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenPhotoUrl(photoUrl);
                      }}
                      title={t("planBma", "zoomPhoto", "Foto vergrößern")}
                    >
                      <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,0.75)", color: "#ffffff", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>
                        🔍 {t("planBma", "zoomPhoto", "Foto vergrößern")}
                      </div>
                    </div>
                  )}

                  {variantModel && (
                    <div style={{ fontSize: 11, color: "#f8fafc", marginBottom: 2 }}>
                      {t("planBma", "modelLabel", "Modell")}: <b>{variantModel}</b>
                    </div>
                  )}

                  {powerKw && (
                    <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginBottom: 2 }}>
                      ⚡ {t("planBma", "powerKw", "Moc")}: {powerKw.includes('kW') ? powerKw : powerKw + ' kW'}
                    </div>
                  )}

                  {customDesc && !customDesc.includes("w_norm") && !customDesc.includes("orientation") && !customDesc.trim().startsWith("{") && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                      {customDesc}
                    </div>
                  )}

                  {/* Direct Quick Serial & Photos Actions directly in tooltip */}
                  {renderTooltipQuickSerialAndPhotos(s)}

                  {isAdminOrMod && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditSymbol(s);
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
                          handleDeleteSymbol(s.id);
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
    },
    [activeSymbolType, isAdminOrMod, normCoordsToLatLng, targetSize, t, lampTypesData.variants, openTooltipId]
  );

  // Helper to render completed Kabelbahn as green ladder
  const renderKabelbahn = useCallback(
    (s: BmaSymbolRow) => {
      let points: Array<{ x_norm: number; y_norm: number }> = [];
      try {
        const parsed = JSON.parse(s.description || "{}");
        if (Array.isArray(parsed.points)) points = parsed.points;
      } catch {}
      if (points.length < 2) return null;

      const halfWidth = 8;
      const rungStep = 18;

      const leftRailSegments: any[] = [];
      const rightRailSegments: any[] = [];
      const rungSegments: any[] = [];
      const centerPoints: any[] = [];

      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const pt1 = { x: p1.x_norm * worldPxW, y: p1.y_norm * worldPxH };
        const pt2 = { x: p2.x_norm * worldPxW, y: p2.y_norm * worldPxH };

        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len <= 0) continue;

        const nx = -dy / len;
        const ny = dx / len;

        const l1 = CRS.pointToLatLng(L.point(pt1.x + halfWidth * nx, pt1.y + halfWidth * ny), meta.maxZoom);
        const l2 = CRS.pointToLatLng(L.point(pt2.x + halfWidth * nx, pt2.y + halfWidth * ny), meta.maxZoom);
        const r1 = CRS.pointToLatLng(L.point(pt1.x - halfWidth * nx, pt1.y - halfWidth * ny), meta.maxZoom);
        const r2 = CRS.pointToLatLng(L.point(pt2.x - halfWidth * nx, pt2.y - halfWidth * ny), meta.maxZoom);

        leftRailSegments.push([l1, l2]);
        rightRailSegments.push([r1, r2]);

        if (i === 0) {
          centerPoints.push(normCoordsToLatLng(p1.x_norm, p1.y_norm));
        }
        centerPoints.push(normCoordsToLatLng(p2.x_norm, p2.y_norm));

        const numRungs = Math.max(1, Math.floor(len / rungStep));
        for (let j = 0; j <= numRungs; j++) {
          const dist = Math.min(len, j * rungStep);
          const cx = pt1.x + (dist / len) * dx;
          const cy = pt1.y + (dist / len) * dy;
          const rungL = CRS.pointToLatLng(L.point(cx + halfWidth * nx, cy + halfWidth * ny), meta.maxZoom);
          const rungR = CRS.pointToLatLng(L.point(cx - halfWidth * nx, cy - halfWidth * ny), meta.maxZoom);
          rungSegments.push([rungL, rungR]);
        }
      }

      const midIdx = Math.floor(points.length / 2);
      const midPoint = points[midIdx] || points[0];
      const midLatLng = normCoordsToLatLng(midPoint.x_norm, midPoint.y_norm);

      return (
        <React.Fragment key={s.id}>
          {leftRailSegments.map((seg, idx) => (
            <PolylineAny key={`lrail-${s.id}-${idx}`} positions={seg} pathOptions={{ color: "#16a34a", weight: 3.5, opacity: 0.95 }} />
          ))}
          {rightRailSegments.map((seg, idx) => (
            <PolylineAny key={`rrail-${s.id}-${idx}`} positions={seg} pathOptions={{ color: "#16a34a", weight: 3.5, opacity: 0.95 }} />
          ))}
          {rungSegments.map((seg, idx) => (
            <PolylineAny key={`rung-${s.id}-${idx}`} positions={seg} pathOptions={{ color: "#16a34a", weight: 2.5, opacity: 0.95 }} />
          ))}

          {centerPoints.length >= 2 && (
            <MarkerAny
              position={midLatLng}
              interactive={!activeSymbolType}
              icon={L.divIcon({
                className: "kabelbahn-center-label",
                html: `
                  <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: ${activeSymbolType ? "crosshair" : "pointer"};
                    pointer-events: ${activeSymbolType ? "none" : "auto"};
                    user-select: none;
                  ">
                    <div style="
                      font-size: ${Math.max(8, Math.min(11, targetSize * 0.4))}px;
                      font-weight: 800;
                      color: #14532d;
                      background: rgba(220, 252, 231, 0.95);
                      padding: 1px 5px;
                      border-radius: 4px;
                      border: 1px solid #16a34a;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
                      white-space: nowrap;
                      text-align: center;
                      pointer-events: none;
                    ">${s.label || "KB"}</div>
                  </div>
                `,
                iconSize: [50, 20],
                iconAnchor: [25, 10],
              })}
              eventHandlers={{
                click: (e: any) => {
                  if (activeSymbolType) return;
                  if (e?.originalEvent) e.originalEvent.stopPropagation();
                  setOpenTooltipId((prev) => (prev === s.id ? null : s.id));
                },
              }}
            >
              {openTooltipId === s.id && !activeSymbolType && (
                <TooltipAny permanent interactive opacity={1} direction="top" offset={[0, -10]}>
                  <div style={{ padding: 4, minWidth: 150 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#16a34a", marginBottom: 4 }}>
                      🪜 {t("planBma", "kabelbahn", "Kabelbahn")}
                    </div>
                    {s.label && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", marginBottom: 2 }}>
                        {s.label}
                      </div>
                    )}
                    {isAdminOrMod && (
                      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditSymbol(s);
                          }}
                          style={{
                            flex: 1,
                            background: "rgba(22, 163, 74, 0.2)",
                            border: "1px solid rgba(22, 163, 74, 0.5)",
                            color: "#4ade80",
                            borderRadius: 6,
                            padding: "4px 6px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                          }}
                        >
                          ✏️ {t("planBma", "edit", "Bearbeiten")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSymbol(s.id);
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
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                          }}
                        >
                          🗑 {t("planBma", "delete", "Trasse löschen")}
                        </button>
                      </div>
                    )}
                  </div>
                </TooltipAny>
              )}
            </MarkerAny>
          )}
        </React.Fragment>
      );
    },
    [worldPxW, worldPxH, meta.maxZoom, normCoordsToLatLng, targetSize, openTooltipId, isAdminOrMod, t]
  );

  const toolbarSlot = typeof document !== "undefined"
    ? document.getElementById("plan-measurement-toolbar-left") || document.getElementById("plan-external-top-toolbar")
    : null;

  const quickBarSlot = typeof document !== "undefined"
    ? document.getElementById("plan-quick-symbols-bar")
    : null;

  const quickSymbolsList: Array<{
    type: BmaSymbolType;
    labelKey: string;
    fallbackLabel: string;
    layerKey: "bma" | "lighting" | "notlicht" | "kabelbahn" | "kabelauslass" | "heating";
    borderColor?: string;
  }> = [
    { type: "lampe", labelKey: "quickLampe", fallbackLabel: "Lampe", layerKey: "lighting", borderColor: "#f59e0b" },
    { type: "notlicht_lampe", labelKey: "quickNotlicht", fallbackLabel: "Notlicht", layerKey: "notlicht", borderColor: "#22c55e" },
    { type: "notlicht_pikto", labelKey: "quickPiktoKlein", fallbackLabel: "Pikto klein", layerKey: "notlicht", borderColor: "#16a34a" },
    { type: "notlicht_pikto_gross", labelKey: "quickPiktoGross", fallbackLabel: "Pikto groß", layerKey: "notlicht", borderColor: "#15803d" },
    { type: "warmepumpe_aussen", labelKey: "quickWpAussen", fallbackLabel: "WP Außen", layerKey: "heating", borderColor: "#0284c7" },
    { type: "warmepumpe_innen", labelKey: "quickWpInnen", fallbackLabel: "WP Innen", layerKey: "heating", borderColor: "#0ea5e9" },
    { type: "infrarotheizung", labelKey: "quickInfrarotheizung", fallbackLabel: "Infrarotheizung", layerKey: "heating", borderColor: "#f97316" },
    { type: "geraet_box", labelKey: "quickGeraetBox", fallbackLabel: "Gerät / Box", layerKey: "heating", borderColor: "#0284c7" },
  ];

  const buttonContent = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        className={`${styles.btn} ${activeSymbolType || paletteOpen ? styles.btnActive : ""}`}
        onClick={() => {
          if (activeSymbolType) {
            setActiveSymbolType(null);
            setActiveTool(null);
            setDrawingKabelbahnPoints([]);
            setDrawingLedStripeStart(null);
            setHoverLatLng(null);
          } else {
            setPaletteOpen((prev) => !prev);
          }
        }}
        title="Symbole & Notlicht"
      >
        🚨 {activeSymbolType ? `${t("planBma", "placePrefix", "Einfügen")}: ${getSymbolName(activeSymbolType)}` : "Symbole & Notlicht"}
      </button>

      <button
        type="button"
        className={styles.btn}
        onClick={() => {
          setSelectedCategoryFilter("all");
          setPaletteOpen(true);
        }}
        style={{ background: "#0f172a", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.4)" }}
        title={t("planBma", "searchSymbolPlaceholder", "Symbol suchen...")}
      >
        🔍 <span>{t("planBma", "searchSymbolPlaceholder", "Symbol suchen...")}</span>
      </button>
    </div>
  );

  const quickBarContent = (
    <div className={styles.symbolPickerContainer}>
      <span className={styles.quickBarTitle} style={{ fontWeight: 800, color: "#f8fafc" }}>
        ⚡ {t("planBma", "quickFavorites", "Schnellwahl")}:
      </span>

      {/* Dynamic User Favorites List */}
      {userFavorites.map((favId) => {
        const isTool = favId === "pe_line" || favId === "cable_connect" || favId === "free_line" || favId === "revisionsklappe";
        const title = isTool
          ? (favId === "pe_line" ? t("planBma", "quickPeLine", "PE-Leitung") : favId === "cable_connect" ? t("planBma", "quickCableConnect", "Kabel") : favId === "revisionsklappe" ? t("planKlappen", "toolbarBtn", "Revisionsklappe") : t("planBma", "quickFreeLine", "Freie Leitung"))
          : getSymbolName(favId as BmaSymbolType);
        const icon = isTool
          ? (favId === "pe_line" ? "⚡" : favId === "cable_connect" ? "🔌" : favId === "revisionsklappe" ? "🔲" : "〰")
          : (BMA_SYMBOLS_CONFIG[favId as BmaSymbolType]?.iconUrl ? <img src={BMA_SYMBOLS_CONFIG[favId as BmaSymbolType].iconUrl} alt="" className={styles.quickIcon} /> : "⚡");

        const isActive = isTool ? activeTool === favId : activeSymbolType === favId;

        return (
          <button
            key={favId}
            type="button"
            className={`${styles.quickBtn} ${isActive ? styles.quickBtnActive : ""}`}
            onClick={() => {
              if (favId === "revisionsklappe") {
                onEnsureLayerVisible?.("klappen");
                window.dispatchEvent(new CustomEvent("start-draw-revisionsklappe"));
                setActiveSymbolType(null);
                setActiveTool(null);
              } else if (isTool) {
                onEnsureLayerVisible?.("cables");
                setActiveSymbolType(null);
                setActiveTool(isActive ? null : (favId as any));
              } else {
                const layer = (favId === "abdeckung_box" || (favId as any) === "abdeckung") ? "abdeckung"
                  : BMA_SYMBOLS_CONFIG[favId as BmaSymbolType]?.isHeating ? "heating"
                  : BMA_SYMBOLS_CONFIG[favId as BmaSymbolType]?.isEmergency ? "notlicht"
                  : BMA_SYMBOLS_CONFIG[favId as BmaSymbolType]?.isLight ? "lighting"
                  : BMA_SYMBOLS_CONFIG[favId as BmaSymbolType]?.isOutlet ? "kabelauslass"
                  : BMA_SYMBOLS_CONFIG[favId as BmaSymbolType]?.isLadder ? "kabelbahn" : "bma";
                onEnsureLayerVisible?.(layer as any);
                setActiveSymbolType(isActive ? null : (favId as BmaSymbolType));
                setActiveTool(null);
              }
              recordRecentSymbol(favId);
            }}
            title={title}
          >
            <span>{icon}</span>
            <span>{title}</span>
          </button>
        );
      })}

      <button
        type="button"
        className={styles.quickBtn}
        onClick={() => {
          setSelectedCategoryFilter("favorites");
          setPaletteOpen(true);
        }}
        title="Ulubione i edycja szybkiego wyboru"
        style={{ borderColor: "#f59e0b", color: "#fbbf24" }}
      >
        <span>⭐</span>
        <span>+</span>
      </button>

      <button
        type="button"
        className={`${styles.quickBtn} ${isWhiteSchemaMode ? styles.quickBtnActive : ""}`}
        onClick={toggleWhiteSchemaMode}
        title="Zwischen Grundriss und weißem Schemaplan umschalten"
        style={isWhiteSchemaMode ? { background: "#ffffff", color: "#0f172a", borderColor: "#cbd5e1", fontWeight: 800 } : { borderColor: "#94a3b866", color: "#cbd5e1" }}
      >
        <span>{isWhiteSchemaMode ? "🗺️" : "⚪"}</span>
        <span>{isWhiteSchemaMode ? t("planBma", "floorplanMode", "Grundriss") : t("planBma", "schemaMode", "Weißes Schema")}</span>
      </button>

      {/* Button to toggle map editing and dragging */}
      {isAdmin && (
        <button
          type="button"
          className={`${styles.quickBtn} ${isEditMode ? styles.quickBtnActive : ""}`}
          onClick={() => setIsEditMode((prev) => !prev)}
          title={isEditMode ? t("planBma", "editModeOn", "Edycja aktywna (można przesuwać i edytować)") : t("planBma", "editModeOff", "Edycja zablokowana (kliknij, aby odblokować)")}
          style={
            isEditMode
              ? { background: "#2563eb", color: "#ffffff", borderColor: "#60a5fa", fontWeight: 800 }
              : { borderColor: "#94a3b866", color: "#cbd5e1" }
          }
        >
          <span>{isEditMode ? "🔓" : "🔒"}</span>
          <span>{isEditMode ? t("planBma", "editModeActive", "Edycja aktywna") : t("planBma", "editMode", "Edycja")}</span>
        </button>
      )}

      {/* Button to configure Lamp Types and Reference Photos */}
      <button
        type="button"
        className={styles.quickBtn}
        onClick={() => setLampTypesModalOpen(true)}
        title={t("planBma", "buttonLampTypes", "Typy opraw & Zdjęcia")}
        style={{
          borderColor: "#10b981",
          background: "rgba(16, 185, 129, 0.18)",
          color: "#4ade80",
          fontWeight: 800,
          marginLeft: "auto",
        }}
      >
        <span>📷</span>
        <span>{t("planBma", "buttonLampTypes", "Typy opraw & Zdjęcia")}</span>
      </button>
    </div>
  );

  // Mobile Centered Tooltip Renderer
  const renderActiveMobileTooltipContent = () => {
    if (!openTooltipId) return null;

    // 1. Check if open item is a Cable Connection
    const activeCable = cableConnections.find((c) => c.id === openTooltipId);
    if (activeCable) {
      const meta = activeCable.metadata || {};
      const execStatus = meta.execution_status || "NOT_SUBMITTED";
      const cableNum = meta.cable_number || activeCable.name || "Kabel";
      const cableLen = meta.length_meters ? `${meta.length_meters} m` : "";

      return (
        <div style={{ padding: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#38bdf8", marginBottom: 6 }}>
            🔌 {cableNum}
          </div>
          {meta.cable_type && (
            <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 3 }}>
              {t("planBma", "cableType", "Kabeltyp")}: <b>{meta.cable_type}</b>
            </div>
          )}
          {meta.length_meters && (
            <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 700, marginBottom: 3 }}>
              {t("planBma", "cableLength", "Länge")}: <b>{cableLen}</b>
            </div>
          )}
          {meta.description && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
              {meta.description}
            </div>
          )}
          {meta.problem_description && (
            <div style={{ fontSize: 12, color: "#f87171", fontWeight: 800, background: "#450a0a", border: "1px solid #991b1b", padding: "6px 10px", borderRadius: 8, marginTop: 4, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span style={{ wordBreak: "break-word", flex: 1 }}>⚠️ {t("planBma", "problemAlert", "Problem")}: {meta.problem_description}</span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button type="button" onClick={() => handleCableReportProblem(activeCable)} title={t("planBma", "editProblemTitle", "Edytuj opis problemu")} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>✏️</button>
                <button type="button" onClick={() => handleCableRemoveProblem(activeCable)} title={t("planBma", "deleteProblemTitle", "Usuń zgłoszony problem")} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>🗑️</button>
              </div>
            </div>
          )}

          {/* Ausführungsstatus Section */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #334155" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 }}>
              {t("planBma", "executionStatus", "Ausführungsstatus")}:
            </div>
            <div style={{ background: "#1e293b", border: "1px solid #475569", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 800 }}>
                <span>{cableNum}</span>
                {execStatus === "PENDING_APPROVAL" && (
                  <span style={{ background: "#d97706", color: "#ffffff", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                    {t("planBma", "pendingApproval", "Wartet auf Freigabe")}
                  </span>
                )}
                {execStatus === "APPROVED" && (
                  <span style={{ background: "#16a34a", color: "#ffffff", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                    {t("planBma", "approved", "Freigegeben")}
                  </span>
                )}
                {execStatus === "REJECTED" && (
                  <span style={{ background: "#dc2626", color: "#ffffff", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                    {t("planBma", "rejected", "Abgelehnt")}
                  </span>
                )}
                {(!execStatus || execStatus === "NOT_SUBMITTED") && (
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>
                    {t("planBma", "notSubmitted", "Nicht gemeldet")}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              {(!execStatus || execStatus === "NOT_SUBMITTED" || execStatus === "REJECTED") && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => handleCableExecutionSubmit(activeCable.id)}
                    style={{ flex: 1, background: "#3b82f6", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    {t("planBma", "confirmExecution", "Ausführung bestätigen")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCableReportProblem(activeCable)}
                    style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    {t("planBma", "reportProblem", "Problem melden")}
                  </button>
                </div>
              )}

              {execStatus === "PENDING_APPROVAL" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => handleCableExecutionUndo(activeCable.id)}
                    style={{ width: "100%", background: "#64748b", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    {t("planBma", "withdrawReport", "Meldung zurückziehen")}
                  </button>
                  {isAdminOrMod && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleCableExecutionAction(activeCable.id, "APPROVED")}
                        style={{ flex: 1, background: "#22c55e", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                      >
                        {t("planBma", "approved", "Freigegeben")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCableExecutionAction(activeCable.id, "REJECTED")}
                        style={{ flex: 1, background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                      >
                        {t("planBma", "rejectBtn", "Ablehnen")}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {execStatus === "APPROVED" && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {isAdminOrMod && (
                    <button
                      type="button"
                      onClick={() => handleCableExecutionUndo(activeCable.id)}
                      style={{ flex: 1, background: "#64748b", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      {t("planBma", "withdrawReport", "Meldung zurückziehen")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCableReportProblem(activeCable)}
                    style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    {t("planBma", "reportProblem", "Problem melden")}
                  </button>
                </div>
              )}

              {isAdminOrMod && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 8, borderTop: "1px solid #334155" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenTooltipId(null);
                      handleOpenEditCable(activeCable);
                    }}
                    style={{ flex: 1, background: "#3b82f6", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    ✏️ {t("planBma", "editBtn", "Bearbeiten")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenTooltipId(null);
                      const rawWps = activeCable.metadata?.waypoints || [];
                      setEditingRouteCable(activeCable);
                      setEditingRouteWaypoints(rawWps.length > 0 ? [...rawWps] : []);
                    }}
                    style={{ background: "#8b5cf6", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    📍 {t("planBma", "cableRouteBtn", "Trasse")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenTooltipId(null);
                      handleAddParallelCable(activeCable);
                    }}
                    style={{ background: "#0ea5e9", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    ➕ {t("planBma", "parallelCableBtn", "Parallel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenTooltipId(null);
                      handleDeleteCableConnection(activeCable.id);
                    }}
                    style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    🗑️ {t("planBma", "deleteBtn", "Löschen")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 2. Check if open item is a Device / Symbol
    const activeSymbol = symbols.find((s) => s.id === openTooltipId);
    if (activeSymbol) {
      let parsed: any = {};
      try { parsed = JSON.parse(activeSymbol.description || "{}"); } catch {}

      // Find photo URL
      let photoUrl: string | null = null;
      if (lampTypesData.variants?.length && parsed.variantId) {
        const found = lampTypesData.variants.find((v) => v.id === parsed.variantId);
        if (found) {
          photoUrl = found.photoUrl || found.photoBase64 || (found as any).photo_url || (found as any).imageUrl || null;
        }
      }
      if (!photoUrl && (parsed.photoUrl || parsed.photoBase64)) {
        photoUrl = parsed.photoUrl || parsed.photoBase64;
      }

      return (
        <div style={{ padding: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#38bdf8" }}>
            {activeSymbol.label || getSymbolName(activeSymbol.symbol_type)}
          </div>
          {parsed.variantName && (
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700, marginTop: 2 }}>
              {parsed.variantName}
            </div>
          )}
          {parsed.variantModel && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {t("planBma", "modelLabel", "Modell")}: {parsed.variantModel}
            </div>
          )}

          {/* Device photo with fullscreen lightbox click */}
          {photoUrl && (
            <div
              style={{
                width: "100%",
                height: 150,
                borderRadius: 8,
                overflow: "hidden",
                marginTop: 8,
                marginBottom: 8,
                border: "1px solid #334155",
                background: "#020617",
                cursor: "pointer",
                position: "relative",
              }}
              onClick={() => setFullscreenPhotoUrl(photoUrl)}
            >
              <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.75)", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                🔍 {t("planBma", "zoomPhoto", "Foto vergrößern")}
              </div>
            </div>
          )}

          {parsed.powerKw && (
            <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 700, marginTop: 4 }}>
              ⚡ {parsed.powerKw.includes('kW') ? parsed.powerKw : parsed.powerKw + ' kW'}
            </div>
          )}
          {parsed.zuleitung && (
            <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>
              🔌 {parsed.zuleitung}
            </div>
          )}
          {parsed.text && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              {parsed.text}
            </div>
          )}

          {/* Direct Quick Serial & Photos Actions directly in bottom sheet */}
          {renderTooltipQuickSerialAndPhotos(activeSymbol)}

          {isAdminOrMod && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 8, borderTop: "1px solid #334155" }}>
              <button
                type="button"
                onClick={() => {
                  setOpenTooltipId(null);
                  handleOpenEditSymbol(activeSymbol);
                }}
                style={{ flex: 1, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                ✏️ {t("planBma", "editBtn", "Bearbeiten")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenTooltipId(null);
                  handleDeleteSymbol(activeSymbol.id);
                }}
                style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                🗑️ {t("planBma", "deleteBtn", "Löschen")}
              </button>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <MapEventsHandler />

      {/* Toolbar Portal - Only for Admin / Moderator */}
      {isAdminOrMod && (
        toolbarSlot && typeof document !== "undefined" ? (
          ReactDOM.createPortal(buttonContent, toolbarSlot)
        ) : (
          <div className={styles.container}>
            <div ref={toolbarRef} className={styles.toolbar}>
              {buttonContent}
            </div>
          </div>
        )
      )}

      {/* Quick Symbols Bar - Portaled if slot exists, else floating overlay bar */}
      {isAdminOrMod && (
        quickBarSlot && typeof document !== "undefined" ? (
          ReactDOM.createPortal(quickBarContent, quickBarSlot)
        ) : (
          <div className={styles.container} style={{ top: 60, left: 16, right: 16, pointerEvents: "none", zIndex: 999 }}>
            <div style={{ pointerEvents: "auto", maxWidth: "100%", overflowX: "auto" }}>
              {quickBarContent}
            </div>
          </div>
        )
      )}

      {/* Hint banner / floating control bar when placing */}
      {isAdminOrMod && (activeSymbolType || activeTool) && (
        <div className={styles.container} style={{ top: 70, right: 16, zIndex: 1000 }}>
          <div className={styles.hintBanner} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>
              {activeTool === "cable_connect" ? (
                <>
                  🔌 <b>Kabel verbinden:</b> {drawingCableStartSymbol ? (
                    <span style={{ color: "#38bdf8" }}>
                      Start: <b>{drawingCableStartSymbol.label || "Gerät A"}</b> ➔ Klicken Sie Wegpunkte oder das Ziel-Gerät ({drawingCableWaypoints.length} Wegpunkte)
                    </span>
                  ) : (
                    <span>Klicken Sie auf das <b>Start-Gerät</b> auf dem Plan</span>
                  )}
                </>
              ) : activeTool === "pe_line" ? (
                <>
                  ⚡ <b>{t("planBma", "peLineTitle", "PE-Leitung (Potenzialausgleich)")}:</b> {drawingFreeLinePoints.length > 0 ? (
                    <span style={{ color: "#4ade80" }}>
                      {cableModalSource ? `Start: ${cableModalSource.label} ➔ ` : ""}{drawingFreeLinePoints.length} Punkte gesetzt (Klicken auf Ziel-Gerät oder "Fertig" (Shift = 90° Winkel))
                    </span>
                  ) : (
                    <span>Klicken Sie auf den Plan oder ein Gerät, um die <b>PE-Leitung</b> zu zeichnen</span>
                  )}
                </>
              ) : activeTool === "free_line" ? (
                <>
                  〰 <b>Freie Leitung zeichnen:</b> {drawingFreeLinePoints.length > 0 ? (
                    <span style={{ color: "#38bdf8" }}>
                      {cableModalSource ? `Start: ${cableModalSource.label} ➔ ` : ""}{drawingFreeLinePoints.length} Punkte gesetzt (Klicken auf Ziel-Gerät oder "Fertig" (Shift = 90° Winkel))
                    </span>
                  ) : (
                    <span>Klicken Sie auf ein <b>Start-Gerät</b> oder beliebigen Punkt</span>
                  )}
                </>
              ) : activeSymbolType === "kabelbahn" ? (
                <>
                  🪜 <b>Kabelbahn zeichnen</b> ({drawingKabelbahnPoints.length} Punkte gesetzt)
                </>
              ) : activeSymbolType === "led_stripe" ? (
                <>
                  🟡 <b>LED Stripe zeichnen:</b> {drawingLedStripeStart ? "2. Ecke anklicken (Rechteck fertigstellen)" : "1. Ecke na planie anklicken"}
                </>
              ) : activeSymbolType === "geraet_box" ? (
                <>
                  🎛️ <b>{t("planBma", "drawGeraetHint", "Gerät-Rechteck zeichnen")}:</b> {drawingGeraetBoxStart ? "2. Ecke na planie anklicken" : "1. Ecke na planie anklicken"}
                </>
              ) : activeSymbolType === "abdeckung_box" ? (
                <>
                  ⬜ <b>{getSymbolName("abdeckung_box")}:</b> {drawingAbdeckungBoxStart ? (t("planBma", "clickSecondCorner", "2. Ecke na planie anklicken") + " (Shift = 90°)") : t("planBma", "clickFirstCorner", "1. Ecke na planie anklicken")}
                </>
              ) : activeSymbolType === "revision_cloud" ? (
                <>
                  ☁️ <b>{getSymbolName("revision_cloud")}:</b> {drawingRevisionCloudStart ? (t("planBma", "clickSecondCorner", "2. Ecke na planie anklicken") + " (Shift = 90°)") : t("planBma", "clickFirstCorner", "1. Ecke na planie anklicken")}
                </>
              ) : (
                <>
                  ℹ️ {t("planBma", "clickHint", "Klicken Sie auf den Plan, um einzufügen")}: <b>{activeSymbolType ? getSymbolName(activeSymbolType) : ""}</b>
                </>
              )}
            </span>

            {/* Quick finish / undo / cancel buttons for Free Line & PE Line */}
            {(activeTool === "free_line" || activeTool === "pe_line") && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                {drawingFreeLinePoints.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleFinishFreeLine}
                    style={{
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(2,132,199,0.4)",
                    }}
                  >
                    ✓ Fertigstellen (Enter)
                  </button>
                )}
                {drawingFreeLinePoints.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDrawingFreeLinePoints((prev) => prev.slice(0, -1))}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ↶ Rückgängig
                  </button>
                )}
              </div>
            )}

            {/* Quick finish / undo / cancel buttons for Kabelbahn */}
            {activeSymbolType === "kabelbahn" && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                {drawingKabelbahnPoints.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleFinishKabelbahn}
                    style={{
                      background: "#16a34a",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    ✓ {t("planBma", "finishKabelbahn", "Fertig (Enter)")}
                  </button>
                )}
                {drawingKabelbahnPoints.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDrawingKabelbahnPoints((prev) => prev.slice(0, -1))}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ↶ {t("planBma", "undoPoint", "Rückgängig")}
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={resetAllToolsAndDrawing}
              style={{
                background: "rgba(239,68,68,0.8)",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              ✕ {t("planBma", "cancel", "Abbrechen (Esc)")}
            </button>
          </div>
        </div>
      )}

      {/* Live Preview for Geraet Box */}
      {activeSymbolType === "geraet_box" && drawingGeraetBoxStart && hoverLatLng && (() => {
        const { x_norm: hoverX, y_norm: hoverY } = latLngToNormCoords(hoverLatLng);
        const xMin = Math.min(drawingGeraetBoxStart.x_norm, hoverX);
        const yMin = Math.min(drawingGeraetBoxStart.y_norm, hoverY);
        const xMax = Math.max(drawingGeraetBoxStart.x_norm, hoverX);
        const yMax = Math.max(drawingGeraetBoxStart.y_norm, hoverY);

        const c1 = normCoordsToLatLng(xMin, yMin);
        const c2 = normCoordsToLatLng(xMax, yMin);
        const c3 = normCoordsToLatLng(xMax, yMax);
        const c4 = normCoordsToLatLng(xMin, yMax);

        return (
          <PolygonAny
            positions={[c1, c2, c3, c4]}
            pathOptions={{
              color: "#0284c7",
              fillColor: "#38bdf8",
              fillOpacity: 0.35,
              weight: 2.5,
              dashArray: "6, 6",
            }}
          />
        );
      })()}

      {/* Live Preview for LED Stripe */}
      {activeSymbolType === "led_stripe" && drawingLedStripeStart && hoverLatLng && (() => {
        const { x_norm: hoverX, y_norm: hoverY } = latLngToNormCoords(hoverLatLng);
        const xMin = Math.min(drawingLedStripeStart.x_norm, hoverX);
        const yMin = Math.min(drawingLedStripeStart.y_norm, hoverY);
        const xMax = Math.max(drawingLedStripeStart.x_norm, hoverX);
        const yMax = Math.max(drawingLedStripeStart.y_norm, hoverY);

        const c1 = normCoordsToLatLng(xMin, yMin);
        const c2 = normCoordsToLatLng(xMax, yMin);
        const c3 = normCoordsToLatLng(xMax, yMax);
        const c4 = normCoordsToLatLng(xMin, yMax);

        return (
          <PolygonAny
            positions={[c1, c2, c3, c4]}
            pathOptions={{
              color: "#eab308",
              fillColor: "#facc15",
              fillOpacity: 0.4,
              weight: 2.5,
              dashArray: "6, 6",
            }}
          />
        );
      })()}

      {/* Live Preview for Abdeckung Box */}
      {activeSymbolType === "abdeckung_box" && drawingAbdeckungBoxStart && hoverLatLng && (() => {
        const { x_norm: hoverX, y_norm: hoverY } = latLngToNormCoords(hoverLatLng);
        const xMin = Math.min(drawingAbdeckungBoxStart.x_norm, hoverX);
        const yMin = Math.min(drawingAbdeckungBoxStart.y_norm, hoverY);
        const xMax = Math.max(drawingAbdeckungBoxStart.x_norm, hoverX);
        const yMax = Math.max(drawingAbdeckungBoxStart.y_norm, hoverY);

        const c1 = normCoordsToLatLng(xMin, yMin);
        const c2 = normCoordsToLatLng(xMax, yMin);
        const c3 = normCoordsToLatLng(xMax, yMax);
        const c4 = normCoordsToLatLng(xMin, yMax);

        return (
          <PolygonAny
            positions={[c1, c2, c3, c4]}
            pathOptions={{
              color: "#475569",
              fillColor: "#ffffff",
              fillOpacity: 0.85,
              weight: 2,
              dashArray: "5, 5",
            }}
          />
        );
      })()}

      {/* Live Preview Scalloped Cloud & Dimension Badge for Revision Cloud during drawing */}
      {activeSymbolType === "revision_cloud" && drawingRevisionCloudStart && hoverLatLng && (() => {
        const { x_norm: hoverX, y_norm: hoverY } = latLngToNormCoords(hoverLatLng);
        const xMin = Math.min(drawingRevisionCloudStart.x_norm, hoverX);
        const yMin = Math.min(drawingRevisionCloudStart.y_norm, hoverY);
        const xMax = Math.max(drawingRevisionCloudStart.x_norm, hoverX);
        const yMax = Math.max(drawingRevisionCloudStart.y_norm, hoverY);
        const w_norm = Math.max(0.001, xMax - xMin);
        const h_norm = Math.max(0.001, yMax - yMin);

        const cloudPositions = getRevisionCloudPolygonLatLngs(xMin, yMin, w_norm, h_norm);
        const topCenter = normCoordsToLatLng((xMin + xMax) / 2, yMin);

        const widthPx = Math.round(w_norm * worldPxW);
        const heightPx = Math.round(h_norm * worldPxH);
        let dimLabel = `${widthPx} × ${heightPx} px`;
        if (planScale && planScale > 0) {
          const widthM = (w_norm * worldPxW) / planScale;
          const heightM = (h_norm * worldPxH) / planScale;
          dimLabel = `${widthM.toFixed(2)}m × ${heightM.toFixed(2)}m (${widthPx}×${heightPx}px)`;
        }

        return (
          <>
            <PolygonAny
              positions={cloudPositions}
              pathOptions={{
                color: "#dc2626",
                fillColor: "#fee2e2",
                fillOpacity: 0.25,
                weight: 2.5,
              }}
            />
            <MarkerAny
              position={topCenter}
              interactive={false}
              icon={L.divIcon({
                className: "revision-cloud-drawing-size-badge",
                html: `
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transform: translate(-50%, -100%);
                    margin-top: -8px;
                    pointer-events: none;
                    white-space: nowrap;
                  ">
                    <div style="
                      background: #dc2626;
                      color: #ffffff;
                      font-size: 12px;
                      font-weight: 800;
                      padding: 4px 10px;
                      border-radius: 6px;
                      box-shadow: 0 3px 10px rgba(0,0,0,0.35);
                      border: 1.5px solid #ffffff;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                    ">
                      <span style="font-size: 13px;">☁️</span>
                      <span>${dimLabel}</span>
                    </div>
                  </div>
                `,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              })}
            />
          </>
        );
      })()}

      {/* Live Preview for Kabelbahn during drawing */}
      {activeSymbolType === "kabelbahn" && drawingKabelbahnPoints.length > 0 && (
        <>
          {(() => {
            const pts = [...drawingKabelbahnPoints];
            if (hoverLatLng) {
              const { x_norm: hx, y_norm: hy } = latLngToNormCoords(hoverLatLng);
              pts.push({ x_norm: hx, y_norm: hy });
            }
            if (pts.length < 2) return null;

            const halfWidth = 8;
            const rungStep = 18;
            const leftRail: any[] = [];
            const rightRail: any[] = [];
            const rungs: any[] = [];

            for (let i = 0; i < pts.length - 1; i++) {
              const p1 = pts[i];
              const p2 = pts[i + 1];
              const pt1 = { x: p1.x_norm * worldPxW, y: p1.y_norm * worldPxH };
              const pt2 = { x: p2.x_norm * worldPxW, y: p2.y_norm * worldPxH };

              const dx = pt2.x - pt1.x;
              const dy = pt2.y - pt1.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len <= 0) continue;

              const nx = -dy / len;
              const ny = dx / len;

              const l1 = CRS.pointToLatLng(L.point(pt1.x + halfWidth * nx, pt1.y + halfWidth * ny), meta.maxZoom);
              const l2 = CRS.pointToLatLng(L.point(pt2.x + halfWidth * nx, pt2.y + halfWidth * ny), meta.maxZoom);
              const r1 = CRS.pointToLatLng(L.point(pt1.x - halfWidth * nx, pt1.y - halfWidth * ny), meta.maxZoom);
              const r2 = CRS.pointToLatLng(L.point(pt2.x - halfWidth * nx, pt2.y - halfWidth * ny), meta.maxZoom);

              leftRail.push([l1, l2]);
              rightRail.push([r1, r2]);

              const numRungs = Math.max(1, Math.floor(len / rungStep));
              for (let j = 0; j <= numRungs; j++) {
                const dist = Math.min(len, j * rungStep);
                const cx = pt1.x + (dist / len) * dx;
                const cy = pt1.y + (dist / len) * dy;
                const rungL = CRS.pointToLatLng(L.point(cx + halfWidth * nx, cy + halfWidth * ny), meta.maxZoom);
                const rungR = CRS.pointToLatLng(L.point(cx - halfWidth * nx, cy - halfWidth * ny), meta.maxZoom);
                rungs.push([rungL, rungR]);
              }
            }

            return (
              <>
                {leftRail.map((seg, idx) => (
                  <PolylineAny key={`prev-l-${idx}`} positions={seg} pathOptions={{ color: "#22c55e", weight: 3.5, opacity: 0.8 }} />
                ))}
                {rightRail.map((seg, idx) => (
                  <PolylineAny key={`prev-r-${idx}`} positions={seg} pathOptions={{ color: "#22c55e", weight: 3.5, opacity: 0.8 }} />
                ))}
                {rungs.map((seg, idx) => (
                  <PolylineAny key={`prev-rg-${idx}`} positions={seg} pathOptions={{ color: "#22c55e", weight: 2.5, opacity: 0.8 }} />
                ))}
              </>
            );
          })()}

          {drawingKabelbahnPoints.map((p, idx) => (
            <MarkerAny
              key={`kb-vertex-${idx}`}
              position={normCoordsToLatLng(p.x_norm, p.y_norm)}
              icon={L.divIcon({
                className: "kb-vertex-dot",
                html: `<div style="width:10px;height:10px;border-radius:50%;background:#16a34a;border:2px solid #ffffff;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`,
                iconSize: [10, 10],
                iconAnchor: [5, 5],
              })}
            />
          ))}
        </>
      )}

      
      {/* ── LIVE PREVIEW: CABLE CONNECTION (Start -> Waypoints -> Mouse Hover) ── */}
      {activeTool === "cable_connect" && drawingCableStartSymbol && (() => {
        const startCenter = getSymbolCenter(drawingCableStartSymbol);
        const startPt = normCoordsToLatLng(startCenter.x_norm, startCenter.y_norm);
        const waypointPts = drawingCableWaypoints.map(p => normCoordsToLatLng(p.x_norm, p.y_norm));
        const pts = [startPt, ...waypointPts];
        if (hoverLatLng) {
          const lastPt = pts[pts.length - 1];
          if (Math.abs(lastPt.lat - hoverLatLng.lat) > 0.00005 && Math.abs(lastPt.lng - hoverLatLng.lng) > 0.00005) {
            const cornerPt = L.latLng(lastPt.lat, hoverLatLng.lng);
            pts.push(cornerPt);
          }
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
                key={`wp-dot-${idx}`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                interactive={false}
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
                key={`fl-dot-${idx}`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                interactive={false}
                pathOptions={{ color: "#059669", fillColor: "#ffffff", fillOpacity: 1, weight: 2.5 }}
              />
            ))}
          </>
        );
      })()}

      {/* ── LIVE PREVIEW: POTENZIALAUSGLEICH PE LINE (Points -> Mouse Hover) ── */}
      {activeTool === "pe_line" && drawingFreeLinePoints.length > 0 && (() => {
        const pts = drawingFreeLinePoints.map(p => normCoordsToLatLng(p.x_norm, p.y_norm));
        if (hoverLatLng) pts.push(hoverLatLng);
        return (
          <>
            <PolylineAny
              positions={pts}
              interactive={false}
              pathOptions={{ color: "#16a34a", weight: 6, opacity: 0.8 }}
            />
            <PolylineAny
              positions={pts}
              interactive={false}
              pathOptions={{ color: "#facc15", weight: 3.5, dashArray: "8, 8" }}
            />
            {drawingFreeLinePoints.map((p, idx) => (
              <CircleMarkerAny
                key={`pe-dot-${idx}`}
                center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                radius={5}
                interactive={false}
                pathOptions={{ color: "#16a34a", fillColor: "#facc15", fillOpacity: 1, weight: 2.5 }}
              />
            ))}
            {pts.length >= 2 && (() => {
              const pPrev = pts[pts.length - 2];
              const pLast = pts[pts.length - 1];
              const dx = pLast.lng - pPrev.lng;
              const dy = -(pLast.lat - pPrev.lat);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <MarkerAny
                  position={pLast}
                  interactive={false}
                  icon={L.divIcon({
                    className: "pe-line-arrow-preview",
                    html: `
                      <div style="
                        transform: rotate(${angle}deg);
                        transform-origin: 22px 12px;
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        pointer-events: none;
                      ">
                        <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0px 1px 3px rgba(0,0,0,0.6));">
                          <polygon points="2,4 22,12 2,20 8,12" fill="#16a34a" stroke="#facc15" stroke-width="2" />
                        </svg>
                      </div>
                    `,
                    iconSize: [24, 24],
                    iconAnchor: [22, 12],
                  })}
                />
              );
            })()}
          </>
        );
      })()}

                                    {/* ── INTERACTIVE REDRAW ROUTE LAYER FOR EXISTING CABLE ── */}
            {editingRouteCable && (() => {
              const meta = editingRouteCable.metadata || {};
              const s1 = symbols.find((s) => s.id === meta.source_symbol_id);
              const s2 = symbols.find((s) => s.id === meta.target_symbol_id);

              let c1 = { x_norm: 0.2, y_norm: 0.2 };
              let c2 = { x_norm: 0.8, y_norm: 0.8 };
              if (s1 && s2) {
                const target1 = editingRouteWaypoints.length > 0 ? editingRouteWaypoints[0] : getSymbolConnectionPoint(s2);
                c1 = getSymbolConnectionPoint(s1, target1);
                const target2 = editingRouteWaypoints.length > 0 ? editingRouteWaypoints[editingRouteWaypoints.length - 1] : c1;
                c2 = getSymbolConnectionPoint(s2, target2);
              } else if (meta.waypoints && meta.waypoints.length >= 2) {
                c1 = meta.waypoints[0];
                c2 = meta.waypoints[meta.waypoints.length - 1];
              }

              const startPt = normCoordsToLatLng(c1.x_norm, c1.y_norm);
              const endPt = normCoordsToLatLng(c2.x_norm, c2.y_norm);
              const wptPts = editingRouteWaypoints.map((p) => normCoordsToLatLng(p.x_norm, p.y_norm));

              let pts = [startPt, ...wptPts];
              if (hoverLatLng) {
                const lastPt = pts[pts.length - 1];
                let candNorm = latLngToNormCoords(hoverLatLng);
                const lastNorm = editingRouteWaypoints.length > 0 ? editingRouteWaypoints[editingRouteWaypoints.length - 1] : c1;
                candNorm = snapOrtho(lastNorm, candNorm, true);
                const candPt = normCoordsToLatLng(candNorm.x_norm, candNorm.y_norm);
                if (Math.abs(lastPt.lat - candPt.lat) > 0.00005 || Math.abs(lastPt.lng - candPt.lng) > 0.00005) {
                  pts.push(L.latLng(lastPt.lat, candPt.lng));
                }
                pts.push(candPt);
              }
              pts.push(endPt);

              const cableColor = editingRouteCable.color || "#8b5cf6";

              return (
                <React.Fragment key="editing-route-redraw-layer">
                  {/* Start device green ring */}
                  <CircleMarkerAny
                    center={startPt}
                    radius={22}
                    interactive={false}
                    pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.35, weight: 3, dashArray: "4, 4" }}
                  />
                  {/* End device blue ring */}
                  <CircleMarkerAny
                    center={endPt}
                    radius={22}
                    interactive={false}
                    pathOptions={{ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.35, weight: 3, dashArray: "4, 4" }}
                  />

                  {/* Redrawn line outer glow */}
                  <PolylineAny
                    positions={pts}
                    interactive={false}
                    pathOptions={{ color: cableColor, weight: 8, opacity: 0.5 }}
                  />
                  {/* Redrawn line inner dashed */}
                  <PolylineAny
                    positions={pts}
                    interactive={false}
                    pathOptions={{ color: "#ffffff", weight: 3.5, dashArray: "6, 6" }}
                  />

                  {/* Waypoint dots */}
                  {editingRouteWaypoints.map((p, idx) => (
                    <CircleMarkerAny
                      key={`edit-wp-dot-${idx}`}
                      center={normCoordsToLatLng(p.x_norm, p.y_norm)}
                      radius={6}
                      interactive={false}
                      pathOptions={{ color: cableColor, fillColor: "#ffffff", fillOpacity: 1, weight: 3 }}
                    />
                  ))}
                </React.Fragment>
              );
            })()}

            {/* ── SAVED CABLE CONNECTIONS & FREE LINES LAYER (with parallel visual offsets) ── */}
      {layersVisibility?.cables !== false && (() => {
        // Pre-compute raw 90-degree route points for all cables
        const rawCableRoutes: Array<{ conn: CableConnectionRow; routePts: any[] }> = cableConnections.map((conn) => {
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
              const rawWpts = meta.waypoints || [];
              const center1 = getSymbolConnectionPoint(s1);
              const center2 = getSymbolConnectionPoint(s2);
              const target1 = rawWpts.length > 0 ? rawWpts[0] : center2;
              const c1 = getSymbolConnectionPoint(s1, target1);
              const target2 = rawWpts.length > 0 ? rawWpts[rawWpts.length - 1] : c1;
              const c2 = getSymbolConnectionPoint(s2, target2);

              const startPt = normCoordsToLatLng(c1.x_norm, c1.y_norm);
              const endPt = normCoordsToLatLng(c2.x_norm, c2.y_norm);
              const wpts = rawWpts.map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));

              if (wpts.length === 0 && Math.abs(c1.x_norm - c2.x_norm) > 0.0005 && Math.abs(c1.y_norm - c2.y_norm) > 0.0005) {
                const isHorizontalExit = Math.abs(c1.x_norm - center1.x_norm) > Math.abs(c1.y_norm - center1.y_norm);
                const cornerNorm = isHorizontalExit
                  ? { x_norm: c2.x_norm, y_norm: c1.y_norm }
                  : { x_norm: c1.x_norm, y_norm: c2.y_norm };
                const cornerPt = normCoordsToLatLng(cornerNorm.x_norm, cornerNorm.y_norm);
                routePts = [startPt, cornerPt, endPt];
              } else {
                routePts = [startPt, ...wpts, endPt];
              }
            } else {
              routePts = [];
            }
          }
          return { conn, routePts };
        });

        // Group connections by device pair, free line corridor, or spatial corridor proximity (<35px)
        const groups: Record<string, CableConnectionRow[]> = {};
        cableConnections.forEach((c) => {
          const m = c.metadata || {};
          const wps = m.waypoints || [];
          let k = "";
          if (m.is_free_line || c.type === "FREE_LINE") {
            if (wps.length >= 2) {
              const pStart = `${Math.round(wps[0].x_norm * 40)}_${Math.round(wps[0].y_norm * 40)}`;
              const pEnd = `${Math.round(wps[wps.length - 1].x_norm * 40)}_${Math.round(wps[wps.length - 1].y_norm * 40)}`;
              k = `free_${[pStart, pEnd].sort().join("__")}`;
            } else {
              k = `free_${c.id}`;
            }
          } else {
            k = [m.source_symbol_id || "a", m.target_symbol_id || "b"].sort().join("_");
          }

          // Check if this cable overlaps spatially with an existing corridor group
          const thisEntry = rawCableRoutes.find((r) => r.conn.id === c.id);
          if (thisEntry && thisEntry.routePts.length >= 2) {
            for (const existingGroupKey of Object.keys(groups)) {
              const groupConns = groups[existingGroupKey];
              for (const gConn of groupConns) {
                const gEntry = rawCableRoutes.find((r) => r.conn.id === gConn.id);
                if (gEntry && gEntry.routePts.length >= 2) {
                  // Check segment proximity between thisEntry and gEntry
                  let isSpatialOverlap = false;
                  for (let i = 0; i < thisEntry.routePts.length - 1 && !isSpatialOverlap; i++) {
                    const p1 = thisEntry.routePts[i];
                    const p2 = thisEntry.routePts[i + 1];
                    for (let j = 0; j < gEntry.routePts.length - 1 && !isSpatialOverlap; j++) {
                      const q1 = gEntry.routePts[j];
                      const q2 = gEntry.routePts[j + 1];

                      // Both horizontal?
                      const thisHoriz = Math.abs(p2.lng - p1.lng) >= Math.abs(p2.lat - p1.lat);
                      const gHoriz = Math.abs(q2.lng - q1.lng) >= Math.abs(q2.lat - q1.lat);

                      if (thisHoriz && gHoriz) {
                        const deltaY = Math.abs((p1.lat + p2.lat) / 2 - (q1.lat + q2.lat) / 2);
                        const pMinX = Math.min(p1.lng, p2.lng);
                        const pMaxX = Math.max(p1.lng, p2.lng);
                        const qMinX = Math.min(q1.lng, q2.lng);
                        const qMaxX = Math.max(q1.lng, q2.lng);
                        const overlapX = Math.max(0, Math.min(pMaxX, qMaxX) - Math.max(pMinX, qMinX));
                        if (deltaY < 35 && overlapX > 15) {
                          isSpatialOverlap = true;
                        }
                      } else if (!thisHoriz && !gHoriz) {
                        const deltaX = Math.abs((p1.lng + p2.lng) / 2 - (q1.lng + q2.lng) / 2);
                        const pMinY = Math.min(p1.lat, p2.lat);
                        const pMaxY = Math.max(p1.lat, p2.lat);
                        const qMinY = Math.min(q1.lat, q2.lat);
                        const qMaxY = Math.max(q1.lat, q2.lat);
                        const overlapY = Math.max(0, Math.min(pMaxY, qMaxY) - Math.max(pMinY, qMinY));
                        if (deltaX < 35 && overlapY > 15) {
                          isSpatialOverlap = true;
                        }
                      }
                    }
                  }
                  if (isSpatialOverlap) {
                    k = existingGroupKey;
                    break;
                  }
                }
              }
              if (k === existingGroupKey) break;
            }
          }

          if (!groups[k]) groups[k] = [];
          groups[k].push(c);
        });

        const CABLE_COLORS = ["#0284c7", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

        return cableConnections.map((conn) => {
          const meta = conn.metadata || {};

          // Find which group this cable actually belongs to (spatial grouping may assign different key)
          let actualGroup = [conn];
          let cableIdx = 0;
          for (const gKey of Object.keys(groups)) {
            const gConns = groups[gKey];
            const idx = gConns.findIndex((c) => c.id === conn.id);
            if (idx !== -1) {
              actualGroup = gConns;
              cableIdx = idx;
              break;
            }
          }
          const totalInGroup = actualGroup.length;

          // Compute parallel offset in normalized 0-1 space, 14px separation converted to norm units
          const SEPARATION_PX = 14;
          const offsetXNorm = worldPxW > 0 ? SEPARATION_PX / worldPxW : 0;
          const offsetYNorm = worldPxH > 0 ? SEPARATION_PX / worldPxH : 0;
          const mult = totalInGroup > 1 ? (cableIdx - (totalInGroup - 1) / 2) : 0;

          const isFree = meta.is_free_line || conn.type === "FREE_LINE";

          // Re-compute route in normalized space so we can apply offset before LatLng conversion
          let normPts: Array<{ x_norm: number; y_norm: number }> = [];
          if (isFree) {
            if (meta.plan_id && meta.plan_id !== planId && meta.source_plan_id !== planId) {
              return null;
            }
            if (meta.waypoints && meta.waypoints.length >= 2) {
              normPts = meta.waypoints.map((p: any) => ({ x_norm: p.x_norm, y_norm: p.y_norm }));
            }
          } else {
            const s1 = symbols.find((s) => s.id === meta.source_symbol_id);
            const s2 = symbols.find((s) => s.id === meta.target_symbol_id);
            if (s1 && s2) {
              const rawWpts = meta.waypoints || [];
              const center1 = getSymbolConnectionPoint(s1);
              const center2 = getSymbolConnectionPoint(s2);
              const target1 = rawWpts.length > 0 ? rawWpts[0] : center2;
              const c1 = getSymbolConnectionPoint(s1, target1, cableIdx, totalInGroup);
              const target2 = rawWpts.length > 0 ? rawWpts[rawWpts.length - 1] : c1;
              const c2 = getSymbolConnectionPoint(s2, target2, cableIdx, totalInGroup);
              const rawNormPts = [c1, ...rawWpts.map((p: any) => ({ x_norm: p.x_norm, y_norm: p.y_norm })), c2];
              normPts = makeStrictOrthoPolyline(rawNormPts, s1, s2);
            } else {
              // Symbols not on this plan -> do not render on this plan's map
              return null;
            }
          }

          if (normPts.length < 2) return null;

          // Apply clean parallel offset to each segment of the polyline
          let shiftedNormPts = normPts;

          if (mult !== 0 && normPts.length >= 2) {
            if (normPts.length === 2 && !isFree) {
              const p0 = normPts[0];
              const p1 = normPts[1];
              const isVertDirect = Math.abs(p1.x_norm - p0.x_norm) <= Math.abs(p1.y_norm - p0.y_norm);
              if (isVertDirect) {
                const trunkX = (p0.x_norm + p1.x_norm) / 2 + mult * offsetXNorm;
                shiftedNormPts = [
                  p0,
                  { x_norm: trunkX, y_norm: p0.y_norm },
                  { x_norm: trunkX, y_norm: p1.y_norm },
                  p1,
                ];
              } else {
                const trunkY = (p0.y_norm + p1.y_norm) / 2 + mult * offsetYNorm;
                shiftedNormPts = [
                  p0,
                  { x_norm: p0.x_norm, y_norm: trunkY },
                  { x_norm: p1.x_norm, y_norm: trunkY },
                  p1,
                ];
              }
            } else {
              // Calculate perpendicular shift for each segment
              const segShifts: Array<{ sx: number; sy: number }> = [];
              for (let i = 0; i < normPts.length - 1; i++) {
                const pA = normPts[i];
                const pB = normPts[i + 1];
                const isHoriz = Math.abs(pB.x_norm - pA.x_norm) >= Math.abs(pB.y_norm - pA.y_norm);
                if (isHoriz) {
                  segShifts.push({ sx: 0, sy: mult * offsetYNorm });
                } else {
                  segShifts.push({ sx: mult * offsetXNorm, sy: 0 });
                }
              }

              shiftedNormPts = normPts.map((pt, i) => {
                if (i === 0) {
                  return isFree
                    ? { x_norm: pt.x_norm + segShifts[0].sx, y_norm: pt.y_norm + segShifts[0].sy }
                    : pt;
                }
                if (i === normPts.length - 1) {
                  const lastShift = segShifts[segShifts.length - 1];
                  return isFree
                    ? { x_norm: pt.x_norm + lastShift.sx, y_norm: pt.y_norm + lastShift.sy }
                    : pt;
                }
                const prevS = segShifts[i - 1];
                const nextS = segShifts[i];
                return {
                  x_norm: pt.x_norm + (prevS.sx || nextS.sx),
                  y_norm: pt.y_norm + (prevS.sy || nextS.sy),
                };
              });
            }
          }

          const displayNormPts = shiftedNormPts;

          // Convert normalized points to LatLng for Leaflet rendering
          const displayPts = displayNormPts.map((p: any) => normCoordsToLatLng(p.x_norm, p.y_norm));

          // Widely stagger badges along parallel cables across opposite ends of the route length so they NEVER align side-by-side
          const WIDE_FRACS = [0.15, 0.85, 0.50, 0.30, 0.70, 0.20, 0.80];
          let badgeFrac = totalInGroup > 1 ? WIDE_FRACS[cableIdx % WIDE_FRACS.length] : 0.50;

          let totalLen = 0;
          const segLens: number[] = [];
          for (let i = 0; i < displayPts.length - 1; i++) {
            const d = Math.sqrt(Math.pow(displayPts[i+1].lat - displayPts[i].lat, 2) + Math.pow(displayPts[i+1].lng - displayPts[i].lng, 2));
            segLens.push(d);
            totalLen += d;
          }
          const clampedFrac = Math.max(0.08, Math.min(0.92, badgeFrac));
          let targetDist = totalLen * clampedFrac;
          let labelPos = displayPts[0];
          for (let i = 0; i < segLens.length; i++) {
            if (targetDist <= segLens[i]) {
              const t = targetDist / (segLens[i] || 1);
              labelPos = {
                lat: displayPts[i].lat + t * (displayPts[i+1].lat - displayPts[i].lat),
                lng: displayPts[i].lng + t * (displayPts[i+1].lng - displayPts[i].lng),
              };
              break;
            }
            targetDist -= segLens[i];
          }

          const execStatus = meta.execution_status || "NOT_SUBMITTED";

          // Calculate line color, opacity, and dash array based on execution status
          let lineColor = conn.color || CABLE_COLORS[cableIdx % CABLE_COLORS.length] || "#0284c7";
          let lineOpacity = 1.0;
          let lineDashArray: string | undefined = undefined;

          if (execStatus === "PENDING_APPROVAL") {
            lineColor = "#f59e0b"; // Glowing Amber/Orange when reported!
            lineDashArray = "8, 5";
          } else if (execStatus === "APPROVED") {
            lineColor = "#059669"; // Completed cable -> dark green dimmed!
            lineOpacity = 0.35; // Dimmed so it doesn't distract user!
          } else if (execStatus === "REJECTED") {
            lineColor = "#ef4444"; // Rejected -> Red!
          }

          const cableNum = meta.cable_number || conn.name || "Kabel";
          const cableLen = meta.length_meters ? `${meta.length_meters} m` : "";

          // Hide old cable line when redrawing route for this cable
          if (editingRouteCable && conn.id === editingRouteCable.id) {
            return null;
          }

          const isSelected = selectedCableId === conn.id || openTooltipId === conn.id;

          // Badge HTML logic
          let badgeHtml = "";
          if (execStatus === "PENDING_APPROVAL") {
            badgeHtml = `<div style="background:#d97706;color:#ffffff;border:2px solid #fbbf24;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 0 14px rgba(245,158,11,0.9);transform:scale(1.15);cursor:pointer;">⏳ ${cableNum} (Wartet)</div>`;
          } else if (execStatus === "APPROVED") {
            badgeHtml = `<div style="background:#064e3b;color:#ffffff;border:1px solid #10b981;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:800;white-space:nowrap;opacity:0.55;cursor:pointer;">✓ ${cableNum}</div>`;
          } else if (execStatus === "REJECTED") {
            badgeHtml = `<div style="background:#991b1b;color:#ffffff;border:1px solid #f87171;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:800;white-space:nowrap;cursor:pointer;">✕ ${cableNum}</div>`;
          } else {
            badgeHtml = isSelected
              ? `<div style="background:#0284c7;color:#ffffff;border:2px solid #38bdf8;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 0 14px rgba(56,189,248,0.9);transform:scale(1.15);cursor:pointer;">${cableNum}${cableLen ? ' (' + cableLen + ')' : ''}</div>`
              : `<div style="background:#0f172a;color:#ffffff;border:1px solid ${lineColor};padding:1px 5px;border-radius:4px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;">${cableNum}${cableLen ? ' (' + cableLen + ')' : ''}</div>`;
          }

          return (
            <React.Fragment key={`conn-${conn.id}`}>
              {/* Broad clickable buffer */}
              <PolylineAny
                positions={displayPts}
                pathOptions={{ color: "transparent", weight: 24, opacity: 0.001 }}
                interactive={true}
                eventHandlers={{
                  click: (e: any) => {
                    if (e?.originalEvent) e.originalEvent.stopPropagation();
                    setSelectedCableId((prev) => (prev === conn.id ? null : conn.id));
                    setOpenTooltipId((prev) => (prev === conn.id ? null : conn.id));
                  },
                  dblclick: (e: any) => {
                    if (e?.originalEvent) e.originalEvent.stopPropagation();
                    handleOpenEditCable(conn);
                  },
                }}
              >
                {openTooltipId === conn.id && (
                  <TooltipAny permanent interactive={true} direction="top" opacity={1}>
                    <div style={{ padding: 6, minWidth: 190 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: isSelected ? "#0284c7" : lineColor }}>
                        🔌 {cableNum} {totalInGroup > 1 ? `(${cableIdx + 1}/${totalInGroup})` : ""}
                      </div>
                      {meta.cable_type && (
                        <div style={{ fontSize: 11, color: "#334155" }}>
                          {t("planBma", "cableType", "Kabeltyp")}: <b>{meta.cable_type}</b>
                        </div>
                      )}
                      {meta.length_meters && (
                        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                          {t("planBma", "cableLength", "Länge")}: <b>{cableLen}</b>
                        </div>
                      )}
                      {meta.description && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {meta.description}
                        </div>
                      )}
                      {meta.problem_description && (
                        <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 800, background: "#fee2e2", border: "1px solid #fca5a5", padding: "4px 6px", borderRadius: 4, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                          <span style={{ wordBreak: "break-word", flex: 1 }}>⚠️ {t("planBma", "problemAlert", "Problem")}: {meta.problem_description}</span>
                          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCableReportProblem(conn);
                              }}
                              title={t("planBma", "editProblemTitle", "Edytuj opis problemu")}
                              style={{ background: "#3b82f6", color: "#ffffff", border: "none", borderRadius: 3, padding: "1px 5px", fontSize: 10, cursor: "pointer", fontWeight: 700 }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCableRemoveProblem(conn);
                              }}
                              title={t("planBma", "deleteProblemTitle", "Usuń zgłoszony problem")}
                              style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 3, padding: "1px 5px", fontSize: 10, cursor: "pointer", fontWeight: 700 }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ausführungsstatus Section */}
                      <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #cbd5e1" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 4 }}>
                          {t("planBma", "executionStatus", "Ausführungsstatus")}:
                        </div>
                        <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px", display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 800 }}>
                            <span style={{ color: "#0f172a" }}>{cableNum}</span>
                            {execStatus === "PENDING_APPROVAL" && (
                              <span style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>
                                {t("planBma", "pendingApproval", "Wartet auf Freigabe")}
                              </span>
                            )}
                            {execStatus === "APPROVED" && (
                              <span style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>
                                {t("planBma", "approved", "Freigegeben")}
                              </span>
                            )}
                            {execStatus === "REJECTED" && (
                              <span style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>
                                {t("planBma", "rejected", "Abgelehnt")}
                              </span>
                            )}
                            {(!execStatus || execStatus === "NOT_SUBMITTED") && (
                              <span style={{ color: "#64748b", fontSize: 10 }}>
                                {t("planBma", "notSubmitted", "Nicht gemeldet")}
                              </span>
                            )}
                          </div>

                          {/* Action Buttons */}
                          {(!execStatus || execStatus === "NOT_SUBMITTED" || execStatus === "REJECTED") && (
                            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCableExecutionSubmit(conn.id);
                                }}
                                style={{
                                  flex: 1,
                                  background: "#3b82f6",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 5,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {t("planBma", "confirmExecution", "Ausführung bestätigen")}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCableReportProblem(conn);
                                }}
                                style={{
                                  background: "#ef4444",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 5,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {t("planBma", "reportProblem", "Problem melden")}
                              </button>
                            </div>
                          )}

                          {execStatus === "PENDING_APPROVAL" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCableExecutionUndo(conn.id);
                                }}
                                style={{
                                  width: "100%",
                                  background: "#94a3b8",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 5,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {t("planBma", "withdrawReport", "Meldung zurückziehen")}
                              </button>
                              {isAdminOrMod && (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCableExecutionAction(conn.id, "APPROVED");
                                    }}
                                    style={{
                                      flex: 1,
                                      background: "#22c55e",
                                      color: "#ffffff",
                                      border: "none",
                                      borderRadius: 5,
                                      padding: "4px 8px",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {t("planBma", "approved", "Freigegeben")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCableExecutionAction(conn.id, "REJECTED");
                                    }}
                                    style={{
                                      flex: 1,
                                      background: "#ef4444",
                                      color: "#ffffff",
                                      border: "none",
                                      borderRadius: 5,
                                      padding: "4px 8px",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {t("planBma", "rejectBtn", "Ablehnen")}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {execStatus === "APPROVED" && (
                            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                              {isAdminOrMod && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCableExecutionUndo(conn.id);
                                  }}
                                  style={{
                                    flex: 1,
                                    background: "#94a3b8",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: 5,
                                    padding: "4px 8px",
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("planBma", "withdrawReport", "Meldung zurückziehen")}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCableReportProblem(conn);
                                }}
                                style={{
                                  background: "#ef4444",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 5,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {t("planBma", "reportProblem", "Problem melden")}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {isAdminOrMod && isEditMode && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditCable(conn);
                            }}
                            style={{ background: "#3b82f6", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            ✏️ {t("planBma", "editBtn", "Bearbeiten")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenTooltipId(null);
                              // Start route editing for this cable
                              const rawWps = conn.metadata?.waypoints || [];
                              setEditingRouteCable(conn);
                              setEditingRouteWaypoints(rawWps.length > 0 ? [...rawWps] : []);
                            }}
                            style={{ background: "#8b5cf6", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            title={t("planBma", "cableRouteBtn", "Trasse")}
                          >
                            📍 {t("planBma", "cableRouteBtn", "Trasse")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddParallelCable(conn);
                            }}
                            style={{ background: "#0ea5e9", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            ➕ {t("planBma", "parallelCableBtn", "Parallel")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCableConnection(conn.id);
                            }}
                            style={{ background: "#ef4444", color: "#ffffff", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            🗑️ {t("planBma", "deleteBtn", "Löschen")}
                          </button>
                        </div>
                      )}
                    </div>
                  </TooltipAny>
                )}
              </PolylineAny>

              {/* Highlight Halo for Selected Cable */}
              {isSelected && (
                <PolylineAny
                  positions={displayPts}
                  pathOptions={{
                    color: "#38bdf8",
                    weight: 14,
                    opacity: 0.6,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              )}

              {/* Visible Cable Polyline */}
              {(() => {
                const isPe = meta.is_pe_line || (conn.type as any) === "PE_LINE" || conn.name?.toUpperCase().startsWith("PE") || meta.cable_number?.toUpperCase().startsWith("PE") || (meta.cable_type && (meta.cable_type.toLowerCase().includes("potenzialausgleich") || meta.cable_type.toLowerCase().includes("pe")));
                if (!isPe) {
                  return (
                    <PolylineAny
                      positions={displayPts}
                      pathOptions={{
                        color: isSelected ? "#0284c7" : lineColor,
                        weight: isSelected ? 5.5 : 3.5,
                        opacity: lineOpacity,
                        dashArray: lineDashArray,
                      }}
                    />
                  );
                }
                return (
                  <>
                    <PolylineAny
                      positions={displayPts}
                      pathOptions={{
                        color: isSelected ? "#0284c7" : "#16a34a",
                        weight: isSelected ? 6 : 4.5,
                        opacity: lineOpacity,
                      }}
                    />
                    <PolylineAny
                      positions={displayPts}
                      pathOptions={{
                        color: "#facc15",
                        weight: isSelected ? 3.5 : 2.5,
                        opacity: lineOpacity,
                        dashArray: "8, 8",
                      }}
                    />
                    {displayPts.length >= 2 && (() => {
                      const pPrev = displayPts[displayPts.length - 2];
                      const pLast = displayPts[displayPts.length - 1];
                      const dx = pLast.lng - pPrev.lng;
                      const dy = -(pLast.lat - pPrev.lat);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <MarkerAny
                          position={pLast}
                          interactive={false}
                          icon={L.divIcon({
                            className: "pe-line-arrow-marker",
                            html: `
                              <div style="
                                transform: rotate(${angle}deg);
                                transform-origin: 22px 12px;
                                width: 24px;
                                height: 24px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                pointer-events: none;
                              ">
                                <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0px 1px 3px rgba(0,0,0,0.6));">
                                  <polygon points="2,4 22,12 2,20 8,12" fill="#16a34a" stroke="#facc15" stroke-width="2" />
                                </svg>
                              </div>
                            `,
                            iconSize: [24, 24],
                            iconAnchor: [22, 12],
                          })}
                        />
                      );
                    })()}
                  </>
                );
              })()}

              {/* Dashed Accent Flow Overlay for Selected Cable */}
              {isSelected && (
                <PolylineAny
                  positions={displayPts}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2.5,
                    opacity: 0.95,
                    dashArray: "7, 7",
                  }}
                />
              )}

              {/* Glowing Endpoint Terminal Rings for Selected Cable */}
              {isSelected && displayPts.length >= 2 && (
                <>
                  <CircleMarkerAny
                    center={displayPts[0]}
                    radius={8}
                    pathOptions={{
                      color: "#38bdf8",
                      fillColor: "#0284c7",
                      fillOpacity: 1,
                      weight: 3,
                    }}
                  />
                  <CircleMarkerAny
                    center={displayPts[displayPts.length - 1]}
                    radius={8}
                    pathOptions={{
                      color: "#38bdf8",
                      fillColor: "#0284c7",
                      fillOpacity: 1,
                      weight: 3,
                    }}
                  />
                </>
              )}

              {/* Center Cable Label Badge */}
              <MarkerAny
                position={labelPos}
                interactive={true}
                eventHandlers={{
                  click: (e: any) => {
                    if (e?.originalEvent) e.originalEvent.stopPropagation();
                    setSelectedCableId((prev) => (prev === conn.id ? null : conn.id));
                    setOpenTooltipId((prev) => (prev === conn.id ? null : conn.id));
                  },
                  dblclick: (e: any) => {
                    if (e?.originalEvent) e.originalEvent.stopPropagation();
                    handleOpenEditCable(conn);
                  },
                }}
                icon={L.divIcon({
                  className: "cable-badge",
                  html: badgeHtml,
                  iconSize: [60, 18],
                  iconAnchor: [30, 9],
                })}
              />
            </React.Fragment>
          );
        });
      })()}

      {/* Render all BMA / Notlicht / Kabelbahn / LED Stripe / Abdeckung symbols on map */}
      {symbols
        .filter((s) => isSymbolTypeVisible(s.symbol_type))
        .slice()
        .sort((a, b) => (a.symbol_type === "abdeckung_box" ? -1 : b.symbol_type === "abdeckung_box" ? 1 : 0))
        .map((s) => {
        if (s.symbol_type === "abdeckung_box") {
          return renderAbdeckungBox(s);
        }
        if (s.symbol_type === "kabelbahn") {
          return renderKabelbahn(s);
        }
        if (s.symbol_type === "led_stripe") {
          return renderLedStripe(s);
        }
        if (s.symbol_type === "geraet_box") {
          return renderGeraetBox(s);
        }
        if (s.symbol_type === "revision_cloud") {
          return renderRevisionCloud(s);
        }

        const latlng = normCoordsToLatLng(s.x_norm, s.y_norm);
        const isEmergency = s.symbol_type === "notlicht_lampe" || s.symbol_type === "notlicht_pikto" || s.symbol_type === "notlicht_pikto_gross";

        return (
          <MarkerAny
            key={s.id}
            position={latlng}
            icon={getSymbolIcon(s.symbol_type, s.label, s.description)}
            draggable={!activeSymbolType && isAdmin && isEditMode}
            interactive={!activeSymbolType}
            eventHandlers={{
              dragend: (e: any) => handleDragEnd(s.id, e),
              click: (e: any) => handleDeviceClick(s, e),
            }}
          >
            {openTooltipId === s.id && !activeSymbolType && (
              <TooltipAny
                permanent
                interactive
                opacity={1}
                direction="top"
                offset={[0, -Math.round(targetSize / 2)]}
              >
                <div
                  ref={(el) => {
                    if (el) {
                      L.DomEvent.disableClickPropagation(el);
                      L.DomEvent.disableScrollPropagation(el);
                    }
                  }}
                  style={{ padding: 4, minWidth: 160 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 800, fontSize: 12, color: "#f87171", marginBottom: 4 }}>
                    {getSymbolName(s.symbol_type)}
                  </div>

                  {isEmergency ? (
                    <>
                      {s.loop_number && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          Stromkreis: <b style={{ color: "#38bdf8" }}>{s.loop_number}</b>
                        </div>
                      )}
                      {s.address && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          Leuchte-Nr.: <b style={{ color: "#38bdf8" }}>{s.address}</b>
                        </div>
                      )}
                      {s.label && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", marginTop: 2 }}>
                          Kennzeichnung: {s.label}
                        </div>
                      )}
                    </>
                  ) : (
                    s.label && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", marginBottom: 2 }}>
                        {t("planBma", "addressLabel", "Bezeichnung")}: {s.label}
                      </div>
                    )
                  )}

                    {(() => {
                      let cleanDesc = "";
                      let extraBadge: React.ReactNode = null;
                      let photoUrl: string | null = null;
                      if (s.description) {
                        if (s.description.startsWith("{")) {
                          try {
                            const parsed = JSON.parse(s.description);
                            cleanDesc = parsed.desc || "";
                            let vName = parsed.variantName || "";
                            let vModel = parsed.variantModel || "";

                            if (lampTypesData.variants && lampTypesData.variants.length > 0) {
                              const st = s.symbol_type as string;
                              const isHeating = st === 'warmepumpe_aussen' || st === 'warmepumpe_innen' || st === 'infrarotheizung' || st === 'geraet_box';
                              const found = lampTypesData.variants.find((v) => {
                                const vIsHeating = v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box';
                                if (isHeating !== vIsHeating) return false;
                                if (v.category && v.category !== st && !(v.category === 'geraet_box' && st === 'geraet_box')) return false;
                                if (parsed.variantId && v.id === parsed.variantId) return true;
                                if (parsed.variantName && v.name === parsed.variantName) return true;
                                if (parsed.variantModel && v.model && v.model === parsed.variantModel) return true;
                                return false;
                              });
                              if (found) {
                                if (found.name) vName = found.name;
                                if (found.model) vModel = found.model;
                                photoUrl = found.photoUrl || found.photoBase64 || (found as any).photo_url || (found as any).image_url || (found as any).imageUrl || null;
                              }
                            }
                            if (!photoUrl && (parsed.photoUrl || parsed.photoBase64)) {
                              photoUrl = parsed.photoUrl || parsed.photoBase64;
                            }

                            if (vName) {
                              extraBadge = (
                                <>
                                  {extraBadge}
                                  <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 800, marginTop: 2 }}>
                                    {vName}
                                  </div>
                                </>
                              );
                            }
                            if (vModel) {
                              extraBadge = (
                                <>
                                  {extraBadge}
                                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>
                                    {t("planBma", "modelLabel", "Modell")}: {vModel}
                                  </div>
                                </>
                              );
                            }

                            if (photoUrl) {
                              extraBadge = (
                                <>
                                  {extraBadge}
                                  <div
                                    style={{
                                      width: "100%",
                                      height: 100,
                                      borderRadius: 6,
                                      overflow: "hidden",
                                      marginTop: 6,
                                      marginBottom: 6,
                                      border: "1px solid rgba(255,255,255,0.25)",
                                      background: "#0f172a",
                                      cursor: "pointer",
                                      position: "relative",
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFullscreenPhotoUrl(photoUrl);
                                    }}
                                    title={t("planBma", "zoomPhoto", "Foto vergrößern")}
                                  >
                                    <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                    <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,0.75)", color: "#ffffff", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>
                                      🔍 {t("planBma", "zoomPhoto", "Foto vergrößern")}
                                    </div>
                                  </div>
                                </>
                              );
                            }

                            if (parsed.powerKw) {
                              extraBadge = (
                                <>
                                  {extraBadge}
                                  <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginTop: 2 }}>
                                    ⚡ {parsed.powerKw.includes('kW') ? parsed.powerKw : parsed.powerKw + ' kW'}
                                  </div>
                                </>
                              );
                            }
                            if (parsed.zuleitung) {
                              extraBadge = (
                                <>
                                  {extraBadge}
                                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                                    🔌 {parsed.zuleitung}
                                  </div>
                                </>
                              );
                            }
                            if (parsed.direction && (s.symbol_type === "notlicht_pikto" || s.symbol_type === "notlicht_pikto_gross")) {
                              const dirLabels: Record<string, string> = {
                                left: t("planBma", "dirLeft", "Links ⬅"),
                                right: t("planBma", "dirRight", "Rechts ➔"),
                                down: t("planBma", "dirDown", "Unten ⬇"),
                                up: t("planBma", "dirUp", "Oben ⬆"),
                              };
                              extraBadge = (
                                <>
                                  {extraBadge}
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                    {t("planBma", "directionLabel", "Pfeilrichtung (Fluchtweg)")}: <b style={{ color: "#4ade80" }}>{dirLabels[parsed.direction] || parsed.direction}</b>
                                  </div>
                                </>
                              );
                            }
                          } catch {}
                        } else {
                          cleanDesc = s.description.startsWith("{") || s.description.includes("w_norm") || s.description.includes("orientation") ? "" : s.description;
                        }
                      }
                      return (
                        <>
                          {extraBadge}
                          {cleanDesc && (
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{cleanDesc}</div>
                          )}
                        </>
                      );
                    })()}

                  {/* Direct Quick Serial & Photos Actions directly in tooltip */}
                  {renderTooltipQuickSerialAndPhotos(s)}

                  {isAdminOrMod && isEditMode && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditSymbol(s);
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        ✏️ {t("planBma", "edit", "Bearbeiten")}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSymbol(s.id);
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        🗑 {t("planBma", "delete", "Symbol löschen")}
                      </button>
                    </div>
                  )}
                </div>
              </TooltipAny>
            )}
          </MarkerAny>
        );
      })}

      {/* Palette Selection Modal / Responsive Touch Sheet */}
      {paletteOpen &&
        isAdminOrMod &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div className={styles.paletteModal} onClick={() => setPaletteOpen(false)}>
            <div
              className={styles.paletteCard}
              style={{ maxWidth: 540 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header with Back Button */}
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {selectedCategoryFilter !== "all" && !symbolSearchQuery && (
                    <button
                      type="button"
                      className={styles.backBtn}
                      onClick={() => setSelectedCategoryFilter("all")}
                    >
                      ← {t("planBma", "backToCategories", "Zurück")}
                    </button>
                  )}
                  <h3 className={styles.modalTitle}>
                    {symbolSearchQuery
                      ? `🔍 ${t("planBma", "searchResults", "Suchergebnisse")}`
                      : selectedCategoryFilter !== "all"
                      ? (() => {
                          const catMap: Record<string, string> = {
                            heating: `🔥 ${t("planBma", "catHeizung", "Heizung & Klimatechnik")}`,
                            notlicht: `🟢 ${t("planBma", "catNotbeleuchtung", "Notbeleuchtung & Evakuierung")}`,
                            bma: `🚨 ${t("planBma", "catBma", "Brandmeldeanlage (BMA)")}`,
                            lighting: `💡 ${t("planBma", "catBeleuchtung", "Beleuchtung")}`,
                            trassen: `🔌 ${t("planBma", "catAuslassTrassen", "Auslässe, Trassen & PE")}`,
                          };
                          return catMap[selectedCategoryFilter] || t("planBma", "selectSymbol", "Symbol auswählen");
                        })()
                      : `🚨 ${t("planBma", "selectSymbol", "Symbol auswählen")}`}
                  </h3>
                </div>
                <button type="button" className={styles.closeBtn} onClick={() => setPaletteOpen(false)}>✕</button>
              </div>

              {/* 1. Real-time Search Input */}
              <div className={styles.searchInputWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder={t("planBma", "searchSymbolPlaceholder", "Symbol suchen...")}
                  value={symbolSearchQuery}
                  onChange={(e) => setSymbolSearchQuery(e.target.value)}
                  autoFocus
                />
                {symbolSearchQuery && (
                  <button
                    type="button"
                    className={styles.clearSearchBtn}
                    onClick={() => setSymbolSearchQuery("")}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 2. Category Filter Tabs */}
              <div className={styles.categoryTabs}>
                {[
                  { id: "all", label: t("planBma", "allCategories", "Alle Kategorien"), icon: "⚡" },
                  { id: "favorites", label: t("planBma", "catFavorites", "Favoriten"), icon: "⭐" },
                  { id: "heating", label: t("planBma", "catHeizung", "Heizung"), icon: "🔥" },
                  { id: "notlicht", label: t("planBma", "catNotbeleuchtung", "Notbeleuchtung"), icon: "🟢" },
                  { id: "bma", label: t("planBma", "catBma", "BMA"), icon: "🚨" },
                  { id: "lighting", label: t("planBma", "catBeleuchtung", "Beleuchtung"), icon: "💡" },
                  { id: "trassen", label: t("planBma", "catAuslassTrassen", "Trassen & PE"), icon: "🔌" },
                  { id: "lamptypes", label: t("planBma", "catLampTypes", "Typy opraw & Fotos"), icon: "📷" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`${styles.categoryTab} ${selectedCategoryFilter === cat.id ? styles.categoryTabActive : ""}`}
                    onClick={() => {
                      if (cat.id === "lamptypes") {
                        setLampTypesModalOpen(true);
                      } else {
                        setSelectedCategoryFilter(cat.id);
                      }
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* 3. Recently Used Symbols (if on 'all' view) */}
              {!symbolSearchQuery && recentSymbols.length > 0 && selectedCategoryFilter === "all" && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 6 }}>
                    🕒 {t("planBma", "recentlyUsedSymbols", "Zuletzt verwendet")}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {recentSymbols.map((recType) => {
                      const isTool = recType === "pe_line" || recType === "cable_connect" || recType === "free_line" || recType === "revisionsklappe";
                      const title = isTool
                        ? (recType === "pe_line" ? "PE-Leitung" : recType === "cable_connect" ? "Kabel verbinden" : recType === "revisionsklappe" ? t("planKlappen", "toolbarBtn", "Revisionsklappe") : "Freie Leitung")
                        : getSymbolName(recType as BmaSymbolType);
                      const icon = isTool
                        ? (recType === "pe_line" ? "⚡" : recType === "cable_connect" ? "🔌" : recType === "revisionsklappe" ? "🔲" : "〰")
                        : (BMA_SYMBOLS_CONFIG[recType as BmaSymbolType]?.iconUrl ? <img src={BMA_SYMBOLS_CONFIG[recType as BmaSymbolType].iconUrl} alt="" style={{ width: 16, height: 16 }} /> : "⚡");

                      return (
                        <button
                          key={recType}
                          type="button"
                          className={styles.quickBtn}
                          onClick={() => {
                            if (recType === "revisionsklappe") {
                              onEnsureLayerVisible?.("klappen");
                              window.dispatchEvent(new CustomEvent("start-draw-revisionsklappe"));
                              setActiveSymbolType(null);
                              setActiveTool(null);
                            } else if (isTool) {
                              onEnsureLayerVisible?.("cables");
                              setActiveSymbolType(null);
                              setActiveTool(recType as any);
                            } else {
                              const layer = BMA_SYMBOLS_CONFIG[recType as BmaSymbolType]?.isHeating ? "heating"
                                : BMA_SYMBOLS_CONFIG[recType as BmaSymbolType]?.isEmergency ? "notlicht"
                                : BMA_SYMBOLS_CONFIG[recType as BmaSymbolType]?.isLight ? "lighting"
                                : BMA_SYMBOLS_CONFIG[recType as BmaSymbolType]?.isOutlet ? "kabelauslass"
                                : BMA_SYMBOLS_CONFIG[recType as BmaSymbolType]?.isLadder ? "kabelbahn" : "bma";
                              onEnsureLayerVisible?.(layer as any);
                              setActiveSymbolType(recType as BmaSymbolType);
                              setActiveTool(null);
                            }
                            recordRecentSymbol(recType);
                            setPaletteOpen(false);
                          }}
                          style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#f8fafc" }}
                        >
                          <span>{icon}</span>
                          <span>{title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Category Overview Cards or Filtered Symbol Grid */}
              <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
                {(() => {
                  const query = symbolSearchQuery.trim().toLowerCase();

                  // CASE A: CATEGORY CARDS OVERVIEW (when 'all' is selected and no search query)
                  if (selectedCategoryFilter === "all" && !query) {
                    const mainCategories = [
                      { id: "favorites", title: t("planBma", "catFavorites", "Favoriten & Schnellwahl"), icon: "⭐", color: "#f59e0b", count: userFavorites.length, desc: t("planBma", "manageFavoritesHint", "Klicken Sie ⭐ bei einem Symbol") },
                      { id: "heating", title: t("planBma", "catHeizung", "Heizung & Klimatechnik"), icon: "🔥", color: "#0284c7", count: 5, desc: "Wärmepumpen, Infrarot, Fühler, Box" },
                      { id: "lighting", title: t("planBma", "catBeleuchtung", "Beleuchtung"), icon: "💡", color: "#f59e0b", count: 2, desc: "Lampen, LED Stripes" },
                      { id: "bma", title: t("planBma", "catBma", "Brandmeldeanlage (BMA)"), icon: "🚨", color: "#ef4444", count: 3, desc: "D-Melder, ZWD-Melder, Sirenen" },
                      { id: "notlicht", title: t("planBma", "catNotbeleuchtung", "Notbeleuchtung & Evakuierung"), icon: "🟢", color: "#22c55e", count: 3, desc: "Sicherheitsleuchten, Piktogramme" },
                      { id: "trassen", title: t("planBma", "catAuslassTrassen", "Auslässe, Trassen & PE"), icon: "🔌", color: "#10b981", count: 5, desc: "Auslass, Kabelbahn, PE-Leitung, Kabel" },
                      { id: "lamptypes", title: t("planBma", "catLampTypes", "Typy opraw & Fotos"), icon: "📷", color: "#10b981", count: "⚡", desc: "Modelle, Notizen & PDF-Fotos Legende", isAction: true },
                    ];

                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, padding: "4px 0" }}>
                        {mainCategories.map((cat) => (
                          <div
                            key={cat.id}
                            className={styles.categoryCard}
                            onClick={() => {
                              if (cat.isAction) {
                                setLampTypesModalOpen(true);
                              } else {
                                setSelectedCategoryFilter(cat.id);
                              }
                            }}
                            style={{ borderColor: `${cat.color}55` }}
                          >
                            <div style={{ fontSize: 32, flexShrink: 0 }}>{cat.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#f8fafc", lineHeight: 1.2 }}>
                                {cat.title}
                              </div>
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                                {cat.desc}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: cat.color, marginTop: 4 }}>
                                {cat.count} {t("planBma", "symbolsCount", "Symbole")} →
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  // CASE B & C: FILTERED SYMBOLS VIEW (When category is selected or search query active)
                  const ALL_ITEMS = [
                    // Heizung
                    { type: "warmepumpe_aussen" as BmaSymbolType, cat: "heating", keywords: "wp außen wärmepumpe außen heating pompa ciepła" },
                    { type: "warmepumpe_innen" as BmaSymbolType, cat: "heating", keywords: "wp innen wärmepumpe innen heating pompa ciepła" },
                    { type: "infrarotheizung" as BmaSymbolType, cat: "heating", keywords: "infrarotheizung infrarotstrahler heater ogrzewanie" },
                    { type: "temperaturfuehler" as BmaSymbolType, cat: "heating", keywords: "temperaturfühler fühler sensor czujnik temperatury" },
                    { type: "geraet_box" as BmaSymbolType, cat: "heating", keywords: "gerät box steuerung prostokąt skrzynka" },

                    // Notbeleuchtung
                    { type: "notlicht_lampe" as BmaSymbolType, cat: "notlicht", keywords: "notlicht lampe sicherheitsleuchte emergency light oprawa ewakuacyjna oprawa" },
                    { type: "notlicht_pikto_gross" as BmaSymbolType, cat: "notlicht", keywords: "rettungszeichen groß rz-g pikto ewakuacja piktogram" },
                    { type: "notlicht_pikto" as BmaSymbolType, cat: "notlicht", keywords: "rettungszeichen klein rz-k pikto ewakuacja piktogram" },

                    // BMA
                    { type: "detector_red" as BmaSymbolType, cat: "bma", keywords: "d-melder bma rot smoke detector czujka pożarowa" },
                    { type: "detector_blue" as BmaSymbolType, cat: "bma", keywords: "zwd-melder bma blau smoke detector czujka niebieska" },
                    { type: "dis_signalgeber" as BmaSymbolType, cat: "bma", keywords: "dis sirene signalgeber siren syrena" },
                    { type: "sirene" as BmaSymbolType, cat: "bma", keywords: "sirene siren syrena glosnik glosniczek horn akustisch signalgeber wandmontage" },

                    // Beleuchtung
                    { type: "lampe" as BmaSymbolType, cat: "lighting", keywords: "lampe leuchte light lamp oprawa lampka typy opraw oprawy" },
                    { type: "led_stripe" as BmaSymbolType, cat: "lighting", keywords: "led stripe pasek led taśma led oprawa" },

                    // Trassen & PE
                    { type: "kabelauslass" as BmaSymbolType, cat: "trassen", keywords: "kabelauslass outlet wypust kablowy" },
                    { type: "kabelbahn" as BmaSymbolType, cat: "trassen", keywords: "kabelbahn kabeltrasse tray koryto trasa" },
                    { type: "ueberspannungsschutz" as BmaSymbolType, cat: "trassen", keywords: "überspannungsschutz spd surge protection ochronnik przeciwprzepięciowy uziemienie pe ochrona oprawa kabel" },
                    { isTool: true, toolType: "pe_line", cat: "trassen", name: t("planBma", "quickPeLine", "PE-Leitung (Potenzialausgleich)"), icon: "⚡", keywords: "pe leitung potenzialausgleich uziemienie ground line wyrównawcze kabel" },
                    { isTool: true, toolType: "cable_connect", cat: "trassen", name: t("planBma", "quickCableConnect", "Kabel verbinden"), icon: "🔌", keywords: "kabel verbinden connection połączenie kablowe" },
                    { isTool: true, toolType: "free_line", cat: "trassen", name: t("planBma", "quickFreeLine", "Freie Leitung"), icon: "〰", keywords: "freie leitung free line linia swobodna kabel" },
                    { isTool: true, toolType: "revisionsklappe", cat: "trassen", name: t("planKlappen", "toolbarBtn", "Revisionsklappe"), icon: "🔲", keywords: "revisionsklappe klappe rewizyjna hatch klapy rewizyjne rk" },
                    { type: "abdeckung_box" as BmaSymbolType, cat: "trassen", keywords: "abdeckung maske prostokąt maskujący abdeckung_box cover white rectangle zakrywanie zakryj plan" },
                    { type: "revision_cloud" as BmaSymbolType, cat: "trassen", keywords: "revision_cloud anderung wolke chmura zmian chmurka revision cloud rkWolke zeichnung" },
                  ];

                  const categoryTitles: Record<string, { title: string; color: string; icon: string }> = {
                    favorites: { title: t("planBma", "catFavorites", "Favoriten & Schnellwahl"), color: "#f59e0b", icon: "⭐" },
                    heating: { title: t("planBma", "catHeizung", "Heizung & Klimatechnik"), color: "#38bdf8", icon: "🔥" },
                    notlicht: { title: t("planBma", "catNotbeleuchtung", "Notbeleuchtung / Sicherheitsbeleuchtung"), color: "#4ade80", icon: "🟢" },
                    bma: { title: t("planBma", "catBma", "Brandmeldeanlage (BMA)"), color: "#f87171", icon: "🚨" },
                    lighting: { title: t("planBma", "catBeleuchtung", "Beleuchtung (Oświetlenie ogólne)"), color: "#fbbf24", icon: "💡" },
                    trassen: { title: t("planBma", "catAuslassTrassen", "Auslässe, Trassen & PE"), color: "#34d399", icon: "🔌" },
                  };

                  const filteredItems = ALL_ITEMS.filter((item) => {
                    const itemKey = item.isTool ? item.toolType : item.type!;
                    if (selectedCategoryFilter === "favorites" && !userFavorites.includes(itemKey)) return false;
                    if (selectedCategoryFilter !== "all" && selectedCategoryFilter !== "favorites" && item.cat !== selectedCategoryFilter) return false;
                    if (!query) return true;
                    const nameStr = item.isTool ? item.name : getSymbolName(item.type!);
                    const fullText = `${nameStr} ${item.keywords} ${categoryTitles[item.cat]?.title || ""}`.toLowerCase();
                    return fullText.includes(query);
                  });

                  if (filteredItems.length === 0) {
                    return (
                      <div style={{ textAlign: "center", padding: "28px 12px", color: "#94a3b8", fontSize: 13 }}>
                        🔍 {t("planBma", "noSymbolsFound", "Keine Symbole gefunden")}
                      </div>
                    );
                  }

                  const categoriesPresent = Array.from(new Set(filteredItems.map((i) => i.cat)));

                  return categoriesPresent.map((catKey) => {
                    const groupItems = filteredItems.filter((i) => i.cat === catKey);
                    const catMeta = categoryTitles[catKey] || { title: catKey, color: "#38bdf8", icon: "⚡" };

                    return (
                      <div key={catKey} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: catMeta.color, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{catMeta.icon}</span>
                          <span>{catMeta.title}</span>
                        </div>

                        <div className={styles.paletteGrid}>
                          {groupItems.map((item) => {
                            if (item.isTool) {
                              const isActive = activeTool === item.toolType;
                              const isFav = userFavorites.includes(item.toolType);
                              return (
                                <div
                                  key={item.toolType}
                                  className={`${styles.paletteItem} ${isActive ? styles.paletteItemActive : ""}`}
                                  onClick={() => {
                                    if (item.toolType === "revisionsklappe") {
                                      onEnsureLayerVisible?.("klappen");
                                      window.dispatchEvent(new CustomEvent("start-draw-revisionsklappe"));
                                      setActiveSymbolType(null);
                                      setActiveTool(null);
                                    } else {
                                      onEnsureLayerVisible?.("cables");
                                      setActiveSymbolType(null);
                                      setActiveTool(item.toolType as any);
                                    }
                                    recordRecentSymbol(item.toolType);
                                    setPaletteOpen(false);
                                  }}
                                  style={{ position: "relative", borderColor: isActive ? "#38bdf8" : `${catMeta.color}44` }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(item.toolType);
                                    }}
                                    style={{
                                      position: "absolute",
                                      top: 4,
                                      right: 4,
                                      background: "transparent",
                                      border: "none",
                                      fontSize: 16,
                                      cursor: "pointer",
                                      color: isFav ? "#f59e0b" : "#64748b",
                                    }}
                                    title={isFav ? t("planBma", "removeFromFavorites", "Usunięto z ulubionych") : t("planBma", "addToFavorites", "Dodaj do ulubionych")}
                                  >
                                    {isFav ? "⭐" : "☆"}
                                  </button>
                                  <div style={{ fontSize: 24, margin: "4px 0" }}>{item.icon}</div>
                                  <div className={styles.paletteLabel}>{item.name}</div>
                                </div>
                              );
                            }

                            const type = item.type!;
                            const conf = BMA_SYMBOLS_CONFIG[type];
                            const isActive = activeSymbolType === type;
                            const name = getSymbolName(type);
                            const isFav = userFavorites.includes(type);

                            return (
                              <div
                                key={type}
                                className={`${styles.paletteItem} ${isActive ? styles.paletteItemActive : ""}`}
                                onClick={() => {
                                  const layer = type === "abdeckung_box" ? "abdeckung"
                                    : item.cat === "heating" ? "heating"
                                    : item.cat === "notlicht" ? "notlicht"
                                    : item.cat === "lighting" ? "lighting"
                                    : item.cat === "trassen" ? (type === "kabelbahn" ? "kabelbahn" : "kabelauslass")
                                    : "bma";
                                  onEnsureLayerVisible?.(layer as any);
                                  if (type === "kabelbahn") {
                                    setDrawingKabelbahnPoints([]);
                                    setHoverLatLng(null);
                                  } else if (type === "led_stripe") {
                                    setDrawingLedStripeStart(null);
                                    setHoverLatLng(null);
                                  } else if (type === "geraet_box") {
                                    setDrawingGeraetBoxStart(null);
                                    setHoverLatLng(null);
                                  }
                                  setActiveSymbolType(type);
                                  setActiveTool(null);
                                  recordRecentSymbol(type);
                                  setPaletteOpen(false);
                                }}
                                style={{ position: "relative", borderColor: isActive ? "#dc2626" : `${catMeta.color}44` }}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(type);
                                  }}
                                  style={{
                                    position: "absolute",
                                    top: 4,
                                    right: 4,
                                    background: "transparent",
                                    border: "none",
                                    fontSize: 16,
                                    cursor: "pointer",
                                    color: isFav ? "#f59e0b" : "#64748b",
                                  }}
                                  title={isFav ? t("planBma", "removeFromFavorites", "Usunięto z ulubionych") : t("planBma", "addToFavorites", "Dodaj do ulubionych")}
                                >
                                  {isFav ? "⭐" : "☆"}
                                </button>
                                <img src={conf.iconUrl} alt={name} className={styles.paletteIcon} />
                                <div className={styles.paletteLabel}>{name}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── EDITING EXISTING CABLE ROUTE OVERLAY ── */}
      {editingRouteCable && (
        <>
          {/* Top banner control for route editing */}
          <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000, background: "#0f172a", border: "2px solid #8b5cf6", color: "#f8fafc", padding: "10px 18px", borderRadius: 10, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.6)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              📍 Edycja trasy kabla: <b style={{ color: "#a78bfa" }}>{editingRouteCable.name || "Kabel"}</b>
              <span style={{ fontSize: 11, color: "#94a3b8", display: "block", fontWeight: 400 }}>Przeciągaj punkty | Kliknij trasę, aby dodać punkt | Podwójne kliknięcie punktu usuwa go</span>
            </span>
            {editingRouteWaypoints.length > 0 && (
              <button
                type="button"
                onClick={() => setEditingRouteWaypoints((prev) => prev.slice(0, -1))}
                style={{ background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
              >
                ↶ Cofnij punkt (Esc)
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveEditedRoute}
              style={{ background: "#10b981", color: "#ffffff", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 800, cursor: "pointer", fontSize: 13, boxShadow: "0 0 12px rgba(16,185,129,0.5)" }}
            >
              ✓ Zapisz trasę (Enter)
            </button>
            <button
              type="button"
              onClick={() => setEditingRouteCable(null)}
              style={{ background: "#475569", color: "#ffffff", border: "none", borderRadius: 6, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
            >
              Anuluj
            </button>
          </div>
        </>
      )}

      {/* ── UNDO DELETED ITEMS TOAST BANNER ── */}
      {(lastDeletedMessage || deletedItemsStack.length > 0) && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100000,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1.5px solid #38bdf8",
          color: "#f8fafc",
          padding: "10px 18px",
          borderRadius: 12,
          display: "flex",
          gap: 14,
          alignItems: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(56,189,248,0.25)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🗑️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
              {lastDeletedMessage || `Usunięto ${deletedItemsStack.length} elementów`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleUndoDelete}
            style={{
              background: "linear-gradient(135deg, #0284c7, #2563eb)",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 8px rgba(37,99,235,0.4)",
            }}
          >
            <span>↩️</span>
            <span>Cofnij (Ctrl+Z)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLastDeletedMessage(null);
              setDeletedItemsStack([]);
              deletedItemsStackRef.current = [];
            }}
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#94a3b8",
              border: "none",
              borderRadius: "50%",
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 12,
            }}
            title="Zamknij"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal for setting or editing symbol data */}
      {(modalCoords || editingSymbol) &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className={styles.paletteModal}
            onClick={() => {
              setModalCoords(null);
              setEditingSymbol(null);
            }}
          >
            <div
              ref={modalRef}
              className={styles.paletteCard}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const currentType = modalCoords ? modalCoords.symbol_type : (editingSymbol?.symbol_type as BmaSymbolType);
                const conf = currentType ? BMA_SYMBOLS_CONFIG[currentType] : null;
                const isEmergency = conf?.isEmergency;
                const isLight = (currentType as string) === "lampe";
                const isStripe = (currentType as string) === "led_stripe";
                const isOutlet = (currentType as string) === "kabelauslass";
                const isKb = (currentType as string) === "kabelbahn";
                const isRevisionCloud = (currentType as string) === "revision_cloud";
                const isAbdeckung = (currentType as string) === "abdeckung_box";
                const isHeating = conf?.isHeating || (currentType as string) === "warmepumpe_aussen" || (currentType as string) === "warmepumpe_innen" || (currentType as string) === "infrarotheizung" || (currentType as string) === "geraet_box";

                return (
                  <>
                    <div className={styles.modalHeader}>
                      <h3 className={styles.modalTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {conf && <img src={conf.iconUrl} width={28} height={28} alt="" />}
                        <span>
                          {editingSymbol
                            ? `✏️ ${t("planBma", "editTitle", "Symbol bearbeiten")}: ${getSymbolName(currentType)}`
                            : `${t("planBma", "modalTitle", "Einfügen")}: ${getSymbolName(currentType)}`}
                        </span>
                      </h3>
                      <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={() => {
                          setModalCoords(null);
                          setEditingSymbol(null);
                        }}
                        disabled={saving}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Duplicate Warning Banner */}
                    {duplicateWarning && (
                      <div
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.5)",
                          color: "#fca5a5",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "12px",
                        }}
                      >
                        <span style={{ fontSize: "15px" }}>⚠️</span>
                        <span>{duplicateWarning}</span>
                      </div>
                    )}

                    {/* Category Selector (allows switching lamp / pikto / other type for this specific element) */}
                    <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                      <label className={styles.label}>
                        💡 {t("planBma", "symbolCategoryLabel", "Kategoria / Rodzaj symbolu:")}
                      </label>
                      <select
                        value={currentType}
                        onChange={(e) => {
                          const newType = e.target.value as BmaSymbolType;
                          if (modalCoords) {
                            setModalCoords({ ...modalCoords, symbol_type: newType });
                          } else if (editingSymbol) {
                            setEditingSymbol({ ...editingSymbol, symbol_type: newType });
                          }
                        }}
                        className={styles.input}
                        style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}
                      >
                        <option value="warmepumpe_aussen">❄️ {t("planBma", "warmepumpeAussen", "Wärmepumpe Außen")}</option>
                        <option value="warmepumpe_innen">🏠 {t("planBma", "warmepumpeInnen", "Wärmepumpe Innen")}</option>
                        <option value="infrarotheizung">🔥 {t("planBma", "infrarotheizung", "Infrarotheizung")}</option>
                        <option value="geraet_box">🎛️ {t("planBma", "geraetBox", "Anderes Gerät / Steuerung (Rechteck)")}</option>
                        <option value="notlicht_lampe">🚨 {t("planBma", "notlichtLampe", "Notbeleuchtung Lampe (Sicherheitsleuchte)")}</option>
                        <option value="notlicht_pikto">🚪 {t("planBma", "notlichtPiktoKlein", "Rettungszeichen klein (RZ-K)")}</option>
                        <option value="notlicht_pikto_gross">🚪 {t("planBma", "notlichtPiktoGross", "Rettungszeichen groß (RZ-G)")}</option>
                        <option value="lampe">💡 {t("planBma", "lampe", "Normale Lampe (Leuchte)")}</option>
                        <option value="led_stripe">🟡 {t("planBma", "ledStripe", "LED Stripe")}</option>
                        <option value="detector_blue">🔵 {t("planBma", "detectorBlue", "ZWD-Melder")}</option>
                        <option value="detector_red">🔴 {t("planBma", "detectorRed", "D-Melder")}</option>
                        <option value="dis_signalgeber">📢 {t("planBma", "disSignalgeber", "D-Melder mit Sirene")}</option>
                        <option value="kabelauslass">⚡ {t("planBma", "kabelauslass", "Kabelauslass (KA)")}</option>
                        <option value="kabelbahn">🛤️ {t("planBma", "kabelbahn", "Kabelbahn (KB)")}</option>
                        <option value="ueberspannungsschutz">⚡ {t("planBma", "quickUeberspannungsschutz", "Überspannungsschutz (SPD)")}</option>
                        <option value="revision_cloud">☁️ {t("planBma", "revisionCloud", "Änderungs-Wolke")}</option>
                        <option value="abdeckung_box">⬜ {t("planBma", "abdeckung", "Abdeckung (Weisse Maske)")}</option>
                      </select>
                    </div>

                    {/* Orientation & Size Controls for Geraet Box */}
                    {(currentType === "geraet_box" || currentType === "infrarotheizung") && (
                      <>
                        <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                          <label className={styles.label}>
                            📐 Ausrichtung (Orientacja):
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setGeraetDirection("waagerecht")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                padding: "8px 12px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                border: geraetDirection === "waagerecht" ? "2px solid #0284c7" : "1px solid rgba(255,255,255,0.15)",
                                background: geraetDirection === "waagerecht" ? "rgba(2, 132, 199, 0.25)" : "#1e293b",
                                color: geraetDirection === "waagerecht" ? "#38bdf8" : "#94a3b8",
                              }}
                            >
                              <span>⟷ Waagerecht (Poziomo)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setGeraetDirection("senkrecht")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                padding: "8px 12px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                border: geraetDirection === "senkrecht" ? "2px solid #0284c7" : "1px solid rgba(255,255,255,0.15)",
                                background: geraetDirection === "senkrecht" ? "rgba(2, 132, 199, 0.25)" : "#1e293b",
                                color: geraetDirection === "senkrecht" ? "#38bdf8" : "#94a3b8",
                              }}
                            >
                              <span>↕ Senkrecht (Pionowo)</span>
                            </button>
                          </div>
                        </div>

                        {currentType === "geraet_box" && (
                          <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                            <label className={styles.label}>
                              📏 Rozmiar symbolu (Größe):
                            </label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => setGeraetSize("normal")}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 6,
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  border: geraetSize === "normal" ? "2px solid #10b981" : "1px solid rgba(255,255,255,0.15)",
                                  background: geraetSize === "normal" ? "rgba(16, 185, 129, 0.25)" : "#1e293b",
                                  color: geraetSize === "normal" ? "#34d399" : "#94a3b8",
                                }}
                              >
                                <span>🟦 Normalny (100%)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setGeraetSize("small")}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 6,
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  border: geraetSize === "small" ? "2px solid #10b981" : "1px solid rgba(255,255,255,0.15)",
                                  background: geraetSize === "small" ? "rgba(16, 185, 129, 0.25)" : "#1e293b",
                                  color: geraetSize === "small" ? "#34d399" : "#94a3b8",
                                }}
                              >
                                <span>🔹 Mały (-50%)</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Size Selector for Rettungszeichen */}
                    {(currentType === "notlicht_pikto" || currentType === "notlicht_pikto_gross") && (
                      <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                        <label className={styles.label}>
                          {t("planBma", "sizeOption", "Größe / Format")}
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (modalCoords) {
                                setModalCoords({ ...modalCoords, symbol_type: "notlicht_pikto" });
                              } else if (editingSymbol) {
                                setEditingSymbol({ ...editingSymbol, symbol_type: "notlicht_pikto" });
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "6px 8px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              border: currentType === "notlicht_pikto" ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.15)",
                              background: currentType === "notlicht_pikto" ? "rgba(34, 197, 94, 0.2)" : "#1e293b",
                              color: currentType === "notlicht_pikto" ? "#4ade80" : "#94a3b8",
                            }}
                          >
                            <img src="/symbols/bma/notlicht_pikto.svg" width={20} height={20} alt="" />
                            <span>{t("planBma", "sizeKlein", "Klein (Standard)")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (modalCoords) {
                                setModalCoords({ ...modalCoords, symbol_type: "notlicht_pikto_gross" });
                              } else if (editingSymbol) {
                                setEditingSymbol({ ...editingSymbol, symbol_type: "notlicht_pikto_gross" });
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "6px 8px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              border: currentType === "notlicht_pikto_gross" ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.15)",
                              background: currentType === "notlicht_pikto_gross" ? "rgba(34, 197, 94, 0.2)" : "#1e293b",
                              color: currentType === "notlicht_pikto_gross" ? "#4ade80" : "#94a3b8",
                            }}
                          >
                            <img src="/symbols/bma/notlicht_pikto_gross.svg" width={28} height={14} alt="" />
                            <span>{t("planBma", "sizeGross", "Groß (Weitbereich)")}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Direction Selector for Fluchtweg & Sirene */}
                    {(currentType === "notlicht_pikto" || currentType === "notlicht_pikto_gross" || currentType === "sirene") && (
                      <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                        <label className={styles.label}>
                          {currentType === "sirene" ? "Richtung (Wandmontage) / Kierunek głośnika:" : t("planBma", "directionLabel", "Pfeilrichtung (Fluchtweg)")}
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                          {(["left", "up", "down", "right"] as PiktoDirection[]).map((dir) => {
                            const isSelected = arrowDirection === dir;
                            const previewIconUrl = getPiktoIconUrl(currentType, dir);
                            const dirName =
                              dir === "left"
                                ? (currentType === "sirene" ? "Links ⬅" : t("planBma", "dirLeft", "Links ⬅"))
                                : dir === "right"
                                ? (currentType === "sirene" ? "Rechts ➔" : t("planBma", "dirRight", "Rechts ➔"))
                                : dir === "down"
                                ? (currentType === "sirene" ? "Unten ⬇" : t("planBma", "dirDown", "Unten ⬇"))
                                : (currentType === "sirene" ? "Oben ⬆" : t("planBma", "dirUp", "Oben ⬆"));

                            return (
                              <button
                                key={dir}
                                type="button"
                                onClick={() => setArrowDirection(dir)}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 4,
                                  padding: "6px 4px",
                                  borderRadius: 8,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  border: isSelected ? (currentType === "sirene" ? "2px solid #ef4444" : "2px solid #22c55e") : "1px solid rgba(255,255,255,0.15)",
                                  background: isSelected ? (currentType === "sirene" ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.25)") : "#1e293b",
                                  color: isSelected ? (currentType === "sirene" ? "#fca5a5" : "#4ade80") : "#94a3b8",
                                }}
                              >
                                <img
                                  src={previewIconUrl}
                                  width={currentType === "notlicht_pikto_gross" ? 32 : 22}
                                  height={currentType === "notlicht_pikto_gross" ? 16 : 22}
                                  alt=""
                                  style={{ objectFit: "contain" }}
                                />
                                <span>{dirName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!isOutlet && !isKb && !isHeating && !isRevisionCloud && !isAbdeckung && (
                      <>
                        {/* Variant / Type Selector for Emergency & Normal Lights */}
                        {(isEmergency || isLight) && lampTypesData.variants && lampTypesData.variants.length > 0 && (
                          <div className={styles.inputGroup} style={{ marginBottom: 8 }}>
                            <label className={styles.label}>
                              🏷️ {t("planBma", "lampVariantLabel", "Typ / Wariant oprawy (Kolor i Model):")}
                            </label>
                            <select
                              value={selectedVariantId}
                              onChange={(e) => setSelectedVariantId(e.target.value)}
                              className={styles.input}
                              style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}
                            >
                              <option value="">🟢 Standard / Domyślny</option>
                              {lampTypesData.variants
                                .filter((v) =>
                                  v.category === currentType ||
                                  (isEmergency && (v.category === "notlicht_lampe" || v.category === "notlicht_pikto" || v.category === "notlicht_pikto_gross")) ||
                                  (isLight && v.category === "lampe") ||
                                  (!v.category && (isEmergency || isLight))
                                )
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    ● {v.name} ({v.model || "Brak modelu"})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div className={styles.inputGroup}>
                            <label className={styles.label}>
                              {isEmergency || isLight || isStripe
                                ? t("planBma", "circuit", "Stromkreis (Kreis / Gruppe)")
                                : t("planBma", "loop", "Ringleitung (Loop)")}
                            </label>
                            <input
                              type="text"
                              className={styles.input}
                              value={loopInput}
                              onChange={(e) => {
                                const newLoop = e.target.value;
                                setLoopInput(newLoop);
                                if (modalCoords && !editingSymbol) {
                                  const nextAddr = String(
                                    getNextAddressForCircuit(modalCoords.symbol_type, newLoop)
                                  );
                                  setAddressInput(nextAddr);
                                  if (isLight) {
                                    setLabelInput(`L ${newLoop ? newLoop + "/" : ""}${nextAddr}`);
                                  } else if (isStripe) {
                                    setLabelInput(`LED ${newLoop ? newLoop + "/" : ""}${nextAddr}`);
                                  } else {
                                    setLabelInput(`${newLoop}${nextAddr ? "/" + nextAddr : ""}`);
                                  }
                                } else {
                                  if (isLight) {
                                    setLabelInput(`L ${newLoop ? newLoop + "/" : ""}${addressInput}`);
                                  } else if (isStripe) {
                                    setLabelInput(`LED ${newLoop ? newLoop + "/" : ""}${addressInput}`);
                                  } else {
                                    setLabelInput(`${newLoop}${addressInput ? "/" + addressInput : ""}`);
                                  }
                                }
                              }}
                              placeholder="z.B. 1"
                            />
                          </div>
                          <div className={styles.inputGroup}>
                            <label className={styles.label}>
                              {isEmergency || isLight || isStripe
                                ? t("planBma", "lampNo", "Leuchten/Stripe-Nr. (Nr)")
                                : t("planBma", "address", "Elementadresse")}
                            </label>
                            <input
                              type="text"
                              className={styles.input}
                              value={addressInput}
                              onChange={(e) => {
                                const newAddr = e.target.value;
                                setAddressInput(newAddr);
                                if (isLight) {
                                  setLabelInput(`L ${loopInput ? loopInput + "/" : ""}${newAddr}`);
                                } else if (isStripe) {
                                  setLabelInput(`LED ${loopInput ? loopInput + "/" : ""}${newAddr}`);
                                } else {
                                  setLabelInput(`${loopInput}${newAddr ? "/" + newAddr : ""}`);
                                }
                              }}
                              placeholder="z.B. 1"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Device Type / Model Selector for Heating & Devices */}
                    {isHeating && (
                      <div className={styles.inputGroup} style={{ marginBottom: 12, background: "rgba(15, 23, 42, 0.6)", padding: 10, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <label className={styles.label} style={{ margin: 0 }}>
                            🏷️ {t("planBma", "deviceVariantLabel", "Gerätetyp / Modell (Wariant urządzenia):")}
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowAddDeviceType(!showAddDeviceType)}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#38bdf8",
                              background: "rgba(56, 189, 248, 0.15)",
                              border: "1px solid #0284c7",
                              borderRadius: 4,
                              padding: "2px 8px",
                              cursor: "pointer",
                            }}
                          >
                            {showAddDeviceType ? "✕ Abbrechen" : "+ Neuer Gerätetyp"}
                          </button>
                        </div>

                        {/* Inline Form to add a new Device Type / Model */}
                        {showAddDeviceType && (
                          <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, marginBottom: 8, border: "1px solid #38bdf8" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>
                              ➕ Neuen Gerätetyp / Modell hinzufügen:
                            </div>
                            <input
                              type="text"
                              className={styles.input}
                              placeholder="Gerätebezeichnung / Typ (z.B. Vitocal 200-S)"
                              value={newDevName}
                              onChange={(e) => setNewDevName(e.target.value)}
                              style={{ width: "100%", marginBottom: 6, fontSize: 12 }}
                            />
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 10, color: "#94a3b8" }}>Farbe:</span>
                              {(["#0284c7", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#475569"] as string[]).map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setNewDevColor(c)}
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    background: c,
                                    border: newDevColor === c ? "2px solid #ffffff" : "none",
                                    cursor: "pointer",
                                  }}
                                />
                              ))}
                            </div>

                            {/* Photo Upload for New Device Variant */}
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, background: "#0f172a", padding: 6, borderRadius: 6, border: "1px solid #334155" }}>
                              <div style={{ width: 42, height: 36, borderRadius: 4, background: "#1e293b", border: "1px dashed #38bdf8", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                {newDevPhotoBase64 ? (
                                  <img src={newDevPhotoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                ) : (
                                  <span style={{ fontSize: 9, color: "#64748b" }}>Brak</span>
                                )}
                              </div>
                              <label style={{ flex: 1, background: "#0284c7", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                📷 {newDevPhotoBase64 ? "Zdjęcie wybrane" : "+ Dodaj zdjęcie urządzenia"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (evt) => {
                                        if (evt.target?.result) {
                                          setNewDevPhotoBase64(evt.target.result as string);
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                              {newDevPhotoBase64 && (
                                <button
                                  type="button"
                                  onClick={() => setNewDevPhotoBase64(null)}
                                  style={{ background: "rgba(239, 68, 68, 0.2)", color: "#f87171", border: "none", borderRadius: 4, padding: "3px 6px", fontSize: 10, cursor: "pointer" }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                if (!newDevName.trim()) return;
                                const newId = "dev_" + Date.now();
                                const newVar = {
                                  id: newId,
                                  category: (currentType || "geraet_box") as any,
                                  name: newDevName.trim(),
                                  model: newDevName.trim(),
                                  color: newDevColor,
                                  photoBase64: newDevPhotoBase64 || undefined,
                                };
                                const updatedVariants = [...(lampTypesData.variants || []), newVar];
                                const updatedData = { ...lampTypesData, variants: updatedVariants };
                                setLampTypesData(updatedData);
                                setSelectedVariantId(newId);
                                setNewDevName("");
                                setNewDevPhotoBase64(null);
                                setShowAddDeviceType(false);
                                try {
                                  const token = await getToken();
                                  const formData = new FormData();
                                  formData.append("variantsJson", JSON.stringify(updatedVariants));
                                  await fetch(`/api/plans/${planId}/lamp-types`, {
                                    method: "POST",
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                    body: formData,
                                  });
                                } catch (e) {
                                  console.error("Failed to save device type", e);
                                }
                              }}
                              style={{
                                width: "100%",
                                padding: "4px 8px",
                                background: "#0284c7",
                                color: "#fff",
                                border: "none",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              ✓ Typ hinzufügen & auswählen
                            </button>
                          </div>
                        )}

                        <select
                          value={selectedVariantId}
                          onChange={(e) => setSelectedVariantId(e.target.value)}
                          className={styles.input}
                          style={{ width: "100%", background: "#0f172a", color: "#f8fafc", padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}
                        >
                          <option value="">🟢 Standard / Domyślny</option>
                          {lampTypesData.variants && lampTypesData.variants.filter((v) => v.category === currentType || !v.category).map((v) => (
                            <option key={v.id} value={v.id}>
                              ● {v.name} ({v.model || "Brak modelu"})
                            </option>
                          ))}
                        </select>

                        {/* Quick Edit & Delete Controls for Selected Device Type */}
                        {selectedVariantId && (() => {
                          const activeVar = lampTypesData.variants?.find((v) => v.id === selectedVariantId);
                          if (!activeVar) return null;
                          const isEditingThis = editingVariantId === activeVar.id;
                          return (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingThis) {
                                      setEditingVariantId(null);
                                    } else {
                                      setEditingVariantId(activeVar.id);
                                      setEditDevName(activeVar.name || "");
                                      setEditDevColor(activeVar.color || "#0284c7");
                                      setEditDevPhotoBase64(activeVar.photoBase64 || activeVar.photoUrl || null);
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: "3px 8px",
                                    background: "rgba(56, 189, 248, 0.15)",
                                    color: "#38bdf8",
                                    border: "1px solid #0284c7",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  ✏️ {isEditingThis ? "Anuluj edycję" : "Edytuj ten typ (nazwa, kolor, zdjęcie)"}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm(`Czy na pewno chcesz usunąć typ urządzenia "${activeVar.name}"?`)) return;
                                    const updatedVariants = (lampTypesData.variants || []).filter((v) => v.id !== activeVar.id);
                                    const updatedData = { ...lampTypesData, variants: updatedVariants };
                                    setLampTypesData(updatedData);
                                    setSelectedVariantId("");
                                    try {
                                      const token = await getToken();
                                      const formData = new FormData();
                                      formData.append("variantsJson", JSON.stringify(updatedVariants));
                                      await fetch(`/api/plans/${planId}/lamp-types`, {
                                        method: "POST",
                                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                                        body: formData,
                                      });
                                    } catch (e) {
                                      console.error("Failed to delete device type", e);
                                    }
                                  }}
                                  style={{
                                    padding: "3px 8px",
                                    background: "rgba(239, 68, 68, 0.15)",
                                    color: "#f87171",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  🗑️ Usuń typ
                                </button>
                              </div>

                              {/* Inline Edit Form for Selected Device Type */}
                              {isEditingThis && (
                                <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, marginTop: 6, border: "1px solid #38bdf8" }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>
                                    ✏️ Edycja typu urządzenia: {activeVar.name}
                                  </div>
                                  <input
                                    type="text"
                                    className={styles.input}
                                    placeholder="Gerätebezeichnung / Typ"
                                    value={editDevName}
                                    onChange={(e) => setEditDevName(e.target.value)}
                                    style={{ width: "100%", marginBottom: 6, fontSize: 12 }}
                                  />
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Farbe:</span>
                                    {(["#0284c7", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#475569"] as string[]).map((c) => (
                                      <button
                                        key={c}
                                        type="button"
                                        onClick={() => setEditDevColor(c)}
                                        style={{
                                          width: 18,
                                          height: 18,
                                          borderRadius: 9,
                                          background: c,
                                          border: editDevColor === c ? "2px solid #ffffff" : "none",
                                          cursor: "pointer",
                                        }}
                                      />
                                    ))}
                                  </div>

                                  {/* Photo Upload for Edit */}
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, background: "#0f172a", padding: 6, borderRadius: 6, border: "1px solid #334155" }}>
                                    <div style={{ width: 42, height: 36, borderRadius: 4, background: "#1e293b", border: "1px dashed #38bdf8", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                      {editDevPhotoBase64 ? (
                                        <img src={editDevPhotoBase64} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                      ) : (
                                        <span style={{ fontSize: 9, color: "#64748b" }}>Brak</span>
                                      )}
                                    </div>
                                    <label style={{ flex: 1, background: "#0284c7", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                      📷 {editDevPhotoBase64 ? "Zmień zdjęcie" : "+ Dodaj zdjęcie"}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (evt) => {
                                              if (evt.target?.result) {
                                                setEditDevPhotoBase64(evt.target.result as string);
                                              }
                                            };
                                            reader.readAsDataURL(file);
                                          }
                                        }}
                                      />
                                    </label>
                                    {editDevPhotoBase64 && (
                                      <button
                                        type="button"
                                        onClick={() => setEditDevPhotoBase64(null)}
                                        style={{ background: "rgba(239, 68, 68, 0.2)", color: "#f87171", border: "none", borderRadius: 4, padding: "3px 6px", fontSize: 10, cursor: "pointer" }}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!editDevName.trim()) return;
                                      const updatedVariants = (lampTypesData.variants || []).map((v) =>
                                        v.id === activeVar.id
                                          ? { ...v, name: editDevName.trim(), model: editDevName.trim(), color: editDevColor, photoBase64: editDevPhotoBase64 || undefined }
                                          : v
                                      );
                                      const updatedData = { ...lampTypesData, variants: updatedVariants };
                                      setLampTypesData(updatedData);
                                      setEditingVariantId(null);
                                      try {
                                        const token = await getToken();
                                        const formData = new FormData();
                                        formData.append("variantsJson", JSON.stringify(updatedVariants));
                                        await fetch(`/api/plans/${planId}/lamp-types`, {
                                          method: "POST",
                                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                                          body: formData,
                                        });
                                      } catch (e) {
                                        console.error("Failed to update device type", e);
                                      }
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "4px 8px",
                                      background: "#16a34a",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    ✓ Zapisz zmiany w typie
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        {isOutlet
                          ? t("planBma", "outletLabel", "Kabelbezeichnung (Oznaczenie / Nr kabla)")
                          : isKb
                          ? t("planBma", "kabelbahnLabel", "Trassenbezeichnung (Kennzeichnung)")
                          : t("planBma", "label", "Plankennzeichnung")}
                      </label>
                      <input
                        type="text"
                        className={styles.input}
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        placeholder={
                          isOutlet
                            ? "z.B. KA 1 lub Kabel 3x1.5"
                            : isKb
                            ? "z.B. KB 1 lub Trasse 200x60"
                            : isStripe
                            ? "z.B. LED 1 lub LED Stripe 5m"
                            : "z.B. 1/15"
                        }
                      />
                    </div>

                    {/* Power kW input for Heating / Heat Pumps & optional for other equipment */}
                    {isHeating && (
                      <div className={styles.inputGroup}>
                        <label className={styles.label}>
                          ⚡ {t("planBma", "powerKw", "Moc / Wydajność (kW)")}
                        </label>
                        <input
                          type="text"
                          className={styles.input}
                          value={powerKwInput}
                          onChange={(e) => setPowerKwInput(e.target.value)}
                          placeholder={t("planBma", "powerKwPlaceholder", "np. 12 kW / 8.5 kW")}
                        />
                      </div>
                    )}
                    {/* Cable type / Supply line (Zuleitung) input */}
                    {isHeating && (
                      <div className={styles.inputGroup}>
                        <label className={styles.label}>
                          🔌 {t("planBma", "zuleitung", "Kabeltyp / Zuleitung (z.B. NYY-J 5x2.5)")}
                        </label>
                        <input
                          type="text"
                          className={styles.input}
                          value={zuleitungInput}
                          onChange={(e) => setZuleitungInput(e.target.value)}
                          placeholder={t("planBma", "zuleitungPlaceholder", "z.B. NYY-J 5x2.5 mm² / ÖLFLEX 4x1.5 mm²")}
                        />
                      </div>
                    )}

                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        {isOutlet
                          ? t("planBma", "outletDescription", "Beschreibung / Opis kabla (np. Zasilanie LED, Rolety, Czujka)")
                          : isStripe
                          ? t("planBma", "stripeDescription", "Beschreibung / Typ taśmy (np. 3000K, 24V, 14.4W/m, IP65)")
                          : isKb
                          ? t("planBma", "kabelbahnDescription", "Beschreibung / Typ trasy (np. 200mm, 3. OG Flur)")
                          : t("planBma", "description", "Beschreibung / Ort (optional)")}
                      </label>
                      <input
                        type="text"
                        className={styles.input}
                        value={descriptionInput.startsWith("{") ? "" : descriptionInput}
                        onChange={(e) => {
                          setDescriptionInput(e.target.value);
                        }}
                        placeholder={
                          isOutlet
                            ? "z.B. Zasilanie LED / Gniazdo"
                            : isStripe
                            ? "z.B. 3000K 24V / Podświetlenie sufitu"
                            : isKb
                            ? "z.B. 200x60mm / Zasilanie rozdzielnic"
                            : "z.B. Flur 1. OG / Typ lampy"
                        }
                      />
                    </div>

                    {/* Serial Number & Camera/OCR Scanner */}
                    <div className={styles.inputGroup} style={{ marginTop: 12 }}>
                      <label className={styles.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>🔢 {t("bmaAutomation", "serialNumber" as any, "Numer seryjny (Seriennummer)")}</span>
                        {isScanningSerial && (
                          <span style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700 }}>
                            ⚡ Skanowanie aparatem / AI...
                          </span>
                        )}
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="text"
                          className={styles.input}
                          value={serialNumberInput}
                          onChange={(e) => setSerialNumberInput(e.target.value)}
                          placeholder="np. S/N 12345678 lub zeskanuj aparatem"
                          style={{ flex: 1 }}
                        />
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 42,
                            height: 42,
                            borderRadius: 8,
                            background: isScanningSerial ? "rgba(245, 158, 11, 0.2)" : "rgba(37, 99, 235, 0.2)",
                            border: isScanningSerial ? "1px solid #f59e0b" : "1px solid rgba(59, 130, 246, 0.4)",
                            color: isScanningSerial ? "#f59e0b" : "#60a5fa",
                            cursor: isScanningSerial || uploadingPhoto ? "wait" : "pointer",
                            flexShrink: 0,
                            transition: "all 0.2s ease"
                          }}
                          title="Zrób zdjęcie etykiety / zeskanuj numer seryjny"
                        >
                          {isScanningSerial ? (
                            <span style={{ fontSize: 14 }}>⏳</span>
                          ) : (
                            <span style={{ fontSize: 18 }}>📷</span>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: "none" }}
                            disabled={isScanningSerial || uploadingPhoto}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setIsScanningSerial(true);
                              setUploadingPhoto(true);
                              try {
                                const token = await getToken();
                                const fd = new FormData();
                                fd.append("file", file);
                                fetch("/api/upload", { method: "POST", body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} })
                                  .then(r => r.json())
                                  .then(rj => {
                                    if (rj.ok && rj.data?.url) {
                                      setPhotosInput(prev => [...prev, rj.data.url]);
                                    }
                                  })
                                  .catch(console.error)
                                  .finally(() => setUploadingPhoto(false));

                                const reader = new FileReader();
                                reader.readAsDataURL(file);
                                reader.onload = async () => {
                                  const dataUrl = reader.result as string;
                                  const base64 = dataUrl.split(",")[1];
                                  try {
                                    const zx = new BrowserMultiFormatReader();
                                    const img = new Image();
                                    img.src = dataUrl;
                                    await new Promise(r => img.onload = r);
                                    const result = await zx.decodeFromImageElement(img);
                                    if (result && result.getText()) {
                                      setSerialNumberInput(result.getText());
                                      setIsScanningSerial(false);
                                      return;
                                    }
                                  } catch (zxErr) {
                                    console.log("ZXing barcode scan fallback to AI...", zxErr);
                                  }

                                  try {
                                    const res = await fetch("/api/bma/scan-serial", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                      body: JSON.stringify({ imageBase64: base64 })
                                    });
                                    const rj = await res.json();
                                    if (rj.serialNumber && rj.serialNumber !== "UNKNOWN") {
                                      setSerialNumberInput(rj.serialNumber);
                                    }
                                  } catch (aiErr) {
                                    console.error("AI serial scan error:", aiErr);
                                  } finally {
                                    setIsScanningSerial(false);
                                  }
                                };
                              } catch (err) {
                                console.error(err);
                                setIsScanningSerial(false);
                                setUploadingPhoto(false);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Photos Gallery & Upload */}
                    <div className={styles.inputGroup} style={{ marginTop: 12 }}>
                      <label className={styles.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>🖼️ {t("bmaAutomation", "photos" as any, "Zdjęcia urządzenia (Fotos)")}</span>
                        {photosInput.length > 0 && (
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>{photosInput.length} załączone</span>
                        )}
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8, marginTop: 6 }}>
                        {photosInput.map((pUrl, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: "relative",
                              width: 70,
                              height: 70,
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "#0f172a",
                              border: "1px solid rgba(255,255,255,0.1)",
                              cursor: "pointer"
                            }}
                            onClick={() => setFullscreenPhotoUrl(pUrl)}
                          >
                            <img src={pUrl} alt="Device photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPhotosInput(prev => prev.filter((_, i) => i !== idx));
                              }}
                              style={{
                                position: "absolute",
                                top: 2,
                                right: 2,
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                background: "rgba(239,68,68,0.9)",
                                color: "#fff",
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                cursor: "pointer"
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        <label
                          style={{
                            width: 70,
                            height: 70,
                            borderRadius: 8,
                            border: "1px dashed rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.03)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            cursor: uploadingPhoto ? "wait" : "pointer",
                            color: "#94a3b8",
                            fontSize: 10,
                            fontWeight: 700
                          }}
                        >
                          <span style={{ fontSize: 16 }}>{uploadingPhoto ? "⏳" : "➕"}</span>
                          <span>{uploadingPhoto ? "Wgrywanie..." : "Dodaj"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            disabled={uploadingPhoto}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingPhoto(true);
                              try {
                                const token = await getToken();
                                const fd = new FormData();
                                fd.append("file", file);
                                const res = await fetch("/api/upload", {
                                  method: "POST",
                                  body: fd,
                                  headers: token ? { Authorization: `Bearer ${token}` } : {}
                                });
                                const rj = await res.json();
                                if (rj.ok && rj.data?.url) {
                                  setPhotosInput(prev => [...prev, rj.data.url]);
                                }
                              } catch (err) {
                                console.error("Upload failed", err);
                              } finally {
                                setUploadingPhoto(false);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className={styles.modalActions} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 10 }}>
                {editingSymbol && isAdminOrMod && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(t("planBma", "confirmDeleteSymbol", "Czy na pewno chcesz usunąć ten element?"))) return;
                      const symId = editingSymbol.id;
                      setModalCoords(null);
                      setEditingSymbol(null);
                      await handleDeleteSymbol(symId);
                    }}
                    style={{
                      background: "rgba(239, 68, 68, 0.2)",
                      color: "#f87171",
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    disabled={saving}
                  >
                    <span>🗑️</span>
                    <span>{t("planBma", "delete", "Löschen")}</span>
                  </button>
                )}
                <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => {
                      setModalCoords(null);
                      setEditingSymbol(null);
                    }}
                    disabled={saving}
                  >
                    {t("planBma", "cancel", "Abbrechen")}
                  </button>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSaveSymbol}
                    disabled={saving}
                    style={
                      duplicateWarning
                        ? { background: "#ea580c", border: "1px solid #f97316" }
                        : undefined
                    }
                  >
                    {saving
                      ? t("planBma", "saving", "Speichern...")
                      : editingSymbol
                      ? `✓ ${t("planKlappen", "saveChanges", "Änderungen speichern")}`
                      : `✓ ${t("planBma", "save", "Einfügen")}`}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── LAMP TYPES & REFERENCE PHOTOS MODAL ── */}
      {lampTypesModalOpen &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className={styles.paletteModal}
            onClick={() => setLampTypesModalOpen(false)}
            style={{ zIndex: 10000 }}
          >
            <div
              className={styles.paletteCard}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 680, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📷</span>
                  <span>{t("planBma", "lampTypesModalTitle", "Typy opraw & Zdjęcia do legendy PDF")}</span>
                </h3>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setLampTypesModalOpen(false)}
                  disabled={savingLampTypes}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                {t(
                  "planBma",
                  "lampTypesModalSubtitle",
                  "Zdefiniuj modele opraw oraz wgraj zdjęcia referencyjne dla każdej z trzech kategorii oświetlenia awaryjnego. Zdjęcia i typy pojawią się w dedykowanej legendzie raportu PDF."
                )}
              </p>

              {/* ── GLOBAL LIBRARY TOOLBAR & STATUS BANNER ── */}
              <div
                style={{
                  background: isFromGlobalLibrary ? "rgba(14, 165, 233, 0.12)" : "rgba(34, 197, 94, 0.10)",
                  border: `1.5px solid ${isFromGlobalLibrary ? "#0284c7" : "#16a34a"}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: isFromGlobalLibrary ? "#38bdf8" : "#4ade80", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{isFromGlobalLibrary ? "📚" : "🎯"}</span>
                    <span>{isFromGlobalLibrary ? t("planBma", "loadedFromGlobalLibrary", "Wczytano z Twojej Globalnej Bazy Opraw") : t("planBma", "customPlanConfig", "Własna konfiguracja opraw dla tego planu")}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {t("planBma", "saveAlsoToLibraryHint", "Zapisane typy, warianty i zdjęcia możesz zachować jako stałą bazę dla wszystkich planów.")}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleLoadFromGlobalLibrary}
                    disabled={savingLampTypes}
                    style={{
                      background: "#0f172a",
                      border: "1.5px solid #38bdf8",
                      color: "#38bdf8",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title={t("planBma", "loadFromLibraryTitle", "Wczytaj definicje i zdjęcia z Twojej stałej bazy")}
                  >
                    <span>📥</span>
                    <span>{t("planBma", "loadFromLibrary", "Wczytaj z Bazy")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAsGlobalLibrary}
                    disabled={savingLampTypes}
                    style={{
                      background: "linear-gradient(135deg, #0284c7, #0369a1)",
                      border: "1px solid #38bdf8",
                      color: "#ffffff",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title={t("planBma", "saveToLibraryTitle", "Zapisz obecne oprawy jako bazę domyślną dla wszystkich obecnych i nowych planów")}
                  >
                    <span>🌟</span>
                    <span>{t("planBma", "saveToLibrary", "Zapisz do Bazy")}</span>
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* 1. NOTBELEUCHTUNG STANDARDS */}
                <div style={{ background: "rgba(15, 23, 42, 0.4)", padding: 14, borderRadius: 12, border: "1px solid rgba(56, 189, 248, 0.2)" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    💡 Notbeleuchtung & Rettungszeichen – Standards
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {([
                      {
                        type: "notlicht_lampe",
                        title: t("planBma", "notlichtLampe", "Notbeleuchtung Lampe (Sicherheitsleuchte)"),
                        iconUrl: "/symbols/bma/notlicht_lampe.svg",
                        defaultPlaceholder: "z.B. Ceag GuideLed 10011 / RZB Pascal",
                      },
                      {
                        type: "notlicht_pikto",
                        title: t("planBma", "notlichtPiktoKlein", "Rettungszeichen klein (RZ-K)"),
                        iconUrl: "/symbols/bma/notlicht_pikto.svg",
                        defaultPlaceholder: "z.B. Inotec SNP 7288 LED / Beghelli Formula 65",
                      },
                      {
                        type: "notlicht_pikto_gross",
                        title: t("planBma", "notlichtPiktoGross", "Rettungszeichen groß (RZ-G)"),
                        iconUrl: "/symbols/bma/notlicht_pikto_gross.svg",
                        defaultPlaceholder: "z.B. Inotec SNP 12140 / RZB Omnilux",
                      },
                    ] as const).map((cat) => {
                      const entry = lampTypesData[cat.type] || {};
                      const pendingFile = lampTypePhotosToUpload[cat.type];
                      const previewUrl = pendingFile
                        ? URL.createObjectURL(pendingFile)
                        : !lampTypePhotosToRemove[cat.type]
                        ? (entry.photoUrl || entry.photoBase64 || (entry as any).photo_url || (entry as any).image_url || (entry as any).imageUrl)
                        : null;

                      return (
                        <div
                          key={cat.type}
                          style={{
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: 12,
                            padding: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <img src={cat.iconUrl} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>{cat.title}</span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                              <div
                                style={{
                                  width: 110,
                                  height: 80,
                                  background: "#0f172a",
                                  border: "1.5px dashed #38bdf8",
                                  borderRadius: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  overflow: "hidden",
                                }}
                              >
                                {previewUrl ? (
                                  <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                ) : (
                                  <span style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Brak zdjęcia</span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 4, width: "100%" }}>
                                <label
                                  style={{
                                    flex: 1,
                                    background: "#0284c7",
                                    color: "#ffffff",
                                    padding: "4px 6px",
                                    borderRadius: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textAlign: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  📁 Zdjęcie
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: "none" }}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        setLampTypePhotosToUpload((prev) => ({ ...prev, [cat.type]: f }));
                                        setLampTypePhotosToRemove((prev) => ({ ...prev, [cat.type]: false }));
                                      }
                                    }}
                                  />
                                </label>
                                {previewUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLampTypePhotosToUpload((prev) => {
                                        const next = { ...prev };
                                        delete next[cat.type];
                                        return next;
                                      });
                                      setLampTypePhotosToRemove((prev) => ({ ...prev, [cat.type]: true }));
                                    }}
                                    style={{
                                      background: "rgba(239, 68, 68, 0.2)",
                                      border: "1px solid rgba(239, 68, 68, 0.4)",
                                      color: "#f87171",
                                      borderRadius: 6,
                                      padding: "4px 8px",
                                      fontSize: 10,
                                      cursor: "pointer",
                                    }}
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                  Model / Typ oprawy:
                                </label>
                                <input
                                  type="text"
                                  value={entry.model || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setLampTypesData((prev) => ({
                                      ...prev,
                                      [cat.type]: { ...(prev[cat.type] || {}), model: val },
                                    }));
                                  }}
                                  placeholder={cat.defaultPlaceholder}
                                  className={styles.input}
                                  style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                  Uwagi / Specyfikacja (np. montaż, optyka):
                                </label>
                                <input
                                  type="text"
                                  value={entry.notes || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setLampTypesData((prev) => ({
                                      ...prev,
                                      [cat.type]: { ...(prev[cat.type] || {}), notes: val },
                                    }));
                                  }}
                                  placeholder="z.B. Deckenmontage, IP54, 3h Akku"
                                  className={styles.input}
                                  style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. HEIZUNG & WÄRMEPUMPEN STANDARDS */}
                <div style={{ background: "rgba(15, 23, 42, 0.4)", padding: 14, borderRadius: 12, border: "1px solid rgba(249, 115, 22, 0.2)" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 800, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    🔥 Heizung & Wärmepumpen – Standards
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {([
                      {
                        type: "warmepumpe_aussen",
                        title: t("planBma", "warmepumpeAussen", "Wärmepumpe Außen (Jednostka zewnętrzna)"),
                        iconUrl: "/symbols/bma/warmepumpe_aussen.svg",
                        defaultPlaceholder: "z.B. Viessmann Vitocal 200-S (12 kW)",
                      },
                      {
                        type: "warmepumpe_innen",
                        title: t("planBma", "warmepumpeInnen", "Wärmepumpe Innen (Jednostka wewnętrzna)"),
                        iconUrl: "/symbols/bma/warmepumpe_innen.svg",
                        defaultPlaceholder: "z.B. Viessmann Vitocal Inneneinheit",
                      },
                      {
                        type: "infrarotheizung",
                        title: t("planBma", "infrarotheizung", "Infrarotheizung (Paneel / Promiennik)"),
                        iconUrl: "/symbols/bma/infrarotheizung.svg",
                        defaultPlaceholder: "z.B. Könighaus Infrarotpaneel 1000W",
                      },
                      {
                        type: "geraet_box",
                        title: t("planBma", "geraetBox", "Anderes Gerät / Steuerung (Rechteck)"),
                        iconUrl: "/symbols/bma/geraet_box.svg",
                        defaultPlaceholder: "z.B. Steuerung Wärmepumpe / Regelung",
                      },
                    ] as const).map((cat) => {
                      const entry = lampTypesData[cat.type] || {};
                      const pendingFile = lampTypePhotosToUpload[cat.type];
                      const previewUrl = pendingFile
                        ? URL.createObjectURL(pendingFile)
                        : !lampTypePhotosToRemove[cat.type]
                        ? (entry.photoUrl || entry.photoBase64 || (entry as any).photo_url || (entry as any).image_url || (entry as any).imageUrl)
                        : null;

                      return (
                        <div
                          key={cat.type}
                          style={{
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: 12,
                            padding: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <img src={cat.iconUrl} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>{cat.title}</span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                              <div
                                style={{
                                  width: 110,
                                  height: 80,
                                  background: "#0f172a",
                                  border: "1.5px dashed #f97316",
                                  borderRadius: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  overflow: "hidden",
                                }}
                              >
                                {previewUrl ? (
                                  <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                ) : (
                                  <span style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Brak zdjęcia</span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 4, width: "100%" }}>
                                <label
                                  style={{
                                    flex: 1,
                                    background: "#ea580c",
                                    color: "#ffffff",
                                    padding: "4px 6px",
                                    borderRadius: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textAlign: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  📁 Zdjęcie
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: "none" }}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        setLampTypePhotosToUpload((prev) => ({ ...prev, [cat.type]: f }));
                                        setLampTypePhotosToRemove((prev) => ({ ...prev, [cat.type]: false }));
                                      }
                                    }}
                                  />
                                </label>
                                {previewUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLampTypePhotosToUpload((prev) => {
                                        const next = { ...prev };
                                        delete next[cat.type];
                                        return next;
                                      });
                                      setLampTypePhotosToRemove((prev) => ({ ...prev, [cat.type]: true }));
                                    }}
                                    style={{
                                      background: "rgba(239, 68, 68, 0.2)",
                                      border: "1px solid rgba(239, 68, 68, 0.4)",
                                      color: "#f87171",
                                      borderRadius: 6,
                                      padding: "4px 8px",
                                      fontSize: 10,
                                      cursor: "pointer",
                                    }}
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                  Model / Typ urządzenia:
                                </label>
                                <input
                                  type="text"
                                  value={entry.model || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setLampTypesData((prev) => ({
                                      ...prev,
                                      [cat.type]: { ...(prev[cat.type] || {}), model: val },
                                    }));
                                  }}
                                  placeholder={cat.defaultPlaceholder}
                                  className={styles.input}
                                  style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                  Uwagi / Specyfikacja:
                                </label>
                                <input
                                  type="text"
                                  value={entry.notes || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setLampTypesData((prev) => ({
                                      ...prev,
                                      [cat.type]: { ...(prev[cat.type] || {}), notes: val },
                                    }));
                                  }}
                                  placeholder="z.B. Deckenmontage, 400V"
                                  className={styles.input}
                                  style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── CUSTOM VARIANTS SECTION ── */}
                <div style={{ marginTop: 10, paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.2)", display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* 1. NOTBELEUCHTUNG & LEUCHTEN VARIANTS */}
                  <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: 14, borderRadius: 12, border: "1px solid rgba(56, 189, 248, 0.2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#38bdf8" }}>
                          💡 Notbeleuchtung & Leuchten – Warianty Opraw (np. Treppenhaus, Halle, Büro)
                        </h4>
                        <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#94a3b8" }}>
                          Warianty opraw ewakuacyjnych i oświetleniowych z przypisanym modelem i zdjęciem.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newId = `var_${Date.now()}`;
                          const newVariant = {
                            id: newId,
                            category: "notlicht_lampe" as const,
                            name: `Wariant Oprawy ${((lampTypesData.variants?.length || 0) + 1)}`,
                            model: "",
                            color: ["#16a34a", "#0284c7", "#9333ea", "#e11d48", "#ca8a04"][(lampTypesData.variants?.length || 0) % 5],
                            notes: "",
                          };
                          setLampTypesData((prev) => ({
                            ...prev,
                            variants: [...(prev.variants || []), newVariant],
                          }));
                        }}
                        style={{
                          background: "#0284c7",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        ➕ Dodaj wariant oprawy
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {(lampTypesData.variants || [])
                        .filter((v) => v.category === "notlicht_lampe" || v.category === "notlicht_pikto" || v.category === "notlicht_pikto_gross" || v.category === "lampe" || !v.category)
                        .map((v, vIdx) => {
                          const pendingFile = lampTypePhotosToUpload[`variant_${v.id}`];
                          const previewUrl = pendingFile
                            ? URL.createObjectURL(pendingFile)
                            : !lampTypePhotosToRemove[`variant_${v.id}`]
                            ? (v.photoUrl || v.photoBase64 || (v as any).photo_url || (v as any).image_url || (v as any).imageUrl)
                            : null;

                          return (
                            <div
                              key={v.id}
                              style={{
                                background: "rgba(255, 255, 255, 0.04)",
                                border: `2px solid ${v.color || "#38bdf8"}`,
                                borderRadius: 12,
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: v.color || "#38bdf8" }} />
                                  <span style={{ fontSize: 13, fontWeight: 800, color: v.color || "#ffffff" }}>
                                    {v.name || `Wariant Oprawy ${vIdx + 1}`}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLampTypesData((prev) => ({
                                      ...prev,
                                      variants: prev.variants?.filter((item) => item.id !== v.id),
                                    }));
                                  }}
                                  style={{
                                    background: "rgba(239, 68, 68, 0.2)",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    color: "#f87171",
                                    borderRadius: 6,
                                    padding: "3px 8px",
                                    fontSize: 11,
                                    cursor: "pointer",
                                  }}
                                >
                                  🗑️ Usuń wariant
                                </button>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                                  <div
                                    style={{
                                      width: 110,
                                      height: 80,
                                      background: "#0f172a",
                                      border: `1.5px dashed ${v.color || "#38bdf8"}`,
                                      borderRadius: 8,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {previewUrl ? (
                                      <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                    ) : (
                                      <span style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Brak zdjęcia</span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", gap: 4, width: "100%" }}>
                                    <label
                                      style={{
                                        flex: 1,
                                        background: "#0284c7",
                                        color: "#ffffff",
                                        padding: "4px 6px",
                                        borderRadius: 6,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        textAlign: "center",
                                        cursor: "pointer",
                                      }}
                                    >
                                      📁 Zdjęcie
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) {
                                            setLampTypePhotosToUpload((prev) => ({ ...prev, [`variant_${v.id}`]: f }));
                                            setLampTypePhotosToRemove((prev) => ({ ...prev, [`variant_${v.id}`]: false }));
                                          }
                                        }}
                                      />
                                    </label>
                                    {previewUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLampTypePhotosToUpload((prev) => {
                                            const next = { ...prev };
                                            delete next[`variant_${v.id}`];
                                            return next;
                                          });
                                          setLampTypePhotosToRemove((prev) => ({ ...prev, [`variant_${v.id}`]: true }));
                                        }}
                                        style={{
                                          background: "rgba(239, 68, 68, 0.2)",
                                          border: "1px solid rgba(239, 68, 68, 0.4)",
                                          color: "#f87171",
                                          borderRadius: 6,
                                          padding: "4px 8px",
                                          fontSize: 10,
                                          cursor: "pointer",
                                        }}
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Nazwa / Miejsce montażu:
                                      </label>
                                      <input
                                        type="text"
                                        value={v.name || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setLampTypesData((prev) => ({
                                            ...prev,
                                            variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, name: val } : it)),
                                          }));
                                        }}
                                        placeholder="np. Treppenhaus / Klatka schodowa"
                                        className={styles.input}
                                        style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Model / Typ oprawy:
                                      </label>
                                      <input
                                        type="text"
                                        value={v.model || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setLampTypesData((prev) => ({
                                            ...prev,
                                            variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, model: val } : it)),
                                          }));
                                        }}
                                        placeholder="np. RZB Pascal 67189"
                                        className={styles.input}
                                        style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
                                      />
                                    </div>
                                  </div>

                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Kategoria:
                                      </label>
                                      <select
                                        value={v.category || "notlicht_lampe"}
                                        onChange={(e) => {
                                          const val = e.target.value as any;
                                          setLampTypesData((prev) => ({
                                            ...prev,
                                            variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, category: val } : it)),
                                          }));
                                        }}
                                        className={styles.input}
                                        style={{ width: "100%", fontSize: 12, padding: "6px 8px", background: "#0f172a", color: "#f8fafc" }}
                                      >
                                        <option value="notlicht_lampe">Notbeleuchtung Lampe</option>
                                        <option value="notlicht_pikto">Rettungszeichen klein (RZ-K)</option>
                                        <option value="notlicht_pikto_gross">Rettungszeichen groß (RZ-G)</option>
                                        <option value="lampe">Normale Lampe</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Kolor identyfikacyjny:
                                      </label>
                                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                        {["#16a34a", "#0284c7", "#9333ea", "#e11d48", "#ca8a04"].map((c) => (
                                          <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                              setLampTypesData((prev) => ({
                                                ...prev,
                                                variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, color: c } : it)),
                                              }));
                                            }}
                                            style={{
                                              width: 18,
                                              height: 18,
                                              borderRadius: 9,
                                              background: c,
                                              border: v.color === c ? "2px solid #ffffff" : "none",
                                              cursor: "pointer",
                                            }}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* 2. HEIZUNG & WÄRMEPUMPEN VARIANTS */}
                  <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: 14, borderRadius: 12, border: "1px solid rgba(249, 115, 22, 0.2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#f97316" }}>
                          🔥 Heizung & Wärmepumpen – Warianty Urządzeń & Sterowników
                        </h4>
                        <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#94a3b8" }}>
                          Warianty urządzeń grzewczych, pomp ciepła i skrzynek sterowniczych ze zdjęciem i specyfikacją.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newId = `var_${Date.now()}`;
                          const newVariant = {
                            id: newId,
                            category: "geraet_box" as const,
                            name: `Typ Urządzenia ${((lampTypesData.variants?.length || 0) + 1)}`,
                            model: "",
                            color: ["#0284c7", "#f97316", "#10b981", "#8b5cf6", "#ec4899"][(lampTypesData.variants?.length || 0) % 5],
                            notes: "",
                          };
                          setLampTypesData((prev) => ({
                            ...prev,
                            variants: [...(prev.variants || []), newVariant],
                          }));
                        }}
                        style={{
                          background: "#ea580c",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        ➕ Dodaj wariant urządzenia
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {(lampTypesData.variants || [])
                        .filter((v) => v.category === "warmepumpe_aussen" || v.category === "warmepumpe_innen" || v.category === "infrarotheizung" || v.category === "geraet_box")
                        .map((v, vIdx) => {
                          const pendingFile = lampTypePhotosToUpload[`variant_${v.id}`];
                          const previewUrl = pendingFile
                            ? URL.createObjectURL(pendingFile)
                            : !lampTypePhotosToRemove[`variant_${v.id}`]
                            ? (v.photoUrl || v.photoBase64 || (v as any).photo_url || (v as any).image_url || (v as any).imageUrl)
                            : null;

                          return (
                            <div
                              key={v.id}
                              style={{
                                background: "rgba(255, 255, 255, 0.04)",
                                border: `2px solid ${v.color || "#f97316"}`,
                                borderRadius: 12,
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: v.color || "#f97316" }} />
                                  <span style={{ fontSize: 13, fontWeight: 800, color: v.color || "#ffffff" }}>
                                    {v.name || `Typ Urządzenia ${vIdx + 1}`}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLampTypesData((prev) => ({
                                      ...prev,
                                      variants: prev.variants?.filter((item) => item.id !== v.id),
                                    }));
                                  }}
                                  style={{
                                    background: "rgba(239, 68, 68, 0.2)",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    color: "#f87171",
                                    borderRadius: 6,
                                    padding: "3px 8px",
                                    fontSize: 11,
                                    cursor: "pointer",
                                  }}
                                >
                                  🗑️ Usuń typ
                                </button>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                                  <div
                                    style={{
                                      width: 110,
                                      height: 80,
                                      background: "#0f172a",
                                      border: `1.5px dashed ${v.color || "#f97316"}`,
                                      borderRadius: 8,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {previewUrl ? (
                                      <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                    ) : (
                                      <span style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Brak zdjęcia</span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", gap: 4, width: "100%" }}>
                                    <label
                                      style={{
                                        flex: 1,
                                        background: "#ea580c",
                                        color: "#ffffff",
                                        padding: "4px 6px",
                                        borderRadius: 6,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        textAlign: "center",
                                        cursor: "pointer",
                                      }}
                                    >
                                      📁 Zdjęcie
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) {
                                            setLampTypePhotosToUpload((prev) => ({ ...prev, [`variant_${v.id}`]: f }));
                                            setLampTypePhotosToRemove((prev) => ({ ...prev, [`variant_${v.id}`]: false }));
                                          }
                                        }}
                                      />
                                    </label>
                                    {previewUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLampTypePhotosToUpload((prev) => {
                                            const next = { ...prev };
                                            delete next[`variant_${v.id}`];
                                            return next;
                                          });
                                          setLampTypePhotosToRemove((prev) => ({ ...prev, [`variant_${v.id}`]: true }));
                                        }}
                                        style={{
                                          background: "rgba(239, 68, 68, 0.2)",
                                          border: "1px solid rgba(239, 68, 68, 0.4)",
                                          color: "#f87171",
                                          borderRadius: 6,
                                          padding: "4px 8px",
                                          fontSize: 10,
                                          cursor: "pointer",
                                        }}
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Nazwa / Typ urządzenia:
                                      </label>
                                      <input
                                        type="text"
                                        value={v.name || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setLampTypesData((prev) => ({
                                            ...prev,
                                            variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, name: val } : it)),
                                          }));
                                        }}
                                        placeholder="np. Vitocal 200-S / Steuerung"
                                        className={styles.input}
                                        style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Model / Specyfikacja:
                                      </label>
                                      <input
                                        type="text"
                                        value={v.model || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setLampTypesData((prev) => ({
                                            ...prev,
                                            variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, model: val } : it)),
                                          }));
                                        }}
                                        placeholder="np. Viessmann Vitocal 200-S (12 kW)"
                                        className={styles.input}
                                        style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
                                      />
                                    </div>
                                  </div>

                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Kategoria:
                                      </label>
                                      <select
                                        value={v.category || "geraet_box"}
                                        onChange={(e) => {
                                          const val = e.target.value as any;
                                          setLampTypesData((prev) => ({
                                            ...prev,
                                            variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, category: val } : it)),
                                          }));
                                        }}
                                        className={styles.input}
                                        style={{ width: "100%", fontSize: 12, padding: "6px 8px", background: "#0f172a", color: "#f8fafc" }}
                                      >
                                        <option value="warmepumpe_aussen">Wärmepumpe Außen</option>
                                        <option value="warmepumpe_innen">Wärmepumpe Innen</option>
                                        <option value="infrarotheizung">Infrarotheizung</option>
                                        <option value="geraet_box">Anderes Gerät / Steuerung (Rechteck)</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                                        Kolor identyfikacyjny:
                                      </label>
                                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                        {["#0284c7", "#ea580c", "#10b981", "#8b5cf6", "#ec4899"].map((c) => (
                                          <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                              setLampTypesData((prev) => ({
                                                ...prev,
                                                variants: prev.variants?.map((it) => (it.id === v.id ? { ...it, color: c } : it)),
                                              }));
                                            }}
                                            style={{
                                              width: 18,
                                              height: 18,
                                              borderRadius: 9,
                                              background: c,
                                              border: v.color === c ? "2px solid #ffffff" : "none",
                                              cursor: "pointer",
                                            }}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1", cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={saveToGlobalDefault}
                    onChange={(e) => setSaveToGlobalDefault(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#10b981" }}
                  />
                  <span>💾 {t("planBma", "saveAlsoToLibrary", "Zapisz również do Mojej Bazy (będzie dostępna na wszystkich planach)")}</span>
                </label>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setLampTypesModalOpen(false)}
                    disabled={savingLampTypes}
                  >
                    ✕ {t("planBma", "cancel", "Abbrechen")}
                  </button>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSaveLampTypes}
                    disabled={savingLampTypes}
                    style={{ background: "#10b981", border: "1px solid #34d399", color: "#ffffff", padding: "8px 18px", fontWeight: 800 }}
                  >
                    {savingLampTypes ? t("planBma", "savingLampTypes", "ZAPISYWANIE...") : `✓ ${t("planBma", "saveForThisPlan", "ZAPISZ DLA TEGO PLANU")}`}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    
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
                  <span>{editingConnection ? "✏️ Kabel bearbeiten" : (cableModalIsFreeLine ? "〰 Freie Leitung" : "🔌 Kabelverbindung")}</span>
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

              {/* Quick shortcut to Edit Route Waypoints */}
              <div style={{ marginBottom: 14, background: "rgba(139,92,246,0.15)", border: "1px solid #8b5cf6", padding: "8px 12px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ddd6fe" }}>📍 Przebieg trasy kabla:</span>
                <button
                  type="button"
                  onClick={() => {
                    if (editingConnection) {
                      const rawWps = editingConnection.metadata?.waypoints || [];
                      setEditingRouteCable(editingConnection);
                      setEditingRouteWaypoints(rawWps.length > 0 ? [...rawWps] : []);
                      setCableModalOpen(false);
                    }
                  }}
                  style={{ background: "#8b5cf6", color: "#ffffff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                >
                  📍 Edytuj punkty trasy
                </button>
              </div>

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
                  {cableTypesList.map((ct) => (
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

                            {/* Color Selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: 6 }}>
                  🎨 Kabelfarbe:
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { color: "#0284c7", label: "Blau" },
                    { color: "#10b981", label: "Grün" },
                    { color: "#f59e0b", label: "Gelb" },
                    { color: "#ef4444", label: "Rot" },
                    { color: "#8b5cf6", label: "Lila" },
                    { color: "#f97316", label: "Orange" },
                    { color: "#475569", label: "Grau" },
                  ].map((cItem) => (
                    <button
                      key={cItem.color}
                      type="button"
                      onClick={() => setCableColorInput(cItem.color)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: cItem.color,
                        border: cableColorInput === cItem.color ? "3px solid #ffffff" : "2px solid rgba(255,255,255,0.2)",
                        boxShadow: cableColorInput === cItem.color ? "0 0 8px " + cItem.color : "none",
                        cursor: "pointer",
                      }}
                      title={cItem.label}
                    />
                  ))}
                </div>
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
                  {cableLengthCalculated ? `${cableLengthCalculated} m` : "nicht kalibriert"}
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

      {/* 📱 Mobile Centered Popover Modal Sheet */}
      {isMobile && openTooltipId && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 16,
            right: 16,
            maxWidth: 480,
            margin: "0 auto",
            zIndex: 99990,
            background: "#0f172a",
            color: "#ffffff",
            border: "1px solid #334155",
            borderRadius: 18,
            boxShadow: "0 20px 35px -5px rgba(0,0,0,0.85), 0 0 15px rgba(56,189,248,0.25)",
            padding: 16,
            maxHeight: "75vh",
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #1e293b" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              📱 Szczegóły / Details
            </span>
            <button
              type="button"
              onClick={() => setOpenTooltipId(null)}
              style={{
                background: "#1e293b",
                color: "#94a3b8",
                border: "none",
                borderRadius: "50%",
                width: 28,
                height: 28,
                fontSize: 16,
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
          {renderActiveMobileTooltipContent()}
        </div>
      )}

      {/* 📷 Fullscreen Lightbox Photo Preview Overlay */}
      {fullscreenPhotoUrl && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999999,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            backdropFilter: "blur(6px)",
          }}
          onClick={() => setFullscreenPhotoUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenPhotoUrl(null);
            }}
            style={{
              position: "absolute",
              top: 24,
              right: 24,
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
              color: "#ffffff",
              border: "none",
              fontSize: 26,
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
            title="Zamknij (ESC)"
          >
            ✕
          </button>
          <img
            src={fullscreenPhotoUrl}
            alt="Vorschau"
            style={{
              maxWidth: "92vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 10,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Global Hidden File Inputs for Quick Serial Scanning & Photo Upload */}
      <input
        ref={quickScanFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          const sym = targetQuickSymbolRef.current;
          if (f && sym) {
            handleQuickScanSerial(sym, f);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={quickPhotoFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          const sym = targetQuickSymbolRef.current;
          if (f && sym) {
            handleQuickAddPhoto(sym, f);
          }
          e.target.value = "";
        }}
      />
    </>
  );
}