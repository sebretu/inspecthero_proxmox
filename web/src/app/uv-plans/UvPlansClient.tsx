"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNotification } from "@/contexts/NotificationContext";
import { apiGet, apiPost, apiPatch, apiDelete, apiCall, getToken, getApiUrl } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  Copy,
  UploadCloud,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderKanban,
  Check,
  X,
  Layers,
  ShieldCheck,
  Info,
  MapPin,
  Map as MapIcon,
  Table as TableIcon,
  MousePointer,
  Download,
  RotateCw,
  Palette,
  Eye,
  Settings
} from "lucide-react";
import type { UVPlan, UVPlanCircuit, UVPlanLocation } from "@/types/uvPlans";

const StromkreiseMap = dynamic(
  () => import("@/components/StromkreiseMap"),
  { ssr: false }
) as any;

const UV_COLOR_PALETTE = [
  "#2563eb", // Royal Blue
  "#16a34a", // Emerald Green
  "#9333ea", // Purple
  "#ea580c", // Orange
  "#e11d48", // Rose Red
  "#0891b2", // Cyan
  "#d97706", // Amber
  "#4f46e5", // Indigo
  "#059669", // Teal
  "#c026d3"  // Fuchsia
];

interface Project {
  id: string;
  name: string;
  address?: string;
  companies?: { name: string };
}

interface Plan {
  id: string;
  name: string;
  pdf_url?: string;
  building_id?: string;
  floor_id?: string;
  image_width?: number;
  image_height?: number;
  version?: number;
  floors?: { name: string; buildings?: { name: string } };
  buildings?: { name: string };
}

interface StromkreisMarker {
  id: string;
  project_id: string;
  plan_id: string;
  circuit_code: string;
  short_label: string;
  full_name: string;
  type: string;
  phase: number;
  breaker_current: number;
  breaker_curve: string;
  has_rcd: boolean;
  rcd_group?: string | null;
  panel_group?: string | null;
  marker_shape: string;
  x_norm: number;
  y_norm: number;
  metadata?: any;
}

export default function UvPlansClient() {
  const { t } = useLanguage();
  const { showNotification } = useNotification();

  // Auth / Role State
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(true);

  // View Mode: "map" or "table"
  const [viewMode, setViewMode] = useState<"map" | "table">("map");

  // Selection States
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>("");

  // UV Plans State
  const [uvPlans, setUvPlans] = useState<UVPlan[]>([]);
  const [selectedUvPlanId, setSelectedUvPlanId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Active working circuits copy for editing
  const [activeCircuits, setActiveCircuits] = useState<UVPlanCircuit[]>([]);

  // Floor Plan Map Markers State
  const [markers, setMarkers] = useState<StromkreisMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<StromkreisMarker | null>(null);

  // Map Edit & Placement States
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [placingCircuit, setPlacingCircuit] = useState<UVPlanCircuit | null>(null);
  const [isPlacingOnMap, setIsPlacingOnMap] = useState<boolean>(false);
  const [isPlacingUvBoard, setIsPlacingUvBoard] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Modals
  const [isCircuitModalOpen, setIsCircuitModalOpen] = useState<boolean>(false);
  const [editingCircuit, setEditingCircuit] = useState<UVPlanCircuit | null>(null);
  const [isAddCircuitMode, setIsAddCircuitMode] = useState<boolean>(false);

  // Duplicate prompt modal
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    isOpen: boolean;
    detectedName: string;
    existingPlan: UVPlan | null;
    parsedFuses: any[];
    fileName: string;
  }>({
    isOpen: false,
    detectedName: "",
    existingPlan: null,
    parsedFuses: [],
    fileName: ""
  });

  // Rename & Settings UV Plan modal
  const [isRenameModalOpen, setIsRenameModalOpen] = useState<boolean>(false);
  const [newPlanName, setNewPlanName] = useState<string>("");
  const [selectedUvColor, setSelectedUvColor] = useState<string>("#2563eb");

  // Circuit form fields
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formBreakerCurrent, setFormBreakerCurrent] = useState<number>(16);
  const [formBreakerCurve, setFormBreakerCurve] = useState("B");
  const [formPhases, setFormPhases] = useState<number>(1);
  const [formHasRcd, setFormHasRcd] = useState<boolean>(true);
  const [formRcdGroup, setFormRcdGroup] = useState("");
  const [formCableType, setFormCableType] = useState("NYM-J 3x1.5");

  // Load Session & Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
      if (data.session?.user) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .single()
          .then(({ data: profile }) => {
            setIsAdmin(profile?.role === "ADMIN" || profile?.role === "MODERATOR");
          });
      }
    });
  }, []);

  // Load Projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await apiGet<any>("/api/projects");
        const list = res?.data || res || [];
        if (Array.isArray(list)) {
          setProjects(list);
          if (list.length > 0) {
            const savedProject = localStorage.getItem("inspecthero_last_project_id");
            if (savedProject && list.some(p => p.id === savedProject)) {
              setSelectedProjectId(savedProject);
            } else {
              setSelectedProjectId(list[0].id);
            }
          }
        }
      } catch (err: any) {
        showNotification("Fehler beim Laden der Projekte: " + err.message, "error");
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, [showNotification]);

  // Load Plans for Selected Project
  useEffect(() => {
    if (!selectedProjectId) return;
    apiGet<any[]>(`/api/plans?projectId=${selectedProjectId}&limit=100`).then(res => {
      const ps = (res as any)?.data || res || [];
      setPlans(ps);
      if (ps.length > 0) {
        setActivePlanId(ps[0].id);
      } else {
        setActivePlanId("");
        setMarkers([]);
      }
    });
  }, [selectedProjectId]);

  // Load Map Markers for Active Floor Plan
  const loadMarkers = useCallback(async () => {
    if (!activePlanId || !selectedProjectId) return;
    try {
      const res = await apiGet<any[]>(`/api/stromkreise?projectId=${selectedProjectId}&planId=${activePlanId}`);
      const mList = (res as any)?.data || res || [];
      setMarkers(Array.isArray(mList) ? mList : []);
    } catch {
      setMarkers([]);
    }
  }, [activePlanId, selectedProjectId]);

  useEffect(() => {
    if (activePlanId) {
      loadMarkers();
    }
  }, [activePlanId, loadMarkers]);

  // Load UV plans when project changes
  const loadUvPlans = useCallback(async (projId: string) => {
    if (!projId) {
      setUvPlans([]);
      setSelectedUvPlanId("");
      setActiveCircuits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/uv-plans?projectId=${projId}`);
      const uvs: UVPlan[] = res?.data || res || [];
      
      // Auto-assign distinct colors if not present
      const coloredUvs = uvs.map((uv, idx) => ({
        ...uv,
        color: uv.color || UV_COLOR_PALETTE[idx % UV_COLOR_PALETTE.length]
      }));

      setUvPlans(coloredUvs);

      if (coloredUvs.length > 0) {
        setSelectedUvPlanId(prev => {
          const exists = coloredUvs.find(p => p.id === prev);
          const chosen = exists ? exists : coloredUvs[0];
          setActiveCircuits(chosen.circuits || []);
          return chosen.id;
        });
      } else {
        setSelectedUvPlanId("");
        setActiveCircuits([]);
      }
      setHasUnsavedChanges(false);
    } catch (err: any) {
      showNotification("Fehler beim Laden der UV-Pläne: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem("inspecthero_last_project_id", selectedProjectId);
      loadUvPlans(selectedProjectId);
    }
  }, [selectedProjectId, loadUvPlans]);

  // Selected UV Plan object
  const activePlan = useMemo(() => {
    return uvPlans.find(p => p.id === selectedUvPlanId) || null;
  }, [uvPlans, selectedUvPlanId]);

  // Active Floor Plan object
  const activeFloorPlan = useMemo(() => {
    return plans.find(p => p.id === activePlanId) || null;
  }, [plans, activePlanId]);

  // UV Distribution Boards located on the active floor plan
  const uvBoardsOnActivePlan = useMemo(() => {
    return uvPlans
      .filter(p => p.location && p.location.plan_id === activePlanId)
      .map(p => ({
        id: p.id,
        name: p.name,
        color: p.color || "#2563eb",
        x_norm: p.location!.x_norm,
        y_norm: p.location!.y_norm,
        plan_id: p.location!.plan_id
      }));
  }, [uvPlans, activePlanId]);

  // Switch active UV plan
  const handleSelectPlan = (planId: string) => {
    if (hasUnsavedChanges) {
      if (!window.confirm("Sie haben ungespeicherte Änderungen. Möchten Sie trotzdem wechseln?")) {
        return;
      }
    }
    setSelectedUvPlanId(planId);
    const plan = uvPlans.find(p => p.id === planId);
    setActiveCircuits(plan?.circuits || []);
    setHasUnsavedChanges(false);
    setSelectedMarker(null);
    setPlacingCircuit(null);
    setIsPlacingOnMap(false);
    setIsPlacingUvBoard(false);
  };

  // Helper to determine marker type from circuit attributes
  const determineMarkerTypeAndShape = (circuit: UVPlanCircuit) => {
    const desc = (circuit.description || "").toLowerCase();
    const code = (circuit.circuit_code || "").toLowerCase();

    if (desc.includes("licht") || desc.includes("beleuchtung") || desc.includes("leucht") || code.startsWith("l") || desc.includes("lamp")) {
      return { type: "light", shape: "circle" };
    }
    if (
      desc.includes("cee") ||
      code.includes("cee") ||
      (circuit.phases === 3 && (circuit.breaker_current || 16) >= 16 && (desc.includes("kraft") || desc.includes("herd") || desc.includes("wallbox") || desc.includes("drehstrom")))
    ) {
      return { type: "cee", shape: "rhombus" };
    }
    if (desc.includes("edv") || desc.includes("netzwerk") || desc.includes("lan") || desc.includes("patch") || desc.includes("data")) {
      return { type: "edv", shape: "square" };
    }
    return { type: "socket", shape: "circle" };
  };

  // Start placing a circuit on the map
  const handleStartPlacingCircuit = (circuit: UVPlanCircuit) => {
    if (!activePlanId) {
      showNotification("Bitte wählen Sie zuerst einen Installationsplan (Rzut) oben aus!", "error");
      return;
    }
    setSelectedMarker(null);
    setPlacingCircuit(circuit);
    setIsPlacingOnMap(true);
    setIsPlacingUvBoard(false);
    setIsEditMode(false);
    setViewMode("map");
    showNotification(`Klicken Sie auf den Plan, um [${circuit.circuit_code} - ${circuit.description || "Stromkreis"}] zu platzieren (Mehrfachplatzierung aktiv).`, "info");
  };

  // Stop placing circuit
  const handleStopPlacingCircuit = () => {
    setIsPlacingOnMap(false);
    setPlacingCircuit(null);
  };

  // Start placing UV board location
  const handleStartPlacingUvBoard = () => {
    if (!activePlanId) {
      showNotification("Bitte wählen Sie zuerst einen Installationsplan oben aus!", "error");
      return;
    }
    if (!activePlan) {
      showNotification("Bitte wählen Sie einen UV-Plan aus!", "error");
      return;
    }
    setSelectedMarker(null);
    setIsPlacingUvBoard(true);
    setIsPlacingOnMap(false);
    setPlacingCircuit(null);
    setIsEditMode(false);
    setViewMode("map");
    showNotification(`Klicken Sie auf den Plan, um den Standort für [${activePlan.name}] festzulegen.`, "info");
  };

  // Count placed markers for a specific circuit code on current floor plan, strictly scoped to active UV
  const getPlacedMarkerCount = useCallback((circuitCode: string, circuitId?: string) => {
    if (!activePlan) return 0;
    return markers.filter(m => {
      // 1. Direct circuit ID linkage
      if (m.metadata?.uv_circuit_id) {
        return m.metadata.uv_circuit_id === circuitId;
      }
      // 2. Direct UV plan ID linkage
      if (m.metadata?.uv_plan_id) {
        return m.metadata.uv_plan_id === activePlan.id && m.circuit_code === circuitCode;
      }
      // 3. Panel group / UV name linkage
      const markerUvName = m.panel_group || m.metadata?.uv_name;
      if (markerUvName) {
        return markerUvName.trim().toLowerCase() === activePlan.name.trim().toLowerCase() && m.circuit_code === circuitCode;
      }
      // 4. Fallback only if project has only 1 UV plan
      if (uvPlans.length <= 1) {
        return m.circuit_code === circuitCode;
      }
      return false;
    }).length;
  }, [markers, activePlan, uvPlans.length]);

  // Handle map click: placing UV board OR placing circuit
  const handleMapClickAddMarker = async (x: number, y: number) => {
    // Mode 1: Placing UV board location
    if (isPlacingUvBoard && activePlan && activePlanId) {
      try {
        const newLocation: UVPlanLocation = {
          plan_id: activePlanId,
          x_norm: x,
          y_norm: y
        };

        await apiPatch("/api/uv-plans", {
          id: activePlan.id,
          location: newLocation
        });

        setUvPlans(prev =>
          prev.map(p => (p.id === activePlan.id ? { ...p, location: newLocation } : p))
        );

        showNotification(`Standort für "${activePlan.name}" erfolgreich auf dem Plan markiert!`, "success");
        setIsPlacingUvBoard(false);
      } catch (err: any) {
        showNotification("Fehler beim Setzen des UV-Standorts: " + err.message, "error");
      }
      return;
    }

    // Mode 2: Placing circuit marker (multi-placement)
    if (!placingCircuit || !activePlanId || !selectedProjectId) return;

    const { type, shape } = determineMarkerTypeAndShape(placingCircuit);
    const uvColor = activePlan?.color || "#2563eb";

    const payload = {
      project_id: selectedProjectId,
      plan_id: activePlanId,
      circuit_code: placingCircuit.circuit_code,
      panel_group: activePlan?.name || null,
      short_label: placingCircuit.circuit_code.split(".").pop() || placingCircuit.circuit_code,
      full_name: placingCircuit.description || placingCircuit.circuit_code,
      type: type,
      marker_shape: shape,
      phase: placingCircuit.phases || 1,
      breaker_current: placingCircuit.breaker_current || 16,
      breaker_curve: placingCircuit.breaker_curve || "B",
      has_rcd: placingCircuit.has_rcd !== false,
      rcd_group: placingCircuit.rcd_group || null,
      x_norm: x,
      y_norm: y,
      metadata: {
        uv_name: activePlan?.name || "UV",
        uv_plan_id: activePlan?.id,
        uv_circuit_id: placingCircuit.id,
        uv_color: uvColor,
        kabeltyp: placingCircuit.cable_type || (type === "socket" ? "NYM-J 3x2.5" : "NYM-J 3x1.5")
      }
    };

    try {
      const res = await apiPost<any>("/api/stromkreise", payload);
      if (res && (res.id || res.data?.id)) {
        showNotification(`Marker "${placingCircuit.circuit_code}" platziert! Klicken Sie erneut für weitere Marker oder auf „Fertig“.`, "success");
        await loadMarkers();
      }
    } catch (err: any) {
      showNotification("Fehler beim Platzieren auf dem Plan: " + err.message, "error");
    }
  };

  // Move circuit marker on map
  const handleMoveMarker = async (id: string, x: number, y: number) => {
    if (!isAdmin || !isEditMode) return;
    setMarkers(prev => prev.map(m => (m.id === id ? { ...m, x_norm: x, y_norm: y } : m)));
    try {
      await apiPatch("/api/stromkreise", { id, x_norm: x, y_norm: y });
    } catch (err: any) {
      showNotification("Fehler beim Verschieben: " + err.message, "error");
      await loadMarkers();
    }
  };

  // Move UV distribution board location on map
  const handleMoveUvBoard = async (uvId: string, x: number, y: number) => {
    if (!isAdmin || !isEditMode || !activePlanId) return;
    const targetUv = uvPlans.find(p => p.id === uvId);
    if (!targetUv) return;

    const newLoc: UVPlanLocation = {
      plan_id: activePlanId,
      x_norm: x,
      y_norm: y
    };

    setUvPlans(prev => prev.map(p => (p.id === uvId ? { ...p, location: newLoc } : p)));

    try {
      await apiPatch("/api/uv-plans", {
        id: uvId,
        location: newLoc
      });
      showNotification(`Standort für "${targetUv.name}" aktualisiert.`, "info");
    } catch (err: any) {
      showNotification("Fehler beim Aktualisieren des UV-Standorts: " + err.message, "error");
    }
  };

  // Toggle Marker Orientation/Rotation
  const handleToggleMarkerOrientation = async (id: string) => {
    const marker = markers.find(m => m.id === id);
    if (!marker || !isAdmin) return;

    const currentRot = marker.metadata?.rotation || (marker.metadata?.orientation === "vertical" ? 270 : 0);
    const nextRot = (currentRot + 90) % 360;

    const payload = {
      id: marker.id,
      metadata: {
        ...(marker.metadata || {}),
        rotation: nextRot,
        orientation: nextRot === 270 ? "vertical" : "horizontal"
      }
    };

    try {
      await apiPatch("/api/stromkreise", payload);
      showNotification("Marker 90° gedreht!", "success");
      loadMarkers();
    } catch (e: any) {
      showNotification(e.message || "Fehler beim Drehen", "error");
    }
  };

  useEffect(() => {
    (window as any).toggleMarkerOrientation = (id: string) => {
      handleToggleMarkerOrientation(id);
    };
    return () => {
      delete (window as any).toggleMarkerOrientation;
    };
  }, [markers, isAdmin]);

  // Delete Marker from Map
  const handleDeleteMarker = useCallback(async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm("Möchten Sie diesen Marker wirklich vom Plan löschen?")) return;
    try {
      await apiDelete(`/api/stromkreise?id=${id}`);
      showNotification("Marker gelöscht.", "info");
      setSelectedMarker(null);
      await loadMarkers();
    } catch (e: any) {
      showNotification(e.message || "Fehler beim Löschen", "error");
    }
  }, [isAdmin, showNotification, loadMarkers]);

  // Keyboard Shortcuts (Delete, Backspace, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Check for Delete / Del / Backspace key
      if (e.key === "Delete" || e.key === "Del" || e.key === "Backspace") {
        if (selectedMarker) {
          e.preventDefault();
          handleDeleteMarker(selectedMarker.id);
        }
      }

      // Check for Escape key
      if (e.key === "Escape") {
        if (selectedMarker) {
          setSelectedMarker(null);
        }
        if (isPlacingOnMap || isPlacingUvBoard) {
          setIsPlacingOnMap(false);
          setIsPlacingUvBoard(false);
          setPlacingCircuit(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedMarker, isAdmin, isPlacingOnMap, isPlacingUvBoard, handleDeleteMarker]);

  // Helper to parse hex to pdf-lib rgb
  const hexToPdfRgb = (hex: string, rgbFn: any) => {
    let cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map(c => c + c).join("");
    }
    const num = parseInt(cleanHex, 16);
    const r = ((num >> 16) & 255) / 255;
    const g = ((num >> 8) & 255) / 255;
    const b = (num & 255) / 255;
    return rgbFn(r, g, b);
  };

  // Export Vector PDF
  const handleExportVectorPdf = async () => {
    const currentPlan = plans.find(p => p.id === activePlanId);
    if (!currentPlan) {
      showNotification("Bitte wählen Sie zuerst einen Plan aus!", "error");
      return;
    }

    setIsExportingPdf(true);
    try {
      showNotification("Generiere Vector-PDF mit UV-Verteilern...", "info");
      const urlRes = await apiGet<any>(`/api/plans/pdf-url?id=${currentPlan.id}`);
      const pdfUrl = urlRes?.signedUrl;
      if (!pdfUrl) throw new Error("Konnte Plan-PDF URL nicht abrufen");

      const response = await fetch(pdfUrl);
      const originalPlanPdfBytes = await response.arrayBuffer();

      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      const mainPdfDoc = await PDFDocument.load(originalPlanPdfBytes);

      const [page1] = mainPdfDoc.getPages();
      const rotationAngle = page1.getRotation().angle || 0;
      const mediaBox = page1.getMediaBox();
      const cropBox = page1.getCropBox();

      const ox = cropBox.x !== undefined ? cropBox.x : (mediaBox.x || 0);
      const oy = cropBox.y !== undefined ? cropBox.y : (mediaBox.y || 0);
      const w = cropBox.width !== undefined ? cropBox.width : mediaBox.width;
      const h = cropBox.height !== undefined ? cropBox.height : mediaBox.height;

      let imgW = currentPlan.image_width;
      let imgH = currentPlan.image_height;

      if (!imgW || !imgH) {
        try {
          const { data: activeVer } = await supabase
            .from("plan_versions")
            .select("width_px, height_px")
            .eq("plan_id", currentPlan.id)
            .eq("status", "active")
            .maybeSingle();
          if (activeVer?.width_px && activeVer?.height_px) {
            imgW = activeVer.width_px;
            imgH = activeVer.height_px;
          }
        } catch (err) {
          console.error("Failed to query active version dimensions", err);
        }
      }

      let scaleX = 1;
      let scaleY = 1;

      try {
        const appToken = await getToken();
        const headers: Record<string, string> = {};
        if (appToken) {
          headers.Authorization = `Bearer ${appToken}`;
          headers["X-App-Token"] = appToken;
        }
        const metaResRaw = await fetch(getApiUrl(`/api/tiles/${currentPlan.id}/meta?t=${Date.now()}`), { headers });
        if (metaResRaw.ok) {
          const metaRes = await metaResRaw.json();
          if (metaRes && metaRes.gridW && metaRes.gridH) {
            const tileSize = metaRes.tileSize || 256;
            const gridW = metaRes.gridW * tileSize;
            const gridH = metaRes.gridH * tileSize;
            if (imgW && imgH) {
              scaleX = gridW / imgW;
              scaleY = gridH / imgH;
            }
          }
        }
      } catch (metaErr) {
        console.error("Failed to fetch tile metadata for scaling", metaErr);
      }

      if (scaleX === 1 && scaleY === 1 && imgW && imgH) {
        const tileSize = 256;
        const gridW = Math.ceil(imgW / tileSize) * tileSize;
        const gridH = Math.ceil(imgH / tileSize) * tileSize;
        scaleX = gridW / imgW;
        scaleY = gridH / imgH;
      }

      const helveticaBold = await mainPdfDoc.embedFont(StandardFonts.HelveticaBold);

      const getMarkerCoords = (marker: any, width: number, height: number, rot: number) => {
        const x = marker.x_norm * scaleX;
        const y = marker.y_norm * scaleY;
        let cx = 0;
        let cy = 0;
        if (rot === 90) {
          cx = y * width;
          cy = x * height;
        } else if (rot === 180) {
          cx = (1 - x) * width;
          cy = y * height;
        } else if (rot === 270) {
          cx = y * width;
          cy = (1 - x) * height;
        } else {
          cx = x * width;
          cy = (1 - y) * height;
        }
        return { x: cx + ox, y: cy + oy };
      };

      // 1. Draw UV Distribution Boards on page1 (100% smaller / compact badge)
      uvBoardsOnActivePlan.forEach(board => {
        const coords = getMarkerCoords(board, w, h, rotationAngle);
        const cx = coords.x;
        const cy = coords.y;
        const uvColor = hexToPdfRgb(board.color || "#2563eb", rgb);
        const safeBoardName = (board.name || "").toUpperCase().replace(/[^\x00-\x7F]/g, "").trim();
        const uvText = `[ ${safeBoardName} ]`;
        const fSize = 4.8;
        const txtW = uvText.length * fSize * 0.55;
        const boxW = txtW + 6;
        const boxH = fSize + 4;

        // Draw background rectangle & border
        page1.drawRectangle({
          x: cx - boxW / 2,
          y: cy - boxH / 2,
          width: boxW,
          height: boxH,
          borderColor: uvColor,
          borderWidth: 1.2,
          color: rgb(15 / 255, 23 / 255, 42 / 255),
          opacity: 0.95
        });

        page1.drawText(uvText, {
          x: cx - txtW / 2,
          y: cy - fSize * 0.35,
          size: fSize,
          font: helveticaBold,
          color: uvColor
        });
      });

      const uvColorMap = new Map<string, string>();
      uvPlans.forEach(p => {
        if (p.id) uvColorMap.set(p.id, p.color || "#2563eb");
        if (p.name) uvColorMap.set(p.name.trim().toLowerCase(), p.color || "#2563eb");
      });

      const getMarkerUvColor = (marker: any) => {
        if (marker.metadata?.uv_plan_id && uvColorMap.has(marker.metadata.uv_plan_id)) {
          return uvColorMap.get(marker.metadata.uv_plan_id);
        }
        const uvName = (marker.panel_group || marker.metadata?.uv_name || "").trim().toLowerCase();
        if (uvName && uvColorMap.has(uvName)) {
          return uvColorMap.get(uvName);
        }
        if (marker.metadata?.uv_color) {
          return marker.metadata.uv_color;
        }
        return null;
      };

      // 2. Draw vector circuit markers directly on page1 (50% smaller, colored by UV)
      markers.forEach(m => {
        const coords = getMarkerCoords(m, w, h, rotationAngle);
        const cx = coords.x;
        const cy = coords.y;

        const markerUvHex = getMarkerUvColor(m);
        const markerUvColor = markerUvHex ? hexToPdfRgb(markerUvHex, rgb) : null;

        if (m.type === "line" || m.type === "arrow") {
          const coords2 = getMarkerCoords({ x_norm: m.metadata?.x2_norm ?? m.x_norm, y_norm: m.metadata?.y2_norm ?? m.y_norm }, w, h, rotationAngle);
          const lineColor = markerUvColor || rgb(234 / 255, 179 / 255, 8 / 255);
          
          page1.drawLine({
            start: { x: cx, y: cy },
            end: { x: coords2.x, y: coords2.y },
            thickness: 1.5,
            color: lineColor
          });
          
          if (m.type === "arrow" && (cx !== coords2.x || cy !== coords2.y)) {
             const dx = coords2.x - cx;
             const dy = coords2.y - cy;
             const angle = Math.atan2(dy, dx);
             const headLen = 7.5;
             const p3x = coords2.x - headLen * Math.cos(angle - Math.PI / 6);
             const p3y = coords2.y - headLen * Math.sin(angle - Math.PI / 6);
             const p4x = coords2.x - headLen * Math.cos(angle + Math.PI / 6);
             const p4y = coords2.y - headLen * Math.sin(angle + Math.PI / 6);
             
             page1.drawLine({ start: { x: coords2.x, y: coords2.y }, end: { x: p3x, y: p3y }, thickness: 1.5, color: lineColor });
             page1.drawLine({ start: { x: coords2.x, y: coords2.y }, end: { x: p4x, y: p4y }, thickness: 1.5, color: lineColor });
             page1.drawLine({ start: { x: p3x, y: p3y }, end: { x: p4x, y: p4y }, thickness: 1.5, color: lineColor });
          }
          return;
        }

        // Symbols (50% smaller, colored by UV)
        if (["sym_socket", "sym_cee16", "sym_cee32"].includes(m.type)) {
          const symColor = markerUvColor || rgb(22 / 255, 163 / 255, 74 / 255);
          const R = 3.5;
          const markerRotation = m.metadata?.rotation || (m.metadata?.orientation === "vertical" ? 270 : 0);
          const effectiveRotation = (markerRotation + rotationAngle + 180) % 360;
          
          const getPt = (xOffset: number, yOffset: number) => {
            if (effectiveRotation === 90) return { x: cx + yOffset, y: cy - xOffset };
            if (effectiveRotation === 180) return { x: cx - xOffset, y: cy - yOffset };
            if (effectiveRotation === 270) return { x: cx - yOffset, y: cy + xOffset };
            return { x: cx + xOffset, y: cy + yOffset };
          };

          const steps = 16;
          const stepAngle = Math.PI / steps;
          for (let i = 0; i < steps; i++) {
            const a1 = i * stepAngle;
            const a2 = (i + 1) * stepAngle;
            const pt1 = getPt(R * Math.cos(a1), -R + R * Math.sin(a1));
            const pt2 = getPt(R * Math.cos(a2), -R + R * Math.sin(a2));
            page1.drawLine({ start: pt1, end: pt2, thickness: 0.8, color: symColor });
          }
          
          page1.drawLine({ start: getPt(-R, 0), end: getPt(R, 0), thickness: 0.8, color: symColor });
          page1.drawLine({ start: getPt(0, 0), end: getPt(0, R + 2.5), thickness: 0.8, color: symColor });
          
          if (m.type === "sym_cee16" || m.type === "sym_cee32") {
            for (let i = 0; i < 3; i++) {
              const yOffset = 2 + i * 1.5;
              page1.drawLine({ start: getPt(-1.5, yOffset), end: getPt(1.5, yOffset + 1.5), thickness: 0.8, color: symColor });
            }
            const labelText = m.type === "sym_cee16" ? "16A" : "32A";
            const textW = labelText.length * 2.5 * 0.55;
            let tx = cx - textW / 2;
            let ty = cy - 7;
            if (effectiveRotation === 90) { tx = cx - 7; ty = cy - textW / 2; }
            else if (effectiveRotation === 180) { tx = cx - textW / 2; ty = cy + 5.5; }
            else if (effectiveRotation === 270) { tx = cx + 5.5; ty = cy - textW / 2; }
            page1.drawText(labelText, {
              x: tx,
              y: ty,
              size: 2.5,
              font: helveticaBold,
              color: symColor,
              rotate: degrees(effectiveRotation),
            });
          }
          return;
        }

        // Circuit text marker colors (UV color prioritized, then standard fallback)
        let txtColor = markerUvColor;
        if (!txtColor) {
          if (m.type === "socket") txtColor = rgb(220 / 255, 38 / 255, 38 / 255);
          else if (m.type === "light") txtColor = rgb(217 / 255, 119 / 255, 6 / 255);
          else if (m.type === "edv") txtColor = rgb(220 / 255, 38 / 255, 38 / 255);
          else if (m.type === "cee") txtColor = rgb(168 / 255, 85 / 255, 247 / 255);
          else if (m.type === "special") txtColor = rgb(139 / 255, 92 / 255, 246 / 255);
          else if (m.type === "reserve") txtColor = rgb(100 / 255, 116 / 255, 139 / 255);
          else if (m.type === "text") txtColor = rgb(15 / 255, 23 / 255, 42 / 255);
          else txtColor = rgb(0, 0, 0);
        }

        const rawTxt = m.type === "text"
          ? m.short_label
          : m.circuit_code;
        const txt = (rawTxt || "").replace(/[^\x00-\x7F]/g, "").trim();
        const fSize = 4.3;
        const txtW = txt.length * fSize * 0.55;
        let textRotation = 0;

        if (rotationAngle === 90) textRotation = 90;
        else if (rotationAngle === 180) textRotation = 180;
        else if (rotationAngle === 270) textRotation = 270;

        const markerRotation = m.metadata?.rotation || (m.metadata?.orientation === "vertical" ? 270 : 0);
        textRotation = (textRotation + markerRotation) % 360;

        let tx = cx;
        let ty = cy;
        if (textRotation === 90) {
          tx = cx + fSize * 0.35;
          ty = cy - txtW / 2;
        } else if (textRotation === 270) {
          tx = cx - fSize * 0.35;
          ty = cy + txtW / 2;
        } else if (textRotation === 180) {
          tx = cx + txtW / 2;
          ty = cy + fSize * 0.35;
        } else {
          tx = cx - txtW / 2;
          ty = cy - fSize * 0.35;
        }

        page1.drawText(txt, {
          x: tx,
          y: ty,
          size: fSize,
          font: helveticaBold,
          color: txtColor,
          rotate: degrees(textRotation)
        });
      });

      // Save and trigger download
      const finalPdfBytes = await mainPdfDoc.save();
      const blob = new Blob([finalPdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const dateStr = new Date().toISOString().split("T")[0];
      const activeProject = projects.find(p => p.id === selectedProjectId);
      const compName = activeProject?.companies?.name || "";
      const planNameRaw = [compName, currentPlan.floors?.buildings?.name, currentPlan.floors?.name, currentPlan.name].filter(Boolean).join("_");
      const cleanPlan = planNameRaw.replace(/[\s/\\?%*:|"<>.-]/g, "_");
      link.download = `plan_uv_stromkreise_${cleanPlan}_${dateStr}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification("Vector-PDF erfolgreich heruntergeladen!", "success");
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Fehler beim Erstellen des Vector-PDFs", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // PDF Upload & Parsing
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId) return;

    e.target.value = "";
    setUploading(true);

    try {
      showNotification("Schaltplan wird analysiert...", "info");

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      const res = await apiCall<{ boardName?: string; fuses: any[] }>("/api/parse-plan", {
        method: "POST",
        body: {
          fileData: base64Data,
          fileName: file.name
        },
        timeoutMs: 120000
      });

      if (!res || !res.fuses || !Array.isArray(res.fuses)) {
        throw new Error("Keine Stromkreise im PDF gefunden.");
      }

      // Determine UV Name
      let detectedUvName = (res.boardName || "").trim();
      if (!detectedUvName || detectedUvName.length < 2) {
        detectedUvName = file.name
          .replace(/\.pdf$/i, "")
          .replace(/[_.-]+/g, " ")
          .trim();
      }
      if (!detectedUvName) detectedUvName = "UV " + (uvPlans.length + 1);

      // Check for duplicates in current project
      const existing = uvPlans.find(
        p => p.name.toLowerCase() === detectedUvName.toLowerCase()
      );

      if (existing) {
        setDuplicatePrompt({
          isOpen: true,
          detectedName: detectedUvName,
          existingPlan: existing,
          parsedFuses: res.fuses,
          fileName: file.name
        });
      } else {
        await createUvPlanWithCircuits(detectedUvName, file.name, res.fuses);
      }
    } catch (err: any) {
      showNotification("Fehler beim Verarbeiten des PDF: " + (err.message || err), "error");
    } finally {
      setUploading(false);
    }
  };

  // Convert raw parser fuses to UVPlanCircuit objects
  const mapFusesToCircuits = (fuses: any[]): UVPlanCircuit[] => {
    return fuses.map((f: any, idx: number) => {
      const isSocket = (f.name || "").toLowerCase().includes("steck") || (f.description || "").toLowerCase().includes("steck");
      const isCee = (f.name || "").toLowerCase().includes("cee") || (f.description || "").toLowerCase().includes("cee");
      const defaultCable = isCee ? "NYM-J 5x2.5" : isSocket ? "NYM-J 3x2.5" : "NYM-J 3x1.5";

      return {
        id: "uvc-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).slice(2, 6),
        circuit_code: String(f.name || (idx + 1)).trim(),
        description: String(f.description || "").trim(),
        breaker_current: Number(f.rating) || 16,
        breaker_curve: String(f.characteristic || "B").trim(),
        phases: Number(f.phases) === 3 ? 3 : 1,
        has_rcd: typeof f.rcd === "boolean" ? f.rcd : true,
        rcd_group: f.rcd_group || undefined,
        cable_type: f.cableDesignation ? `${f.cableDesignation} - ${f.kabeltyp || defaultCable}` : (f.kabeltyp || defaultCable),
        source: "imported",
        modified: false,
        created_at: new Date().toISOString()
      };
    });
  };

  // Create new UV plan
  const createUvPlanWithCircuits = async (name: string, fileName: string, fuses: any[]) => {
    const mapped = mapFusesToCircuits(fuses);
    const assignedColor = UV_COLOR_PALETTE[uvPlans.length % UV_COLOR_PALETTE.length];

    try {
      const payload = {
        projectId: selectedProjectId,
        name: name.trim(),
        pdfFilename: fileName,
        circuits: mapped,
        color: assignedColor,
        location: null
      };
      const res = await apiPost<any>("/api/uv-plans", payload);
      if (res && res.data) {
        showNotification(`UV-Plan "${name}" mit ${mapped.length} Stromkreisen erfolgreich importiert!`, "success");
        await loadUvPlans(selectedProjectId);
        setSelectedUvPlanId(res.data.id);
        setActiveCircuits(mapped);
      }
    } catch (err: any) {
      showNotification("Fehler beim Speichern des UV-Plans: " + err.message, "error");
    }
  };

  // Update existing UV plan with newly parsed circuits
  const handleUpdateExistingUvPlan = async () => {
    if (!duplicatePrompt.existingPlan) return;
    const existing = duplicatePrompt.existingPlan;
    const newCircuits = mapFusesToCircuits(duplicatePrompt.parsedFuses);

    const existingManuals = (existing.circuits || []).filter(c => c.source === "manual");
    const existingModified = (existing.circuits || []).filter(c => c.modified);

    const mergedCircuits: UVPlanCircuit[] = [...newCircuits];

    for (let i = 0; i < mergedCircuits.length; i++) {
      const matchMod = existingModified.find(m => m.circuit_code === mergedCircuits[i].circuit_code);
      if (matchMod) {
        mergedCircuits[i] = { ...matchMod };
      }
    }

    for (const man of existingManuals) {
      if (!mergedCircuits.some(c => c.id === man.id || c.circuit_code === man.circuit_code)) {
        mergedCircuits.push(man);
      }
    }

    try {
      await apiPatch("/api/uv-plans", {
        id: existing.id,
        circuits: mergedCircuits
      });
      showNotification(`UV-Plan "${existing.name}" erfolgreich aktualisiert (${mergedCircuits.length} Stromkreise)!`, "success");
      setDuplicatePrompt({ isOpen: false, detectedName: "", existingPlan: null, parsedFuses: [], fileName: "" });
      await loadUvPlans(selectedProjectId);
    } catch (err: any) {
      showNotification("Fehler beim Aktualisieren: " + err.message, "error");
    }
  };

  // Import as new separate plan with distinct name
  const handleImportAsNewPlan = async () => {
    const uniqueName = `${duplicatePrompt.detectedName} (${new Date().toLocaleDateString()})`;
    await createUvPlanWithCircuits(uniqueName, duplicatePrompt.fileName, duplicatePrompt.parsedFuses);
    setDuplicatePrompt({ isOpen: false, detectedName: "", existingPlan: null, parsedFuses: [], fileName: "" });
  };

  // Save changes to active plan's circuits
  const handleSaveCircuits = async () => {
    if (!selectedUvPlanId) return;
    setIsSaving(true);
    try {
      await apiPatch("/api/uv-plans", {
        id: selectedUvPlanId,
        circuits: activeCircuits
      });
      setHasUnsavedChanges(false);
      showNotification("Stromkreise erfolgreich gespeichert!", "success");

      setUvPlans(prev =>
        prev.map(p => (p.id === selectedUvPlanId ? { ...p, circuits: activeCircuits, updated_at: new Date().toISOString() } : p))
      );
    } catch (err: any) {
      showNotification("Fehler beim Speichern: " + err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete UV Plan
  const handleDeletePlan = async (planId: string, planName: string) => {
    if (!window.confirm(`Möchten Sie den UV-Plan "${planName}" wirklich löschen? Bereits auf Installationsplänen platzierte Stromkreise bleiben erhalten.`)) {
      return;
    }
    try {
      await apiDelete(`/api/uv-plans?id=${planId}`);
      showNotification(`UV-Plan "${planName}" gelöscht.`, "success");
      await loadUvPlans(selectedProjectId);
    } catch (err: any) {
      showNotification("Fehler beim Löschen: " + err.message, "error");
    }
  };

  // Save UV Plan Settings (Name & Color)
  const handleSavePlanSettings = async () => {
    if (!selectedUvPlanId || !newPlanName.trim()) return;
    try {
      await apiPatch("/api/uv-plans", {
        id: selectedUvPlanId,
        name: newPlanName.trim(),
        color: selectedUvColor
      });
      showNotification("UV-Plan Einstellungen gespeichert!", "success");
      setIsRenameModalOpen(false);
      setUvPlans(prev =>
        prev.map(p => (p.id === selectedUvPlanId ? { ...p, name: newPlanName.trim(), color: selectedUvColor } : p))
      );
    } catch (err: any) {
      showNotification("Fehler beim Speichern: " + err.message, "error");
    }
  };

  // Open Add Circuit Modal
  const handleOpenAddCircuit = () => {
    const nextNum = activeCircuits.length + 1;
    const formattedNum = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;

    setFormCode(formattedNum);
    setFormDescription("");
    setFormBreakerCurrent(16);
    setFormBreakerCurve("B");
    setFormPhases(1);
    setFormHasRcd(true);
    setFormRcdGroup("");
    setFormCableType("NYM-J 3x1.5");

    setEditingCircuit(null);
    setIsAddCircuitMode(true);
    setIsCircuitModalOpen(true);
  };

  // Open Edit Circuit Modal
  const handleOpenEditCircuit = (circuit: UVPlanCircuit) => {
    setFormCode(circuit.circuit_code);
    setFormDescription(circuit.description);
    setFormBreakerCurrent(circuit.breaker_current || 16);
    setFormBreakerCurve(circuit.breaker_curve || "B");
    setFormPhases(circuit.phases || 1);
    setFormHasRcd(circuit.has_rcd !== false);
    setFormRcdGroup(circuit.rcd_group || "");
    setFormCableType(circuit.cable_type || "NYM-J 3x1.5");

    setEditingCircuit(circuit);
    setIsAddCircuitMode(false);
    setIsCircuitModalOpen(true);
  };

  // Save Circuit from Modal
  const handleSaveModalCircuit = () => {
    if (!formCode.trim()) {
      showNotification("Bitte Stromkreisnummer eingeben.", "error");
      return;
    }

    if (isAddCircuitMode) {
      const newCircuit: UVPlanCircuit = {
        id: "uvc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        circuit_code: formCode.trim(),
        description: formDescription.trim(),
        breaker_current: formBreakerCurrent,
        breaker_curve: formBreakerCurve,
        phases: formPhases,
        has_rcd: formHasRcd,
        rcd_group: formRcdGroup.trim() || undefined,
        cable_type: formCableType.trim() || undefined,
        source: "manual",
        modified: false,
        created_at: new Date().toISOString()
      };

      setActiveCircuits(prev => [...prev, newCircuit]);
      setHasUnsavedChanges(true);
      showNotification(`Stromkreis "${formCode}" manuell hinzugefügt!`, "success");
    } else if (editingCircuit) {
      setActiveCircuits(prev =>
        prev.map(c => {
          if (c.id === editingCircuit.id) {
            const hasChanged =
              c.circuit_code !== formCode.trim() ||
              c.description !== formDescription.trim() ||
              c.breaker_current !== formBreakerCurrent ||
              c.breaker_curve !== formBreakerCurve ||
              c.phases !== formPhases ||
              c.has_rcd !== formHasRcd ||
              c.cable_type !== formCableType.trim();

            return {
              ...c,
              circuit_code: formCode.trim(),
              description: formDescription.trim(),
              breaker_current: formBreakerCurrent,
              breaker_curve: formBreakerCurve,
              phases: formPhases,
              has_rcd: formHasRcd,
              rcd_group: formRcdGroup.trim() || undefined,
              cable_type: formCableType.trim() || undefined,
              modified: hasChanged ? true : c.modified
            };
          }
          return c;
        })
      );
      setHasUnsavedChanges(true);
      showNotification(`Stromkreis "${formCode}" aktualisiert!`, "success");
    }

    setIsCircuitModalOpen(false);
  };

  // Delete Circuit
  const handleDeleteCircuit = (id: string) => {
    setActiveCircuits(prev => prev.filter(c => c.id !== id));
    setHasUnsavedChanges(true);
    showNotification("Stromkreis entfernt.", "info");
  };

  // Duplicate Circuit
  const handleDuplicateCircuit = (circuit: UVPlanCircuit) => {
    const match = circuit.circuit_code.match(/^(.*?)(\d+)$/);
    let newCode = circuit.circuit_code + "_Kopie";
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10);
      const padded = num + 1 < 10 && match[2].startsWith("0") ? `0${num + 1}` : `${num + 1}`;
      newCode = `${prefix}${padded}`;
    }

    const duplicated: UVPlanCircuit = {
      ...circuit,
      id: "uvc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      circuit_code: newCode,
      description: circuit.description,
      source: "manual",
      modified: true,
      created_at: new Date().toISOString()
    };

    setActiveCircuits(prev => [...prev, duplicated]);
    setHasUnsavedChanges(true);
    showNotification(`Stromkreis als "${newCode}" dupliziert!`, "success");
  };

  // Filtered circuits
  const filteredCircuits = useMemo(() => {
    if (!searchQuery.trim()) return activeCircuits;
    const q = searchQuery.toLowerCase();
    return activeCircuits.filter(
      c =>
        c.circuit_code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        `${c.breaker_curve}${c.breaker_current}`.toLowerCase().includes(q) ||
        (c.cable_type && c.cable_type.toLowerCase().includes(q))
    );
  }, [activeCircuits, searchQuery]);

  return (
    <div className="min-h-screen bg-ui-bg text-ui-text p-6 md:p-10 flex flex-col space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-white/5">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-10 h-10 rounded-md bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
              <Zap className="w-5 h-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight uppercase">
              Stromkreise von UV-Plan
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl font-medium">
            Schaltpläne importieren, UV-Verteiler auf dem Plan platzieren und Stromkreise mit Farbcodierung verwalten.
          </p>
        </div>

        {/* Project & Floor Plan Selectors + Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Project Selector with Company Name */}
          <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-md px-3.5 py-2 shadow-xl">
            <FolderKanban className="w-4 h-4 text-blue-400 shrink-0" />
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer max-w-[200px] md:max-w-xs truncate"
            >
              {projects.length === 0 && <option value="">Keine Projekte</option>}
              {projects.map(p => {
                const label = [p.companies?.name, p.name].filter(Boolean).join(" – ");
                return (
                  <option key={p.id} value={p.id} className="bg-slate-950 text-white">
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Floor Plan (Splan) Selector with Building/Halle & Floor */}
          <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-md px-3.5 py-2 shadow-xl">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
            <select
              value={activePlanId}
              onChange={e => setActivePlanId(e.target.value)}
              className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer max-w-[220px] md:max-w-xs truncate"
            >
              {plans.length === 0 && <option value="">Keine Pläne im Projekt</option>}
              {plans.map(p => {
                const planLabel = [p.floors?.buildings?.name, p.floors?.name, p.name].filter(Boolean).join(" – ");
                return (
                  <option key={p.id} value={p.id} className="bg-slate-950 text-white">
                    {planLabel}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Export Vector PDF Button */}
          {activePlanId && (
            <button
              onClick={handleExportVectorPdf}
              disabled={isExportingPdf}
              className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 px-3.5 py-2 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/10 transition-all"
              title="Vectorplan als A0/Original PDF mit Verteilern exportieren"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Vectorplan PDF exportieren</span>
            </button>
          )}

          {/* View Mode Switcher */}
          <div className="flex bg-slate-900/80 border border-white/10 rounded-md p-1 shadow-xl">
            <button
              onClick={() => setViewMode("map")}
              className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                viewMode === "map"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Karte & Platzieren</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                viewMode === "table"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabelle</span>
            </button>
          </div>

          {/* Upload Button */}
          <label className={`shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer transition-all ${uploading ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}>
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analysiere...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>+ UV-PDF</span>
              </>
            )}
            <input
              type="file"
              accept="application/pdf"
              onChange={handlePdfUpload}
              className="hidden"
              disabled={uploading || !selectedProjectId}
            />
          </label>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lade UV-Pläne...</p>
        </div>
      ) : uvPlans.length === 0 ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-900/30 border border-dashed border-white/10 rounded-md p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
            <FileText className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-lg font-black text-white uppercase tracking-wider">Noch keine UV-Pläne importiert</h3>
            <p className="text-xs text-slate-400">
              Laden Sie ein oder mehrere Verteiler-Schaltpläne als PDF hoch. Die Anwendung erkennt automatisch Stromkreise, Sicherungsstärken und Bezeichnungen.
            </p>
          </div>
          <label className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-blue-600/30 cursor-pointer transition-all">
            <UploadCloud className="w-4 h-4" />
            <span>Ersten UV-Plan (PDF) hochladen</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handlePdfUpload}
              className="hidden"
              disabled={uploading || !selectedProjectId}
            />
          </label>
        </div>
      ) : (
        /* UV Plans Interface */
        <div className="flex flex-col space-y-6 flex-1">
          {/* UV Plans Selection Tabs with Colors */}
          <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 no-scrollbar border-b border-white/5">
            <div className="flex items-center gap-3">
              {uvPlans.map(plan => {
                const isSelected = plan.id === selectedUvPlanId;
                const count = isSelected ? activeCircuits.length : (plan.circuits?.length || 0);
                const uvColor = plan.color || "#2563eb";
                const isLocatedOnThisPlan = plan.location && plan.location.plan_id === activePlanId;

                return (
                  <button
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`px-4 py-2.5 rounded-md text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2.5 shrink-0 border ${
                      isSelected
                        ? "text-white shadow-lg shadow-black/40"
                        : "bg-slate-900/60 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white"
                    }`}
                    style={isSelected ? { backgroundColor: uvColor, borderColor: uvColor } : { borderLeftColor: uvColor, borderLeftWidth: 3 }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: isSelected ? "#ffffff" : uvColor }} />
                    <span>{plan.name}</span>
                    {isLocatedOnThisPlan && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/40 text-amber-300" title="Verteiler-Standort auf diesem Plan markiert">
                        ⚡
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                        isSelected ? "bg-black/30 text-white" : "bg-white/5 text-slate-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {activePlan && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setNewPlanName(activePlan.name);
                    setSelectedUvColor(activePlan.color || "#2563eb");
                    setIsRenameModalOpen(true);
                  }}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5"
                  title="UV-Plan Farbe & Name anpassen"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>UV Einstellungen</span>
                </button>
                <button
                  onClick={() => handleDeletePlan(activePlan.id, activePlan.name)}
                  className="bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5"
                  title="UV-Plan löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Löschen</span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MODE 1: MAP & DIRECT PLACEMENT */}
          {viewMode === "map" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 min-h-[75vh]">
              {/* Left Side: Interactive Floor Plan Map */}
              <div className="xl:col-span-8 flex flex-col h-[65vh] xl:h-auto bg-slate-950/40 rounded-md border border-white/5 shadow-2xl relative overflow-hidden">
                {/* Map Sub-Toolbar */}
                <div className="bg-slate-900/90 border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-[1000] relative">
                  <div className="flex items-center gap-3">
                    {/* Edit Mode Toggle Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditMode(prev => !prev);
                        if (!isEditMode) {
                          setIsPlacingOnMap(false);
                          setIsPlacingUvBoard(false);
                          setPlacingCircuit(null);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                        isEditMode
                          ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30"
                          : "bg-white/5 text-slate-400 hover:text-white border-white/10"
                      }`}
                      title={isEditMode ? "Edycja i przesuwanie włączone" : "Bearbeiten (przesuwanie markerów i rozdzielnicy)"}
                    >
                      <span>{isEditMode ? "🔓" : "🔒"}</span>
                      <span>{isEditMode ? "Edycja aktywna" : "Bearbeiten"}</span>
                    </button>

                    {/* Set UV Board Location on Map */}
                    {activePlan && (
                      <button
                        type="button"
                        onClick={handleStartPlacingUvBoard}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                          isPlacingUvBoard
                            ? "bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30 animate-pulse"
                            : "bg-white/5 text-amber-400 hover:text-white border-white/10"
                        }`}
                        title="Standort der Verteilerbox (Rozdzielnica) auf dem Plan markieren"
                      >
                        <span>⚡</span>
                        <span>{activePlan.location?.plan_id === activePlanId ? "UV-Standort ändern" : "UV auf Plan setzen"}</span>
                      </button>
                    )}

                    <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">
                      Marker: <strong className="text-white">{markers.length}</strong>
                    </span>
                  </div>

                  {/* Plan Details Breadcrumb */}
                  {activeFloorPlan && (
                    <div className="text-[11px] font-mono text-slate-300 font-bold flex items-center gap-1.5">
                      <span className="text-blue-400 font-black">
                        {[activeFloorPlan.floors?.buildings?.name, activeFloorPlan.floors?.name].filter(Boolean).join(" – ") || "Plan"}
                      </span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-200">{activeFloorPlan.name}</span>
                    </div>
                  )}

                  {/* Selected Marker Quick Action Bar */}
                  {selectedMarker && (
                    <div className="flex items-center gap-2 bg-slate-950/80 border border-white/10 px-2.5 py-1 rounded-md animate-fadeIn">
                      <span className="text-[10px] font-mono font-bold text-blue-400">
                        {selectedMarker.circuit_code}
                      </span>
                      <button
                        onClick={() => handleToggleMarkerOrientation(selectedMarker.id)}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
                        title="Marker 90° drehen"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteMarker(selectedMarker.id)}
                          className="p-1 rounded bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white"
                          title="Marker löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedMarker(null)}
                        className="p-1 rounded hover:bg-white/10 text-slate-400"
                        title="Auswahl aufheben"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {activePlanId ? (
                  <div className="flex-1 relative w-full h-full min-h-[500px]">
                    <StromkreiseMap
                      projectId={selectedProjectId}
                      planId={activePlanId}
                      token={token}
                      markers={markers}
                      selectedMarkerId={selectedMarker?.id || null}
                      selectedCircuitCode={placingCircuit?.circuit_code || selectedMarker?.circuit_code || null}
                      selectedPanelGroup={activePlan?.name || null}
                      onSelectMarker={(marker: StromkreisMarker) => {
                        setSelectedMarker(marker);
                        // Also sync placingCircuit if exists in active UV
                        const matching = activeCircuits.find(c => {
                          if (marker.metadata?.uv_circuit_id) {
                            return c.id === marker.metadata.uv_circuit_id;
                          }
                          const markerUvName = marker.panel_group || marker.metadata?.uv_name;
                          if (markerUvName && activePlan) {
                            return markerUvName.trim().toLowerCase() === activePlan.name.trim().toLowerCase() && c.circuit_code === marker.circuit_code;
                          }
                          return c.circuit_code === marker.circuit_code;
                        });
                        if (matching) {
                          setPlacingCircuit(matching);
                        }
                      }}
                      onMoveMarker={handleMoveMarker}
                      onAddMarker={handleMapClickAddMarker}
                      onToggleMarkerOrientation={handleToggleMarkerOrientation}
                      activeType={placingCircuit ? determineMarkerTypeAndShape(placingCircuit).type : "socket"}
                      activeShape={placingCircuit ? determineMarkerTypeAndShape(placingCircuit).shape : "circle"}
                      isAdmin={isAdmin}
                      isEditMode={isEditMode}
                      addMode={isPlacingOnMap || isPlacingUvBoard}
                      hideExecutionStatus={true}
                      uvBoards={uvBoardsOnActivePlan}
                      onMoveUvBoard={handleMoveUvBoard}
                    />

                    {/* Active UV Board Placement Banner */}
                    {isPlacingUvBoard && activePlan && (
                      <div className="absolute top-4 left-4 right-4 z-[1500] pointer-events-auto flex items-center justify-between gap-4 bg-amber-600/95 text-white backdrop-blur-md px-4 py-3 rounded-md shadow-2xl border border-amber-400/30">
                        <div className="flex items-center gap-3">
                          <span className="text-xl animate-bounce">⚡</span>
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider">
                              Klicken Sie auf den Plan, um den Standort für [{activePlan.name}] festzulegen:
                            </p>
                            <p className="text-xs font-bold text-amber-100 mt-0.5">
                              Haupt- / Unterverteiler Schrank
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setIsPlacingUvBoard(false)}
                          className="bg-black/40 hover:bg-black/60 text-white px-3.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Abbrechen
                        </button>
                      </div>
                    )}

                    {/* Active Circuit Placement Banner Overlay */}
                    {isPlacingOnMap && placingCircuit && (
                      <div className="absolute top-4 left-4 right-4 z-[1500] pointer-events-auto flex items-center justify-between gap-4 bg-blue-600/95 text-white backdrop-blur-md px-4 py-3 rounded-md shadow-2xl border border-blue-400/30">
                        <div className="flex items-center gap-3">
                          <MousePointer className="w-5 h-5 text-white shrink-0 animate-bounce" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-wider">
                                Wstawianie na plan (kliknij na rzucie):
                              </p>
                              <span className="bg-blue-800 text-blue-100 text-[10px] font-bold px-2 py-0.5 rounded">
                                Wielokrotne wstawianie
                              </span>
                            </div>
                            <p className="text-xs font-bold text-blue-100 mt-0.5">
                              [{placingCircuit.circuit_code}] {placingCircuit.breaker_curve}{placingCircuit.breaker_current}A – {placingCircuit.description || "Stromkreis"} ({placingCircuit.phases || 1}P) • Już na tym planie: <strong className="text-white">{getPlacedMarkerCount(placingCircuit.circuit_code, placingCircuit.id)}x</strong>
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={handleStopPlacingCircuit}
                          className="bg-black/40 hover:bg-black/60 text-white px-3.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-lg shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Fertig / Beenden</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                    <MapPin className="w-12 h-12 mb-3 opacity-30 text-emerald-400" />
                    <p className="text-sm font-bold text-slate-300">Kein Installationsplan ausgewählt</p>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      Wählen Sie oben einen Rzut/Plan aus dem Projekt, um Stromkreise aus diesem UV darauf zu setzen.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Side: UV Circuits Quick-List & Placement Triggers */}
              <div className="xl:col-span-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1 no-scrollbar">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-md p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: activePlan?.color || "#2563eb" }} />
                      <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-wider">
                          {activePlan?.name || "UV"} Stromkreise ({activeCircuits.length})
                        </h3>
                        <p className="text-[10px] text-slate-400">
                          Wählen Sie einen Stromkreis und setzen Sie ihn auf den Plan
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleOpenAddCircuit}
                      className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 p-2 rounded-md text-xs font-bold transition-all shadow-md"
                      title="Stromkreis manuell hinzufügen"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Stromkreis filtern..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Circuits list cards */}
                  <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1 no-scrollbar">
                    {filteredCircuits.length === 0 ? (
                      <p className="text-center py-8 text-xs text-slate-500 font-bold">
                        Keine Stromkreise im UV-Plan gefunden.
                      </p>
                    ) : (
                      filteredCircuits.map((c, idx) => {
                        const countPlaced = getPlacedMarkerCount(c.circuit_code, c.id);
                        const isPlaced = countPlaced > 0;
                        const isCurrentlyPlacing = isPlacingOnMap && placingCircuit?.id === c.id;
                        const isCircuitSelected = isCurrentlyPlacing || (selectedMarker && (
                          selectedMarker.metadata?.uv_circuit_id ? selectedMarker.metadata.uv_circuit_id === c.id :
                          (selectedMarker.circuit_code === c.circuit_code && (!selectedMarker.panel_group || selectedMarker.panel_group.trim().toLowerCase() === activePlan?.name.trim().toLowerCase()))
                        )) || (placingCircuit?.id === c.id);

                        return (
                          <div
                            key={c.id || idx}
                            onClick={() => {
                              if (placingCircuit?.id !== c.id) {
                                setSelectedMarker(null);
                                setPlacingCircuit(c);
                              }
                            }}
                            className={`p-3 rounded-md border transition-all flex flex-col gap-2 cursor-pointer ${
                              isCircuitSelected
                                ? "bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/50"
                                : isPlaced
                                ? "bg-white/[0.02] border-emerald-500/30 hover:border-emerald-500/60"
                                : "bg-white/[0.02] border-white/5 hover:border-white/20"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-slate-950 text-white font-mono font-black text-xs rounded border border-white/10">
                                  {c.circuit_code}
                                </span>
                                <span className="font-mono text-xs font-bold text-blue-400">
                                  {c.breaker_curve}{c.breaker_current}A
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  {c.phases === 3 ? "3P" : "1P"}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {isPlaced && (
                                  <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                    <Check className="w-3 h-3" />
                                    <span>{countPlaced}x auf Plan</span>
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleStartPlacingCircuit(c)}
                                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm ${
                                    isCurrentlyPlacing
                                      ? "bg-blue-600 text-white border border-blue-400 animate-pulse"
                                      : "bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30"
                                  }`}
                                  title="Auf Plan platzieren (mehrfach möglich)"
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span>{isCurrentlyPlacing ? "Aktiv..." : "Wstaw"}</span>
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-slate-300 font-medium truncate">
                              {c.description || <span className="text-slate-600 italic">Keine Bezeichnung</span>}
                            </p>

                            {/* Secondary actions */}
                            <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400">
                              <span className="font-mono text-[10px] text-slate-500 truncate max-w-[160px]">
                                {c.cable_type || (c.has_rcd ? "RCD ✓" : "Ohne RCD")}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleOpenEditCircuit(c)}
                                  className="text-slate-400 hover:text-white"
                                  title="Bearbeiten"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDuplicateCircuit(c)}
                                  className="text-slate-400 hover:text-white"
                                  title="Duplizieren"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: COMPREHENSIVE EDITABLE TABLE */}
          {viewMode === "table" && activePlan && (
            <div className="bg-slate-900/40 border border-white/5 rounded-md p-6 space-y-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: activePlan.color || "#2563eb" }} />
                  <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <span>{activePlan.name}</span>
                    <span className="text-xs font-bold text-slate-400">({activeCircuits.length} Stromkreise)</span>
                  </h2>
                  {activePlan.pdf_filename && (
                    <span className="text-[10px] font-bold text-slate-500 bg-white/5 px-2.5 py-1 rounded-md border border-white/5 truncate max-w-xs">
                      PDF: {activePlan.pdf_filename}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Stromkreis suchen..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <button
                    onClick={handleOpenAddCircuit}
                    className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 px-4 py-2 rounded-md text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-lg shadow-emerald-600/10"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Stromkreis hinzufügen</span>
                  </button>

                  {hasUnsavedChanges && (
                    <button
                      onClick={handleSaveCircuits}
                      disabled={isSaving}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-md text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 animate-pulse shrink-0"
                    >
                      {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Änderungen speichern</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Circuits Table */}
              <div className="border border-white/5 rounded-md overflow-hidden bg-slate-950/60 shadow-inner">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4 w-16">Nr.</th>
                        <th className="py-3 px-4 w-28">Status</th>
                        <th className="py-3 px-4 w-32">Sicherung</th>
                        <th className="py-3 px-4">Bezeichnung / Name</th>
                        <th className="py-3 px-4 w-24">Phasen</th>
                        <th className="py-3 px-4 w-24">RCD (FI)</th>
                        <th className="py-3 px-4 w-36">Kabeltyp</th>
                        <th className="py-3 px-4 w-44 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredCircuits.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500 font-bold">
                            Keine Stromkreise gefunden. Klicken Sie auf „+ Stromkreis hinzufügen“, um einen anzulegen.
                          </td>
                        </tr>
                      ) : (
                        filteredCircuits.map((circuit, idx) => {
                          const isModified = !!circuit.modified;
                          const isManual = circuit.source === "manual";
                          const countPlaced = getPlacedMarkerCount(circuit.circuit_code, circuit.id);

                          return (
                            <tr
                              key={circuit.id || idx}
                              className="hover:bg-white/[0.02] transition-colors group"
                            >
                              <td className="py-3 px-4 font-black text-white">
                                <span className="px-2 py-1 bg-white/5 rounded-md border border-white/5 text-xs font-mono">
                                  {circuit.circuit_code}
                                </span>
                              </td>

                              <td className="py-3 px-4">
                                {isManual ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    Manuell
                                  </span>
                                ) : isModified ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Geändert
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    Importiert
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-4">
                                <span className="font-mono font-bold text-blue-400">
                                  {circuit.breaker_curve}
                                  {circuit.breaker_current}A
                                </span>
                              </td>

                              <td className="py-3 px-4 font-medium text-slate-200">
                                {circuit.description || <span className="text-slate-600 italic">Keine Bezeichnung</span>}
                              </td>

                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    circuit.phases === 3
                                      ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {circuit.phases === 3 ? "3-phasig" : "1-phasig"}
                                </span>
                              </td>

                              <td className="py-3 px-4">
                                {circuit.has_rcd ? (
                                  <span className="flex items-center gap-1 text-emerald-400 font-bold text-xs">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Ja</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-bold text-xs">Nein</span>
                                )}
                              </td>

                              <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                                {circuit.cable_type || "—"}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => handleStartPlacingCircuit(circuit)}
                                    className="px-2 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 text-[10px] font-black uppercase transition-all flex items-center gap-1"
                                    title="Auf Installationsplan setzen"
                                  >
                                    <MapPin className="w-3 h-3" />
                                    <span>Wstaw {countPlaced > 0 ? `(${countPlaced}x)` : ""}</span>
                                  </button>
                                  <button
                                    onClick={() => handleOpenEditCircuit(circuit)}
                                    className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-all"
                                    title="Bearbeiten"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDuplicateCircuit(circuit)}
                                    className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-all"
                                    title="Duplizieren"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCircuit(circuit.id)}
                                    className="p-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 border border-rose-500/20 transition-all"
                                    title="Löschen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Add / Edit Circuit */}
      <AnimatePresence>
        {isCircuitModalOpen && (
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-xl p-6 w-full max-w-lg space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {isAddCircuitMode ? "Stromkreis manuell hinzufügen" : `Stromkreis ${formCode} bearbeiten`}
                </h3>
                <button
                  onClick={() => setIsCircuitModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Circuit Code */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    Stromkreisnummer / Code
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="z.B. 01, 1F1.1"
                    className="w-full bg-slate-950 border border-white/10 rounded-md px-3 py-2 text-xs text-white font-bold outline-none focus:border-blue-500"
                  />
                </div>

                {/* Breaker Current & Curve */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    Absicherung (Kurve & Strom)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formBreakerCurve}
                      onChange={e => setFormBreakerCurve(e.target.value)}
                      className="bg-slate-950 border border-white/10 rounded-md px-3 py-2 text-xs text-white font-bold outline-none"
                    >
                      {["B", "C", "D", "K", "Z", "gG"].map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formBreakerCurrent}
                      onChange={e => setFormBreakerCurrent(Number(e.target.value))}
                      className="flex-1 bg-slate-950 border border-white/10 rounded-md px-3 py-2 text-xs text-white font-bold outline-none"
                    >
                      {[6, 10, 13, 16, 20, 25, 32, 40, 50, 63].map(curr => (
                        <option key={curr} value={curr}>
                          {curr}A
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    Bezeichnung / Name
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="z.B. Steckdosen Küche, Licht Flur"
                    className="w-full bg-slate-950 border border-white/10 rounded-md px-3 py-2 text-xs text-white font-bold outline-none focus:border-blue-500"
                  />
                </div>

                {/* Phases */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    Phasen
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormPhases(1)}
                      className={`flex-1 py-2 rounded-md text-xs font-bold border transition-all ${
                        formPhases === 1
                          ? "bg-blue-600 text-white border-blue-500 shadow-md"
                          : "bg-slate-950 text-slate-400 border-white/10"
                      }`}
                    >
                      1-phasig (230V)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormPhases(3)}
                      className={`flex-1 py-2 rounded-md text-xs font-bold border transition-all ${
                        formPhases === 3
                          ? "bg-purple-600 text-white border-purple-500 shadow-md"
                          : "bg-slate-950 text-slate-400 border-white/10"
                      }`}
                    >
                      3-phasig (400V)
                    </button>
                  </div>
                </div>

                {/* RCD Toggle */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    FI-Schutz (RCD)
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormHasRcd(!formHasRcd)}
                    className={`w-full py-2 rounded-md text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                      formHasRcd
                        ? "bg-emerald-600 text-white border-emerald-500 shadow-md"
                        : "bg-slate-950 text-slate-400 border-white/10"
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{formHasRcd ? "RCD Geschützt" : "Kein RCD"}</span>
                  </button>
                </div>

                {/* Cable Type */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    Kabeltyp (optional)
                  </label>
                  <input
                    type="text"
                    value={formCableType}
                    onChange={e => setFormCableType(e.target.value)}
                    placeholder="z.B. NYM-J 3x1.5, NYM-J 5x2.5"
                    className="w-full bg-slate-950 border border-white/10 rounded-md px-3 py-2 text-xs text-white font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCircuitModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-md text-xs font-bold transition-all"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleSaveModalCircuit}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all"
                >
                  Übernehmen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Duplicate UV Plan Detected */}
      <AnimatePresence>
        {duplicatePrompt.isOpen && (
          <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-amber-500/30 rounded-xl p-6 w-full max-w-md space-y-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-amber-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  UV-Plan existiert bereits
                </h3>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Für <strong className="text-white">„{duplicatePrompt.detectedName}“</strong> existieren im Projekt bereits Stromkreise.
                Wie möchten Sie fortfahren?
              </p>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleUpdateExistingUvPlan}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 text-left px-4"
                >
                  ✓ Bestehende Stromkreise aktualisieren / zusammenführen
                  <span className="block text-[10px] font-normal text-blue-200 mt-0.5">
                    (Manuell hinzugefügte oder geänderte Stromkreise bleiben erhalten)
                  </span>
                </button>

                <button
                  onClick={handleImportAsNewPlan}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-200 rounded-md text-xs font-black uppercase tracking-wider transition-all border border-white/10 text-left px-4"
                >
                  + Als neuen, separaten UV importieren
                  <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                    (Speichert unter neuem Namen)
                  </span>
                </button>

                <button
                  onClick={() =>
                    setDuplicatePrompt({ isOpen: false, detectedName: "", existingPlan: null, parsedFuses: [], fileName: "" })
                  }
                  className="w-full py-2.5 bg-transparent hover:bg-white/5 text-slate-400 hover:text-white rounded-md text-xs font-bold transition-all text-center"
                >
                  Abbrechen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: UV Plan Settings (Name & Color) */}
      <AnimatePresence>
        {isRenameModalOpen && (
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-xl p-6 w-full max-w-sm space-y-5 shadow-2xl"
            >
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                UV-Plan Einstellungen
              </h3>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Name des UV-Plans / Rozdzielnicy
                </label>
                <input
                  type="text"
                  value={newPlanName}
                  onChange={e => setNewPlanName(e.target.value)}
                  placeholder="z.B. UV EG, UV Technik, UV Halle 3"
                  className="w-full bg-slate-950 border border-white/10 rounded-md px-3 py-2.5 text-xs text-white font-bold outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Farbe für diesen UV-Verteiler
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {UV_COLOR_PALETTE.map(col => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setSelectedUvColor(col)}
                      className={`w-7 h-7 rounded-full transition-all border-2 ${
                        selectedUvColor === col ? "border-white scale-110 shadow-lg shadow-white/30" : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
                <button
                  onClick={() => setIsRenameModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-md text-xs font-bold"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSavePlanSettings}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20"
                >
                  Speichern
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
