"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNotification } from "@/contexts/NotificationContext";
import { apiGet, apiPost, apiPatch, apiDelete, apiCall, getToken, getApiUrl } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { pdf } from "@react-pdf/renderer";
import StromkreiseTablePdf from "./StromkreiseTablePdf";
import StromkreiseFIStructPdf from "./StromkreiseFIStructPdf";
import StromkreiseEdvPdf from "./StromkreiseEdvPdf";
import {
  Zap, Layers, FileDown, Trash2, X, CheckCircle2, AlertTriangle,
  Database, RefreshCw, UploadCloud, Info, Check, Plus, MousePointer,
  Copy, ChevronLeft, ChevronRight
} from "lucide-react";
import type { UVPlan } from "@/types/uvPlans";

const StromkreiseMap = dynamic(
  () => import("@/components/StromkreiseMap"),
  { ssr: false }
) as any;

interface StromkreisMarker {
  id: string;
  project_id: string;
  plan_id: string;
  circuit_code: string;
  panel_group: string | null;
  circuit_number: number | null;
  short_label: string;
  full_name: string;
  type: string;
  phase: number;
  breaker_current: number;
  breaker_curve: string;
  has_rcd: boolean;
  rcd_group: string | null;
  rcd_current: number | null;
  rcd_ma: number | null;
  switch_group: string | null;
  marker_shape: string;
  x_norm: number;
  y_norm: number;
  z_index: number;
  metadata: any;
}

// Helper to get type label from type value
function getTypeLabel(typeVal: string, t: any): string {
  const map: Record<string, { key: string, def: string }> = {
    socket: { key: "typeSocket", def: "Socket" },
    light: { key: "typeLight", def: "Light" },
    edv: { key: "typeEdv", def: "EDV" },
    cee: { key: "typeCee", def: "CEE" },
    special: { key: "typeSpecial", def: "Special" },
    reserve: { key: "typeReserve", def: "Reserve" },
    text: { key: "typeText", def: "Text" },
    line: { key: "typeLine", def: "Line" },
    arrow: { key: "typeArrow", def: "Arrow" },
    sym_socket: { key: "typeSymSocket", def: "Gniazdo (Symbol)" },
    sym_cee16: { key: "typeSymCee16", def: "CEE 16A (Symbol)" },
    sym_cee32: { key: "typeSymCee32", def: "CEE 32A (Symbol)" },
  };
  const item = map[typeVal];
  if (!item) return typeVal;
  return t("stromkreise", item.key as any, item.def);
}

export function getSubCables(code: string): string[] {
  if (!code) return [];
  if (!code.includes("/")) return [code];

  // e.g. "P2.1/2" -> ["P2.1", "P2.2"]
  // e.g. "UV1.5/6/7" -> ["UV1.5", "UV1.6", "UV1.7"]
  const parts = code.split("/");
  const base = parts[0]; // e.g. "P2.1"
  const res = [base];

  // Find prefix (everything up to the last digit sequence)
  const match = base.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1]; // e.g. "P2."
    for (let i = 1; i < parts.length; i++) {
      res.push(prefix + parts[i]);
    }
  } else {
    for (let i = 1; i < parts.length; i++) {
      res.push(parts[i]);
    }
  }
  return res;
}

export default function StromkreiseClient() {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const [token, setToken] = useState<string | null>(null);

  // Selection States
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [activePlanId, setActivePlanId] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Favorite Plans State from localStorage
  const [favoritePlans, setFavoritePlans] = useState<Array<{ id: string; name: string; projectName?: string }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("et4u_favorite_plans");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const favPlansRef = useRef<HTMLDivElement>(null);
  const scrollFavPlans = (offset: number) => {
    favPlansRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  const toggleFavoritePlan = (planId: string, planName: string, projName?: string) => {
    setFavoritePlans((prev) => {
      const exists = prev.some((f) => f.id === planId);
      let next;
      if (exists) {
        next = prev.filter((f) => f.id !== planId);
      } else {
        next = [...prev, { id: planId, name: planName, projectName: projName || "" }];
      }
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("et4u_favorite_plans", JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  const handleSelectFavoritePlan = async (fav: { id: string; name: string; projectName?: string }) => {
    if (plans.some((p) => p.id === fav.id)) {
      setActivePlanId(fav.id);
      return;
    }
    try {
      const res = await apiGet<any>(`/api/plan?id=${fav.id}`);
      const plan = res?.data || res;
      if (plan?.project_id) {
        setProjectId(plan.project_id);
        if (typeof window !== "undefined") {
          localStorage.setItem("et4u_active_project_id", plan.project_id);
          localStorage.setItem("selectedProjectId", plan.project_id);
        }
        const plansRes = await apiGet<any[]>(`/api/plans?projectId=${plan.project_id}&limit=100`);
        const ps = (plansRes as any)?.data || plansRes || [];
        setPlans(ps);
        setActivePlanId(fav.id);
      }
    } catch {
      setActivePlanId(fav.id);
    }
  };

  // Markers State
  const [markers, setMarkers] = useState<StromkreisMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<StromkreisMarker | null>(null);

  // Sequence Base State
  const [sequenceBasePlanId, setSequenceBasePlanId] = useState<string>("current");
  const [baseMarkersEdv, setBaseMarkersEdv] = useState<StromkreisMarker[]>([]);

  useEffect(() => {
    if (sequenceBasePlanId === "current") {
      setBaseMarkersEdv(markers);
    } else if (sequenceBasePlanId === "all") {
      apiGet<any>(`/api/stromkreise?projectId=${projectId}`).then(res => setBaseMarkersEdv(res?.data || res || []));
    } else if (sequenceBasePlanId) {
      apiGet<any>(`/api/stromkreise?projectId=${projectId}&planId=${sequenceBasePlanId}`).then(res => setBaseMarkersEdv(res?.data || res || []));
    }
  }, [sequenceBasePlanId, markers, projectId]);

  const [baseMarkersStrom, setBaseMarkersStrom] = useState<StromkreisMarker[]>([]);

  useEffect(() => {
    if (sequenceBasePlanId === "current") {
      setBaseMarkersStrom(markers);
    } else if (sequenceBasePlanId === "all") {
      apiGet<any>(`/api/stromkreise?projectId=${projectId}`).then(res => setBaseMarkersStrom(res?.data || res || []));
    } else if (sequenceBasePlanId) {
      apiGet<any>(`/api/stromkreise?projectId=${projectId}&planId=${sequenceBasePlanId}`).then(res => setBaseMarkersStrom(res?.data || res || []));
    }
  }, [sequenceBasePlanId, markers, projectId]);

  // Add mode: when true, next click on map places a new marker
  const [addMode, setAddMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [tempCoordinates, setTempCoordinates] = useState<{ x: number, y: number } | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [debugPdf, setDebugPdf] = useState(false);

  // PDF Export States
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingTable, setIsExportingTable] = useState(false);
  const [isExportingFI, setIsExportingFI] = useState(false);
  const [isExportingEdv, setIsExportingEdv] = useState(false);
  const [isTriggeringAi, setIsTriggeringAi] = useState(false);

  // Schematic Upload States
  const [uploading, setUploading] = useState(false);
  const [parsedProposals, setParsedProposals] = useState<any[]>([]);

  // Active Placement Configuration
  const [activeType, setActiveType] = useState("socket");
  const [activeShape, setActiveShape] = useState("triangle");

  // Form Fields for Editing
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editShortLabel, setEditShortLabel] = useState("");
  const [editType, setEditType] = useState("socket");
  const [editShape, setEditShape] = useState("triangle");
  const [editPhase, setEditPhase] = useState(1);
  const [editBreakerCurrent, setEditBreakerCurrent] = useState(16);
  const [editBreakerCurve, setEditBreakerCurve] = useState("B");
  const [editHasRcd, setEditHasRcd] = useState(false);
  const [editRcdGroup, setEditRcdGroup] = useState("");
  const [editRcdCurrent, setEditRcdCurrent] = useState(40);
  const [editRcdMa, setEditRcdMa] = useState(30);
  const [cableTypes, setCableTypes] = useState<string[]>([]);

  const formatSicherung = (curve: string, phase: number, current: number) => {
    const c = (curve || "").toUpperCase();
    const p = phase || 1;
    const a = current || "";
    if (c === "B") return `MBN${p}${a}`;
    if (c === "C") return `MCN${p}${a}`;
    return `${c}${a}`;
  };

  const [editKabeltyp, setEditKabeltyp] = useState("");
  const [editSwitchGroup, setEditSwitchGroup] = useState("");
  const [editPanelGroup, setEditPanelGroup] = useState("");
  const [editUvStatus, setEditUvStatus] = useState("");
  const [editCircuitNumber, setEditCircuitNumber] = useState(1);
  const [editOrientation, setEditOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [editRotation, setEditRotation] = useState<number>(0);
  const [editSyncAllDuplicates, setEditSyncAllDuplicates] = useState<boolean>(false);
  const [lastCreatedByType, setLastCreatedByType] = useState<Record<string, any>>({});

  // EDV custom states
  const [edvPatchfeld, setEdvPatchfeld] = useState("1");
  const [edvPort1, setEdvPort1] = useState("1");
  const [edvPort2, setEdvPort2] = useState("");

  // Snapshots
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [snapshotName, setSnapshotName] = useState("");
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

  // Copy Markers from another Plan
  const [isCopyPlanModalOpen, setIsCopyPlanModalOpen] = useState(false);
  const [selectedSourcePlanId, setSelectedSourcePlanId] = useState("");
  const [copyPlanMode, setCopyPlanMode] = useState<"replace" | "append">("replace");
  const [isCopyingPlanMarkers, setIsCopyingPlanMarkers] = useState(false);
  const [planMarkersCountMap, setPlanMarkersCountMap] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);



  // UV Plan selection source in Splan
  const [creationSource, setCreationSource] = useState<"manual" | "uv_plan">("manual");
  const [projectUvPlans, setProjectUvPlans] = useState<UVPlan[]>([]);
  const [selectedUvPlanId, setSelectedUvPlanId] = useState<string>("");
  const [selectedUvCircuitId, setSelectedUvCircuitId] = useState<string>("");

  useEffect(() => {
    if (projectId) {
      apiGet<any>(`/api/uv-plans?projectId=${projectId}`).then(res => {
        const plans = res?.data || res || [];
        setProjectUvPlans(Array.isArray(plans) ? plans : []);
      }).catch(() => {});
    }
  }, [projectId]);

  const handleSelectUvCircuit = (circuitId: string) => {
    setSelectedUvCircuitId(circuitId);
    if (!circuitId) return;

    const currentPlan = projectUvPlans.find(p => p.id === selectedUvPlanId);
    const c = currentPlan?.circuits?.find(circ => circ.id === circuitId);
    if (!c) return;

    setEditCode(c.circuit_code || "");
    setEditName(c.description || "");
    setEditShortLabel(c.circuit_code.split(".").pop() || c.circuit_code);
    setEditBreakerCurrent(c.breaker_current || 16);
    setEditBreakerCurve(c.breaker_curve || "B");
    setEditPhase(c.phases || 1);
    setEditHasRcd(c.has_rcd !== false);
    if (c.rcd_group) setEditRcdGroup(c.rcd_group);
    if (c.cable_type) setEditKabeltyp(c.cable_type);
    if (currentPlan?.name) setEditUvStatus(currentPlan.name);

    // Smart determine marker type from description/phases if user hasn't selected a special tool
    const desc = (c.description || "").toLowerCase();
    const code = (c.circuit_code || "").toLowerCase();
    if (desc.includes("licht") || desc.includes("beleuchtung") || desc.includes("leucht") || code.startsWith("l")) {
      setEditType("light");
      setEditShape("triangle");
    } else if (desc.includes("cee") || code.includes("cee") || (c.phases === 3 && (c.breaker_current || 16) >= 16 && (desc.includes("kraft") || desc.includes("herd") || desc.includes("wallbox")))) {
      setEditType("cee");
      setEditShape("circle");
    } else if (desc.includes("edv") || desc.includes("netzwerk") || desc.includes("lan") || desc.includes("patch")) {
      setEditType("edv");
      setEditShape("square");
    } else {
      setEditType("socket");
      setEditShape("triangle");
    }

    showNotification(`Daten aus ${currentPlan?.name} (${c.circuit_code}) übernommen!`, "success");
  };

  // Drawing tools metadata
  const [editMetadata, setEditMetadata] = useState<any>({});

  const loadSnapshots = useCallback(async () => {
    if (!activePlanId || !projectId) return;
    setIsLoadingSnapshots(true);
    try {
        const res = await apiGet<any>(`/api/stromkreise/snapshots?projectId=${projectId}&planId=${activePlanId}&t=${Date.now()}`);
        setSnapshots(res || []);
    } catch (e) {
        showNotification("Failed to load snapshots", "error");
    } finally {
        setIsLoadingSnapshots(false);
    }
  }, [activePlanId, projectId, token]);

  useEffect(() => {
    if (activePlanId) loadSnapshots();
  }, [activePlanId, loadSnapshots]);

  const handleCreateSnapshot = async (name: string) => {
    if (!name.trim()) return;
    try {
        const res = await fetch("/api/stromkreise/snapshots", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ projectId, planId: activePlanId, name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Failed");
        showNotification("Zapisano pomyślnie", "success");
        setIsSnapshotModalOpen(false);
        setSnapshotName("");
        loadSnapshots();
    } catch (e: any) {
        showNotification(e.message, "error");
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!confirm("Odzyskanie przywróci stare markery i stworzy auto-backup obecnych. Kontynuować?")) return;
    try {
        const res = await fetch("/api/stromkreise/load-snapshot", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ snapshotId, projectId, planId: activePlanId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Failed");
        showNotification("Przywrócono zapisaną wersję i stworzono kopię zapasową (Backup)", "success");
        loadMarkers();
        loadSnapshots();
    } catch (e: any) {
        showNotification(e.message, "error");
    }
  };

  const handleOpenCopyPlanModal = async () => {
    setIsCopyPlanModalOpen(true);
    if (!projectId) return;
    setIsLoadingCounts(true);
    try {
      const res = await apiGet<any[]>(`/api/stromkreise?projectId=${projectId}`);
      const list = (res as any)?.data || res || [];
      const counts: Record<string, number> = {};
      list.forEach((m: any) => {
        if (m.plan_id) {
          counts[m.plan_id] = (counts[m.plan_id] || 0) + 1;
        }
      });
      setPlanMarkersCountMap(counts);
    } catch {
      // ignore
    } finally {
      setIsLoadingCounts(false);
    }
  };

  const handleExecuteCopyMarkers = async () => {
    if (!selectedSourcePlanId || !activePlanId || !projectId) return;
    setIsCopyingPlanMarkers(true);
    try {
      const res = await fetch("/api/stromkreise/copy-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sourcePlanId: selectedSourcePlanId,
          targetPlanId: activePlanId,
          projectId,
          mode: copyPlanMode
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Błąd podczas kopiowania markerów");
      }
      showNotification(
        `Pomyślnie skopiowano ${data.data?.copiedCount || 0} markerów. Utworzono automatyczny Backup: "${data.data?.backupName}".`,
        "success"
      );
      setIsCopyPlanModalOpen(false);
      setSelectedSourcePlanId("");
      await loadMarkers();
      await loadSnapshots();
    } catch (e: any) {
      showNotification(e.message || "Nie udało się skopiować markerów", "error");
    } finally {
      setIsCopyingPlanMarkers(false);
    }
  };

  // Load Session and Role
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
            setIsAdmin(profile?.role === "ADMIN");
          });
      }
    });
  }, []);

  const handleSelectProject = (newId: string) => {
    setProjectId(newId);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("et4u_active_project_id", newId);
        localStorage.setItem("selectedProjectId", newId);
        const pObj = projects.find((p: any) => p.id === newId);
        if (pObj) localStorage.setItem("et4u_active_project_name", pObj.name);
      } catch {}
    }
  };

  // Load Projects & Companies
  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiGet<any[]>("/api/projects").catch(() => []),
      apiGet<any[]>("/api/companies").catch(() => [])
    ]).then(async ([ps, comps]) => {
      setProjects(ps || []);
      setCompanies(comps || []);

      let targetProjectId = "";
      let targetPlanId = "";

      // Check if first favorite plan belongs to one of user's projects
      if (favoritePlans.length > 0) {
        try {
          const firstFav = favoritePlans[0];
          const planRes = await apiGet<any>(`/api/plan?id=${firstFav.id}`);
          const planData = planRes?.data || planRes;
          if (planData?.project_id && (ps || []).some((p: any) => p.id === planData.project_id)) {
            targetProjectId = planData.project_id;
            targetPlanId = firstFav.id;
          }
        } catch {}
      }

      if (!targetProjectId) {
        const saved = typeof window !== "undefined"
          ? (localStorage.getItem("et4u_active_project_id") || localStorage.getItem("selectedProjectId"))
          : null;
        const found = (ps || []).find((p: any) => p.id === saved);
        targetProjectId = found?.id || ps?.[0]?.id || "";
      }

      setProjectId(targetProjectId);
      if (targetPlanId) {
        setActivePlanId(targetPlanId);
      }
      if (targetProjectId && typeof window !== "undefined") {
        try {
          localStorage.setItem("et4u_active_project_id", targetProjectId);
          const pObj = (ps || []).find((p: any) => p.id === targetProjectId);
          if (pObj) localStorage.setItem("et4u_active_project_name", pObj.name);
        } catch {}
      }
    });
  }, [token]);

  // Load Cable Types
  useEffect(() => {
    if (!projectId || !token) return;
    Promise.all([
      apiGet<any[]>(`/api/cables?projectId=${projectId}`).catch(() => []),
      apiGet<any[]>(`/api/trommels?projectId=${projectId}`).catch(() => []),
      apiGet<string[]>(`/api/cable-types?projectId=${projectId}`).catch(() => [])
    ]).then(([cRes, tRes, globalRes]) => {
      const types = new Set<string>();
      ((cRes as any)?.data || cRes || []).forEach((c: any) => { if (c.cable_type) types.add(c.cable_type); });
      ((tRes as any)?.data || tRes || []).forEach((t: any) => { if (t.cable_type) types.add(t.cable_type); });
      ((globalRes as any)?.data || globalRes || []).forEach((t: string) => { if (t) types.add(t); });
      setCableTypes(Array.from(types).sort());
    });
  }, [projectId, token]);

  // Load Plans on Project Change
  useEffect(() => {
    if (!projectId || !token) return;
    apiGet<any[]>(`/api/plans?projectId=${projectId}&limit=100`).then(res => {
      const ps = (res as any)?.data || res || [];
      setPlans(ps);
      if (ps.length > 0) {
        setActivePlanId(prev => {
          if (prev && ps.some((p: any) => p.id === prev)) return prev;
          const favInPs = favoritePlans.find(fav => ps.some((p: any) => p.id === fav.id));
          return favInPs ? favInPs.id : ps[0].id;
        });
      } else {
        setActivePlanId("");
        setMarkers([]);
      }
    });
  }, [projectId, token, favoritePlans]);

  // Load Markers on Plan Change
  const loadMarkers = useCallback(async () => {
    if (!activePlanId || !token) return;
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/stromkreise?projectId=${projectId}&planId=${activePlanId}`);
      
      const rawList: any[] = Array.isArray(res) ? res : (res?.data || []);
      // Normalize markers that use metadata for real type (lines and arrows)
      const normalizedData = (rawList || []).map((m: any) => {
        if (m.metadata?.realType) {
          return { ...m, type: m.metadata.realType, marker_shape: m.metadata.realType };
        }
        return m;
      });
      
      setMarkers(normalizedData);
    } catch (e) {
      console.error("[Stromkreise] loadMarkers error:", e);
    } finally {
      setLoading(false);
    }
  }, [activePlanId, projectId, token]);

  useEffect(() => {
    loadMarkers();
    setSelectedMarker(null);
    setAddMode(false);
    setParsedProposals([]);
    setLastCreatedByType({});
  }, [activePlanId, loadMarkers]);

  const naturalSort = (a: string, b: string) => {
    const splitA = a.match(/([a-zA-Z]+|[0-9]+)/g) || [];
    const splitB = b.match(/([a-zA-Z]+|[0-9]+)/g) || [];
    for (let i = 0; i < Math.min(splitA.length, splitB.length); i++) {
      const partA = splitA[i];
      const partB = splitB[i];
      const isNumA = /^[0-9]+$/.test(partA);
      const isNumB = /^[0-9]+$/.test(partB);
      if (isNumA && isNumB) {
        const diff = parseInt(partA, 10) - parseInt(partB, 10);
        if (diff !== 0) return diff;
      } else {
        const comp = partA.localeCompare(partB, undefined, { sensitivity: 'base' });
        if (comp !== 0) return comp;
      }
    }
    return splitA.length - splitB.length;
  };

  const uniqueCircuits = useMemo(() => {
    const map = new Map<string, any>();
    markers.forEach(m => {
      if (m.circuit_code && !map.has(m.circuit_code)) {
        map.set(m.circuit_code, m);
      }
    });
    return Array.from(map.values()).sort((a, b) => naturalSort(a.circuit_code, b.circuit_code));
  }, [markers]);

  const handleDuplicateSelect = (code: string) => {
    if (!code) return;
    const source = markers.find(m => m.circuit_code === code);
    if (!source) return;
    setEditCode(source.circuit_code || "");
    setEditName(source.full_name || "");
    setEditShortLabel(source.short_label || "");
    setEditType(source.type || "socket");
    setEditShape(source.marker_shape || "circle");
    setEditPhase(source.phase || 1);
    setEditBreakerCurrent(source.breaker_current || 16);
    setEditBreakerCurve(source.breaker_curve || "B");
    setEditHasRcd(!!source.has_rcd);
    setEditRcdGroup(source.rcd_group || "");
    setEditRcdCurrent(source.rcd_current || 40);
    setEditRcdMa(source.rcd_ma || 30);
    setEditSwitchGroup(source.switch_group || "");
    setEditPanelGroup(source.panel_group || "");
    setEditKabeltyp(source.metadata?.kabeltyp || "");
    setEditUvStatus(source.metadata?.uv_status || "");

    if (source.type === "edv") {
      const match = source.circuit_code.match(/^P([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/);
      if (match) {
        setEdvPatchfeld(match[1]);
        setEdvPort1(match[2]);
        setEdvPort2(match[3] || "");
      }
    }

    setEditOrientation(source.metadata?.orientation || "horizontal");

    showNotification(t("stromkreise", "duplicatedOk" as any, `Copied data from circuit {code}!`).replace("{code}", code), "success");
  };

  // Sync Form Fields when selected marker changes
  useEffect(() => {
    if (selectedMarker) {
      setEditSyncAllDuplicates(false);
      setEditCode(selectedMarker.circuit_code);
      setEditName(selectedMarker.full_name);
      setEditShortLabel(selectedMarker.short_label);
      setEditType(selectedMarker.type);
      setEditShape(selectedMarker.marker_shape);
      setEditPhase(selectedMarker.phase);
      setEditBreakerCurrent(selectedMarker.breaker_current);
      setEditBreakerCurve(selectedMarker.breaker_curve);
      setEditHasRcd(selectedMarker.has_rcd);
      setEditRcdGroup(selectedMarker.rcd_group || "");
      setEditRcdCurrent(selectedMarker.rcd_current || 40);
      setEditRcdMa(selectedMarker.rcd_ma || 30);
      setEditKabeltyp(selectedMarker.metadata?.kabeltyp || "");
      setEditSwitchGroup(selectedMarker.switch_group || "");
      setEditPanelGroup(selectedMarker.panel_group || "");
      setEditUvStatus(selectedMarker.metadata?.uv_status || "");
      setEditCircuitNumber(selectedMarker.circuit_number || 1);
      setAddMode(false); // Exit add mode when editing
      setEditOrientation(selectedMarker.metadata?.orientation || "horizontal");
      setEditRotation(selectedMarker.metadata?.rotation || (selectedMarker.metadata?.orientation === "vertical" ? 270 : 0));

      if (selectedMarker.type === "edv") {
        const match = selectedMarker.circuit_code.match(/^P([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/);
        if (match) {
          setEdvPatchfeld(match[1]);
          setEdvPort1(match[2]);
          setEdvPort2(match[3] || "");
        } else {
          setEdvPatchfeld("1");
          setEdvPort1(selectedMarker.short_label || "1");
          setEdvPort2("");
        }
      }
    }
  }, [selectedMarker]);

  // Auto-format EDV code and short label
  useEffect(() => {
    if (editType === "edv") {
      const port1 = edvPort1.trim();
      const port2 = edvPort2.trim();
      const patchfeld = edvPatchfeld.trim();
      if (port1) {
        const code = port2 ? `P${patchfeld}.${port1}/${port2}` : `P${patchfeld}.${port1}`;
        const label = port2 ? `${port1}/${port2}` : port1;
        setEditCode(code);
        setEditShortLabel(label);
      }
    }
  }, [editType, edvPatchfeld, edvPort1, edvPort2]);

  // Delete Marker
  const handleDeleteMarker = useCallback(async (id: string) => {
    if (!isAdmin) {
      showNotification("Tylko administrator może usuwać markery obwodów.", "error");
      return;
    }
    if (!window.confirm(t("stromkreise", "confirmDelete" as any, "Delete this circuit marker?"))) return;

    const cleanId = id.startsWith("ai-pred-") ? id.replace("ai-pred-", "") : id;

    // Optimistically purge from local state immediately for instant UI response
    setSelectedMarker(null);
    setMarkers(prev => prev.filter(m => m.id !== id && m.id !== cleanId));

    try {
      await apiDelete(`/api/stromkreise?id=${cleanId}`);
      showNotification(t("stromkreise", "deleteSuccess" as any, "Deleted successfully!"), "success");
      await loadMarkers();
    } catch (e: any) {
      showNotification(e.message || "Error deleting marker", "error");
      await loadMarkers();
    }
  }, [isAdmin, t, loadMarkers, showNotification]);

  // Keyboard Shortcuts: Ctrl+C to Copy and Ctrl+V to Paste Marker
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Escape key should work everywhere (even when focused in inputs, map, or marker popups)
      if (e.key === "Escape" || e.key === "Esc") {
        if (selectedMarker || isCreating || addMode) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedMarker(null);
          setIsCreating(false);
          setTempCoordinates(null);
          setAddMode(false);
          setIsDuplicating(false);
          return;
        }
      }

      // Avoid intercepting copy/paste inside input fields/textarea
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Check for Delete / Backspace key
      if (e.key === "Delete" || e.key === "Del" || e.key === "Backspace") {
        if (selectedMarker && isAdmin) {
          e.preventDefault();
          handleDeleteMarker(selectedMarker.id);
        }
      }

      // Check for Ctrl+C (or Cmd+C on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (selectedMarker) {
          e.preventDefault();
          
          setEditCode(selectedMarker.circuit_code);
          setEditName(selectedMarker.full_name);
          setEditShortLabel(selectedMarker.short_label);
          setEditType(selectedMarker.type);
          setEditShape(selectedMarker.marker_shape);
          setEditPhase(selectedMarker.phase);
          setEditBreakerCurrent(selectedMarker.breaker_current);
          setEditBreakerCurve(selectedMarker.breaker_curve);
          setEditHasRcd(selectedMarker.has_rcd);
          setEditRcdGroup(selectedMarker.rcd_group || "");
          setEditRcdCurrent(selectedMarker.rcd_current || 40);
          setEditRcdMa(selectedMarker.rcd_ma || 30);
          setEditSwitchGroup(selectedMarker.switch_group || "");
          setEditPanelGroup(selectedMarker.panel_group || "");
          setEditOrientation(selectedMarker.metadata?.orientation || "horizontal");
          setEditRotation(selectedMarker.metadata?.rotation || (selectedMarker.metadata?.orientation === "vertical" ? 270 : 0));
          setEditKabeltyp(selectedMarker.metadata?.kabeltyp || "");
          setEditUvStatus(selectedMarker.metadata?.uv_status || "");

          setIsDuplicating(true);
          setAddMode(true);
          setSelectedMarker(null);

          showNotification(t("stromkreise", "copiedKeyboardOk" as any, "Data copied! Point mouse at the map and press Ctrl+V to paste."), "success");
        }
      }

      // Check for Ctrl+V (or Cmd+V on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        const lastLL = (window as any).lastMouseLatLng;
        const conv = (window as any).latLngToXY;
        
        // Only paste if we have copied data (e.g. editCode is set) and map context is active
        if (editCode && lastLL && conv) {
          e.preventDefault();
          
          const coords = conv(lastLL);
          if (!coords || isNaN(coords.x) || isNaN(coords.y)) return;

          // Perform paste / create
          const dbType = ["sym_socket"].includes(editType) ? "socket" : 
                         ["sym_cee16", "sym_cee32"].includes(editType) ? "cee" : editType;
          const dbShape = ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? "circle" : editShape;
          const payload = {
            project_id: projectId,
            plan_id: activePlanId,
            circuit_code: editCode,
            short_label: editShortLabel,
            full_name: editName,
            type: dbType,
            marker_shape: dbShape,
            phase: editPhase,
            breaker_current: editBreakerCurrent,
            breaker_curve: editBreakerCurve,
            has_rcd: editHasRcd,
            rcd_group: editHasRcd ? editRcdGroup || null : null,
            rcd_current: editHasRcd && editRcdGroup ? editRcdCurrent : null,
            rcd_ma: editHasRcd && editRcdGroup ? editRcdMa : null,
            switch_group: editSwitchGroup || null,
            panel_group: editPanelGroup || null,
            circuit_number: (editType !== "edv" && Number.isFinite(Number(editShortLabel))) 
              ? Number(editShortLabel) 
              : markers.length + 1,
            x_norm: coords.x,
            y_norm: coords.y,
            metadata: {
              orientation: editOrientation,
              rotation: editRotation,
              kabeltyp: editKabeltyp || undefined,
              uv_status: editUvStatus || undefined,
              realType: ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? editType : undefined
            }
          };

          try {
            if (editKabeltyp && !cableTypes.includes(editKabeltyp)) {
              apiPost("/api/cable-types", { project_id: projectId, name: editKabeltyp }).catch(() => {});
              setCableTypes(prev => [...prev, editKabeltyp].sort());
            }

            const res = await apiPost("/api/stromkreise", payload);
            if (res) {
              showNotification(t("stromkreise", "saveSuccess" as any, "Circuit marker created!"), "success");
              setIsCreating(false);
              setTempCoordinates(null);
              setIsDuplicating(false);
              setAddMode(false);
              loadMarkers();
            }
          } catch (err: any) {
            showNotification(err.message || "Error creating marker", "error");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    selectedMarker,
    editCode,
    editShortLabel,
    editName,
    editType,
    editShape,
    editPhase,
    editBreakerCurrent,
    editBreakerCurve,
    editHasRcd,
    editRcdGroup,
    editRcdCurrent,
    editRcdMa,
    editSwitchGroup,
    editPanelGroup,
    editOrientation,
    editKabeltyp,
    editUvStatus,
    projectId,
    activePlanId,
    markers,
    cableTypes,
    t,
    handleDeleteMarker,
    isCreating,
    addMode
  ]);

  // Type to Shape Default Mapping
  const handleTypeChange = (typeVal: string, isForm = false) => {
    let shapeVal = "triangle"; // Default socket = triangle
    if (typeVal === "socket") shapeVal = "triangle";
    else if (typeVal === "light") shapeVal = "circle";
    else if (typeVal === "edv") shapeVal = "square";
    else if (typeVal === "cee") shapeVal = "rhombus";
    else if (typeVal === "special" || typeVal === "reserve") shapeVal = "hexagon";

    if (isForm) {
      setEditType(typeVal);
      setEditShape(shapeVal);
    } else {
      setActiveType(typeVal);
      setActiveShape(shapeVal);
    }
  };

  const recalculateSuggestedCode = useCallback(() => {
    const activeBaseMarkers = activeType === "edv" ? baseMarkersEdv : baseMarkersStrom;
    const activePlan = plans.find(p => p.id === activePlanId);
    const planVersion = Number.isFinite(Number(activePlan?.version)) && Number(activePlan?.version) > 0
      ? Math.trunc(Number(activePlan.version))
      : 1;
    const phase = editPhase || 1;

    // Combine base plan markers and current plan markers to avoid duplicates
    const combinedMarkers = [...activeBaseMarkers, ...markers];

    if (activeType === "edv") {
      let maxPf = 1;
      let maxPortOnMaxPf = 0;

      combinedMarkers
        .filter(m => m.type === "edv")
        .forEach(m => {
          const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
          if (match) {
            const pf = Number(match[1]);
            const p1 = Number(match[2]);
            const p2 = match[3] ? Number(match[3]) : p1;
            const highestP = Math.max(p1, p2);
            if (pf > maxPf) {
              maxPf = pf;
              maxPortOnMaxPf = highestP;
            } else if (pf === maxPf) {
              if (highestP > maxPortOnMaxPf) {
                maxPortOnMaxPf = highestP;
              }
            }
          }
        });

      let nextPatchfeld = 1;
      let nextPort = 1;

      if (maxPortOnMaxPf > 0) {
        nextPatchfeld = maxPf;
        nextPort = maxPortOnMaxPf + 1;
      }

      setEdvPatchfeld(String(nextPatchfeld));
      setEdvPort1(String(nextPort));
      setEdvPort2("");
      setEditCode(`P${nextPatchfeld}.${nextPort}`);
      setEditShortLabel(String(nextPort));
    } else {
      let maxCircuitNumber = 0;
      let highestMarkerPrefix = `${phase}F${planVersion}.`;

      combinedMarkers
        .filter(m => m.type !== "edv")
        .forEach(m => {
          const match = m.circuit_code?.match(/^(.*[^0-9])([0-9]+)$/);
          if (match) {
            const num = Number(match[2]);
            if (num > maxCircuitNumber) {
              maxCircuitNumber = num;
              highestMarkerPrefix = match[1];
            }
          } else {
            const num = Number(m.circuit_number);
            if (Number.isFinite(num) && num > maxCircuitNumber) maxCircuitNumber = num;
          }
        });

      const nextCircuitNumber = maxCircuitNumber + 1;
      const circuit_code = `${highestMarkerPrefix}${nextCircuitNumber}`;
      const short_label = String(nextCircuitNumber);

      setEditCode(circuit_code);
      setEditShortLabel(short_label);
    }
  }, [activeType, baseMarkersEdv, baseMarkersStrom, activePlanId, plans, editPhase, markers, sequenceBasePlanId]);

  // Recalculate if user changes the base plan dropdown while the form is already open
  useEffect(() => {
    if (isCreating) {
      recalculateSuggestedCode();
    }
  }, [baseMarkersEdv, baseMarkersStrom]);

  // Add Marker - called from map click when in addMode
  const handleAddMarker = async (x: number, y: number) => {
    if (!isAdmin || !addMode) return;

    if (["sym_socket", "sym_cee16", "sym_cee32"].includes(activeType)) {
      let label = "";
      if (activeType === "sym_socket") label = "Gniazdo";
      else if (activeType === "sym_cee16") label = "CEE 16A";
      else if (activeType === "sym_cee32") label = "CEE 32A";

      const finalCode = (() => {
        const last = lastCreatedByType[activeType];
        if (last && last.circuit_code) {
          const match = last.circuit_code.match(/^(.*[^0-9])([0-9]+)$/);
          if (match) {
            const prefix = match[1];
            const num = parseInt(match[2], 10);
            return `${prefix}${num + 1}`;
          }
        }
        let maxNum = 0;
        markers.forEach(m => {
          if (m.type === activeType) {
            const match = m.circuit_code.match(new RegExp(`^${label} (\\d+)$`));
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        });
        return `${label} ${maxNum + 1}`;
      })();

      const payload = {
        project_id: projectId,
        plan_id: activePlanId,
        circuit_code: finalCode,
        short_label: finalCode,
        full_name: label,
        type: activeType === "sym_socket" ? "socket" : "cee",
        marker_shape: "circle",
        x_norm: x,
        y_norm: y,
        metadata: {
          orientation: "horizontal",
          realType: activeType
        }
      };

      try {
        const res = await apiPost("/api/stromkreise", payload);
        if (res) {
          showNotification(t("stromkreise", "saveSuccess" as any, "Symbol placed!"), "success");
          
          setLastCreatedByType(prev => ({
            ...prev,
            [activeType]: {
              circuit_code: finalCode,
              short_label: finalCode,
              full_name: label,
              phase: 1,
              breaker_current: 16,
              breaker_curve: "B",
              has_rcd: false,
              rcd_group: "",
              rcd_current: 40,
              rcd_ma: 30,
              switch_group: "",
              panel_group: "",
              kabeltyp: "",
              uv_status: "",
              orientation: "horizontal",
              rotation: 0
            }
          }));

          loadMarkers();
        }
      } catch (e: any) {
        showNotification(e.message || "Error placing symbol", "error");
      }
      return;
    }

    if (isDuplicating) {
      setTempCoordinates({ x, y });
      setIsCreating(true);
      setSelectedMarker(null);
      setAddMode(false);
      setIsDuplicating(false);
      showNotification(t("stromkreise", "formOpenedHint" as any, "Enter circuit details in the sidebar and click Create"), "info");
      return;
    }

    if (activeType === "line" || activeType === "arrow") {
      // Lines/arrows are now handled by drag and drop (onAddLineArrow)
      return;
    }

    const last = lastCreatedByType[activeType];
    if (last) {
      setEditType(activeType);
      setEditShape(activeShape);
      setEditName(last.full_name || getTypeLabel(activeType, t));
      setEditPhase(last.phase);
      setEditBreakerCurrent(last.breaker_current);
      setEditBreakerCurve(last.breaker_curve);
      setEditHasRcd(last.has_rcd);
      setEditRcdGroup(last.rcd_group);
      setEditRcdCurrent(last.rcd_current);
      setEditRcdMa(last.rcd_ma);
      setEditSwitchGroup(last.switch_group);
      setEditPanelGroup(last.panel_group);
      setEditKabeltyp(last.kabeltyp);
      setEditUvStatus(last.uv_status);
      setEditOrientation(last.orientation);
      setEditRotation(last.rotation);

      if (activeType === "edv") {
        const lastCode = last.circuit_code || "";
        const match = lastCode.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
        if (match) {
          const pf = match[1];
          const p1 = parseInt(match[2], 10);
          const p2 = match[3] ? parseInt(match[3], 10) : null;
          if (p2 !== null) {
            const span = p2 - p1;
            const nextP1 = p2 + 1;
            const nextP2 = nextP1 + span;
            setEdvPatchfeld(pf);
            setEdvPort1(String(nextP1));
            setEdvPort2(String(nextP2));
            setEditCode(`P${pf}.${nextP1}/${nextP2}`);
            setEditShortLabel(`${nextP1}/${nextP2}`);
          } else {
            const nextP1 = p1 + 1;
            setEdvPatchfeld(pf);
            setEdvPort1(String(nextP1));
            setEdvPort2("");
            setEditCode(`P${pf}.${nextP1}`);
            setEditShortLabel(String(nextP1));
          }
        } else {
          recalculateSuggestedCode();
        }
      } else {
        const lastCode = last.circuit_code;
        const match = lastCode.match(/^(.*[^0-9])([0-9]+)$/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10);
          setEditCode(`${prefix}${num + 1}`);
          setEditShortLabel(String(num + 1));
        } else {
          recalculateSuggestedCode();
        }
      }
    } else {
      if (editType !== activeType) {
        setEditName(getTypeLabel(activeType, t));
        setEditType(activeType);
        setEditShape(activeShape);
      }
      recalculateSuggestedCode();
      setEditKabeltyp("");
      setEditMetadata({});
    }

    setTempCoordinates({ x, y });
    setIsCreating(true);
    setSelectedMarker(null);
    setAddMode(false);

    showNotification(t("stromkreise", "formOpenedHint" as any, "Enter circuit details in the sidebar and click Create"), "info");
  };

  // Create Marker - called when clicking Create button in sidebar
  const handleCreateMarker = async () => {
    if (!tempCoordinates) return;

    const dbType = ["sym_socket"].includes(editType) ? "socket" : 
                   ["sym_cee16", "sym_cee32"].includes(editType) ? "cee" : editType;
    const dbShape = ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? "circle" : editShape;
    const payload = {
      project_id: projectId,
      plan_id: activePlanId,
      circuit_code: editCode,
      short_label: editShortLabel,
      full_name: editName,
      type: dbType,
      marker_shape: dbShape,
      phase: editPhase,
      breaker_current: editBreakerCurrent,
      breaker_curve: editBreakerCurve,
      has_rcd: editHasRcd,
      rcd_group: editHasRcd ? editRcdGroup || null : null,
      rcd_current: editHasRcd && editRcdGroup ? editRcdCurrent : null,
      rcd_ma: editHasRcd && editRcdGroup ? editRcdMa : null,
      switch_group: editSwitchGroup || null,
      panel_group: editPanelGroup || null,
      circuit_number: (editType !== "edv" && Number.isFinite(Number(editShortLabel))) 
        ? Number(editShortLabel) 
        : markers.length + 1,
      x_norm: tempCoordinates.x,
      y_norm: tempCoordinates.y,
      metadata: {
        orientation: editOrientation,
        rotation: editRotation,
        kabeltyp: editKabeltyp || undefined,
        uv_status: editUvStatus || undefined,
        realType: ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? editType : undefined
      }
    };

    try {
      if (editKabeltyp && !cableTypes.includes(editKabeltyp)) {
        apiPost("/api/cable-types", { project_id: projectId, name: editKabeltyp }).catch(() => {});
        setCableTypes(prev => [...prev, editKabeltyp].sort());
      }
      
      const res = await apiPost("/api/stromkreise", payload);
      if (res) {
        showNotification(t("stromkreise", "saveSuccess" as any, "Circuit marker created!"), "success");
        setLastCreatedByType(prev => ({
          ...prev,
          [editType]: {
            circuit_code: editCode,
            short_label: editShortLabel,
            full_name: editName,
            phase: editPhase,
            breaker_current: editBreakerCurrent,
            breaker_curve: editBreakerCurve,
            has_rcd: editHasRcd,
            rcd_group: editRcdGroup,
            rcd_current: editRcdCurrent,
            rcd_ma: editRcdMa,
            switch_group: editSwitchGroup,
            panel_group: editPanelGroup,
            kabeltyp: editKabeltyp,
            uv_status: editUvStatus,
            orientation: editOrientation,
            rotation: editRotation
          }
        }));
        setIsCreating(false);
        setTempCoordinates(null);
        loadMarkers();
      }
    } catch (e: any) {
      showNotification(e.message || "Error creating marker", "error");
    }
  };

  // Move Marker
  const handleMoveMarker = async (id: string, x: number, y: number) => {
    if (!isAdmin || !isEditMode) return;
    if (id === "temp-marker-id") {
      setTempCoordinates({ x, y });
      return;
    }
    try {
      await apiPatch("/api/stromkreise", { id, x_norm: x, y_norm: y });
      loadMarkers();
    } catch (e: any) {
      showNotification(e.message || "Error updating coordinates", "error");
    }
  };

  // Toggle Marker Orientation/Rotation (via Shift-click)
  const handleToggleMarkerOrientation = async (id: string) => {
    const marker = markers.find(m => m.id === id);
    if (!marker || !isAdmin || !isEditMode) return;

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
      showNotification(t("stromkreise", "saveSuccess" as any, "Rotated 90°!"), "success");
      loadMarkers();

      if (selectedMarker && selectedMarker.id === id) {
        setEditOrientation(nextRot === 270 ? "vertical" : "horizontal");
      }
    } catch (e: any) {
      showNotification(e.message || "Error rotating marker", "error");
    }
  };

  useEffect(() => {
    (window as any).toggleMarkerOrientation = (id: string) => {
      handleToggleMarkerOrientation(id);
    };
    return () => {
      delete (window as any).toggleMarkerOrientation;
    };
  }, [handleToggleMarkerOrientation]);

  // Save Edit Form
  const handleSaveEdit = async () => {
    if (!selectedMarker) return;

    const dbType = ["sym_socket"].includes(editType) ? "socket" : 
                   ["sym_cee16", "sym_cee32"].includes(editType) ? "cee" : editType;
    const dbShape = ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? "circle" : editShape;
    const payload = {
      id: selectedMarker.id,
      syncAllDuplicates: editSyncAllDuplicates,
      circuit_code: editCode,
      full_name: editName,
      short_label: editShortLabel,
      type: dbType,
      marker_shape: dbShape,
      phase: editPhase,
      breaker_current: editBreakerCurrent,
      breaker_curve: editBreakerCurve,
      has_rcd: editHasRcd,
      rcd_group: editHasRcd ? editRcdGroup || null : null,
      rcd_current: editHasRcd && editRcdGroup ? editRcdCurrent : null,
      rcd_ma: editHasRcd && editRcdGroup ? editRcdMa : null,
      switch_group: editSwitchGroup || null,
      panel_group: editPanelGroup || null,
      circuit_number: editCircuitNumber,
      metadata: {
        ...(selectedMarker.metadata || {}),
        orientation: editOrientation,
        rotation: editRotation,
        kabeltyp: editKabeltyp || undefined,
        uv_status: editUvStatus || undefined,
        realType: ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? editType : undefined
      }
    };

    try {
      if (editKabeltyp && !cableTypes.includes(editKabeltyp)) {
        apiPost("/api/cable-types", { project_id: projectId, name: editKabeltyp }).catch(() => {});
        setCableTypes(prev => [...prev, editKabeltyp].sort());
      }

      await apiPatch("/api/stromkreise", payload);
      showNotification(t("stromkreise", "saveSuccess" as any, "Saved successfully!"), "success");
      setLastCreatedByType(prev => ({
        ...prev,
        [editType]: {
          circuit_code: editCode,
          short_label: editShortLabel,
          full_name: editName,
          phase: editPhase,
          breaker_current: editBreakerCurrent,
          breaker_curve: editBreakerCurve,
          has_rcd: editHasRcd,
          rcd_group: editRcdGroup,
          rcd_current: editRcdCurrent,
          rcd_ma: editRcdMa,
          switch_group: editSwitchGroup,
          panel_group: editPanelGroup,
          kabeltyp: editKabeltyp,
          uv_status: editUvStatus,
          orientation: editOrientation,
          rotation: editRotation
        }
      }));
      setSelectedMarker(null);
      loadMarkers();
    } catch (e: any) {
      showNotification(e.message || "Error saving changes", "error");
    }
  };

  const handleReportProblem = async (markerId: string, problemDescription: string) => {
    try {
      const marker = markers.find(m => m.id === markerId);
      if (!marker) return;

      const payload = {
        id: markerId,
        metadata: {
          ...marker.metadata,
          problem: problemDescription || null
        }
      };

      await apiPatch("/api/stromkreise", payload);
      showNotification(problemDescription ? "Zgłoszono problem" : "Usunięto problem", "success");
      loadMarkers();

      if (selectedMarker && selectedMarker.id === markerId) {
        setSelectedMarker(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            metadata: {
              ...prev.metadata,
              problem: problemDescription || null
            }
          };
        });
      }
    } catch (e: any) {
      showNotification(e.message || "Błąd zapisu problemu", "error");
    }
  };

  const handleExecutionSubmit = async (markerId: string, subCable: string) => {
    try {
      const res = await fetch("/api/stromkreise/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markerId: markerId, subCable })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Error");
      showNotification("Zgłoszono wykonanie kabla", "success");
      loadMarkers();
      
      // Update local state without waiting for full reload to be responsive
      if (selectedMarker && selectedMarker.id === markerId) {
        setSelectedMarker(prev => {
          if (!prev) return prev;
          const newEx = { status: "PENDING_APPROVAL", submitted_at: new Date().toISOString() };
          return { ...prev, metadata: { ...prev.metadata, executions: { ...(prev.metadata?.executions || {}), [subCable]: newEx } } };
        });
      }
    } catch (e: any) {
      showNotification(e.message, "error");
    }
  };

  const handleExecutionUndo = async (markerId: string, subCable: string) => {
    try {
      const res = await fetch("/api/stromkreise/execution", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markerId: markerId, subCable })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Error");
      showNotification("Cofnięto zgłoszenie", "success");
      loadMarkers();

      if (selectedMarker && selectedMarker.id === markerId) {
        setSelectedMarker(prev => {
          if (!prev) return prev;
          const ex = { ...(prev.metadata?.executions || {}) };
          delete ex[subCable];
          return { ...prev, metadata: { ...prev.metadata, executions: ex } };
        });
      }
    } catch (e: any) {
      showNotification(e.message, "error");
    }
  };

  const handleExecutionAction = async (markerId: string, subCable: string, action: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch("/api/stromkreise/execution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markerId: markerId, subCable, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Error");
      showNotification(action === "APPROVED" ? "Zatwierdzono" : "Odrzucono", "success");
      loadMarkers();

      if (selectedMarker && selectedMarker.id === markerId) {
        setSelectedMarker(prev => {
          if (!prev) return prev;
          const ex = { ...(prev.metadata?.executions || {}) };
          ex[subCable] = { ...ex[subCable], status: action };
          return { ...prev, metadata: { ...prev.metadata, executions: ex } };
        });
      }
    } catch (e: any) {
      showNotification(e.message, "error");
    }
  };



  const uniqueNonEdvMarkers = useMemo(() => {
    const seenCodes = new Set<string>();
    return markers.filter(m => {
      if (m.type === "edv" || m.type === "text" || m.type === "line" || m.type === "arrow" || m.type === "sym_socket" || m.type === "sym_cee16" || m.type === "sym_cee32") return false;
      const normPanel = (m.panel_group || "").replace(/\s+/g, "").toUpperCase();
      const key = `${normPanel}#${m.circuit_code}`;
      if (seenCodes.has(key)) return false;
      seenCodes.add(key);
      return true;
    });
  }, [markers]);

  // Verteilerstruktur groupings (excluding EDV)
  const verteilerstruktur = useMemo(() => {
    const rcdMap: Record<string, { verteiler: string; rcdGroup: string; current: number | null; ma: number | null; breakers: any[] }> = {};

    uniqueNonEdvMarkers.forEach(m => {
      const rawPanel = m.panel_group || "Verteiler";
      const verteilerName = rawPanel === "Verteiler" ? "Verteiler" : rawPanel.replace(/\s+/g, "").toUpperCase();
      const gNameRaw = m.has_rcd ? m.rcd_group || "FI-Gruppe" : "__no_rcd__";
      const gName = gNameRaw === "__no_rcd__" ? `${verteilerName}___no_rcd__` : `${verteilerName} - ${gNameRaw}`;

      if (!rcdMap[gName]) {
        rcdMap[gName] = {
          verteiler: verteilerName,
          rcdGroup: gNameRaw,
          current: m.rcd_current,
          ma: m.rcd_ma,
          breakers: []
        };
      }
      rcdMap[gName].breakers.push(m);
    });

    return Object.entries(rcdMap)
      .map(([name, val]) => ({
        name,
        verteiler: val.verteiler,
        rcdGroup: val.rcdGroup,
        current: val.current,
        ma: val.ma,
        breakers: val.breakers.sort((a, b) => naturalSort(a.circuit_code, b.circuit_code))
      }))
      .sort((a, b) => {
        const isANoRcd = a.name.includes("__no_rcd__");
        const isBNoRcd = b.name.includes("__no_rcd__");
        if (isANoRcd && !isBNoRcd) return -1;
        if (!isANoRcd && isBNoRcd) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [markers]);

  // EDV structure grouped by Patchfield
  const edvStructure = useMemo(() => {
    const patchfeldMap: Record<string, StromkreisMarker[]> = {};

    markers.filter(m => m.type === "edv").forEach(m => {
      let pfName = "Patchfeld 1";
      const match = m.circuit_code.match(/^P([0-9]+)\./);
      if (match) {
        pfName = `Patchfeld ${match[1]}`;
      }

      if (!patchfeldMap[pfName]) {
        patchfeldMap[pfName] = [];
      }
      patchfeldMap[pfName].push(m);
    });

    const getPortNum = (code: string) => {
      const match = code.match(/^P[0-9]+\.([0-9]+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const getPfNum = (name: string) => {
      const match = name.match(/Patchfeld ([0-9]+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    return Object.entries(patchfeldMap)
      .map(([name, breakers]) => ({
        name,
        breakers: breakers.sort((a, b) => getPortNum(a.circuit_code) - getPortNum(b.circuit_code))
      }))
      .sort((a, b) => getPfNum(a.name) - getPfNum(b.name));
  }, [markers]);

  // Comprehensive EDV Analysis: Current Plan + Base Plan Continuation & Collision Detection
  const edvAnalysis = useMemo(() => {
    const currentEdvMarkers = markers.filter(m => m.type === "edv");
    const currentPortMap = new Map<string, StromkreisMarker[]>();
    const currentMaxPfMap = new Map<number, number>();

    currentEdvMarkers.forEach(m => {
      const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
      if (match) {
        const pf = Number(match[1]);
        const p1 = Number(match[2]);
        const p2 = match[3] ? Number(match[3]) : null;
        const k1 = `P${pf}.${p1}`;
        if (!currentPortMap.has(k1)) currentPortMap.set(k1, []);
        currentPortMap.get(k1)!.push(m);

        let maxOnPf = Math.max(currentMaxPfMap.get(pf) || 0, p1);
        if (p2 !== null) {
          const k2 = `P${pf}.${p2}`;
          if (!currentPortMap.has(k2)) currentPortMap.set(k2, []);
          currentPortMap.get(k2)!.push(m);
          maxOnPf = Math.max(maxOnPf, p2);
        }
        currentMaxPfMap.set(pf, maxOnPf);
      } else if (m.circuit_code) {
        if (!currentPortMap.has(m.circuit_code)) currentPortMap.set(m.circuit_code, []);
        currentPortMap.get(m.circuit_code)!.push(m);
      }
    });

    const internalDuplicates: { port: string; count: number; markers: StromkreisMarker[] }[] = [];
    const duplicateIds = new Set<string>();
    currentPortMap.forEach((mList, portKey) => {
      if (mList.length > 1) {
        internalDuplicates.push({ port: portKey, count: mList.length, markers: mList });
        mList.forEach(m => duplicateIds.add(m.id));
      }
    });

    const basePlanObj = sequenceBasePlanId !== "current" && sequenceBasePlanId !== "all"
      ? plans.find(p => p.id === sequenceBasePlanId)
      : null;
    const basePlanName = basePlanObj
      ? [basePlanObj.floors?.buildings?.name, basePlanObj.floors?.name].filter(Boolean).join(" - ") || `Plan v${basePlanObj.version}`
      : (sequenceBasePlanId === "all" ? "Wszystkie plany" : null);

    const baseEdvMarkers = sequenceBasePlanId !== "current"
      ? baseMarkersEdv.filter(m => m.type === "edv" && m.plan_id !== activePlanId)
      : [];

    const basePortMap = new Map<string, StromkreisMarker[]>();
    const baseMaxPfMap = new Map<number, number>();

    baseEdvMarkers.forEach(m => {
      const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
      if (match) {
        const pf = Number(match[1]);
        const p1 = Number(match[2]);
        const p2 = match[3] ? Number(match[3]) : null;
        const k1 = `P${pf}.${p1}`;
        if (!basePortMap.has(k1)) basePortMap.set(k1, []);
        basePortMap.get(k1)!.push(m);

        let maxOnPf = Math.max(baseMaxPfMap.get(pf) || 0, p1);
        if (p2 !== null) {
          const k2 = `P${pf}.${p2}`;
          if (!basePortMap.has(k2)) basePortMap.set(k2, []);
          basePortMap.get(k2)!.push(m);
          maxOnPf = Math.max(maxOnPf, p2);
        }
        baseMaxPfMap.set(pf, maxOnPf);
      } else if (m.circuit_code) {
        if (!basePortMap.has(m.circuit_code)) basePortMap.set(m.circuit_code, []);
        basePortMap.get(m.circuit_code)!.push(m);
      }
    });

    const crossPlanCollisions: { port: string; currentMarker: StromkreisMarker; baseMarker: StromkreisMarker }[] = [];
    const collisionIds = new Set<string>();

    if (basePortMap.size > 0) {
      currentEdvMarkers.forEach(m => {
        const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
        if (match) {
          const pf = match[1];
          const p1 = match[2];
          const p2 = match[3] || null;
          const k1 = `P${pf}.${p1}`;
          if (basePortMap.has(k1)) {
            crossPlanCollisions.push({ port: k1, currentMarker: m, baseMarker: basePortMap.get(k1)![0] });
            collisionIds.add(m.id);
          }
          if (p2) {
            const k2 = `P${pf}.${p2}`;
            if (basePortMap.has(k2)) {
              crossPlanCollisions.push({ port: k2, currentMarker: m, baseMarker: basePortMap.get(k2)![0] });
              collisionIds.add(m.id);
            }
          }
        } else if (m.circuit_code && basePortMap.has(m.circuit_code)) {
          crossPlanCollisions.push({ port: m.circuit_code, currentMarker: m, baseMarker: basePortMap.get(m.circuit_code)![0] });
          collisionIds.add(m.id);
        }
      });
    }

    let baseHighestPf = 1;
    let baseHighestPort = 0;
    baseMaxPfMap.forEach((maxPort, pf) => {
      if (pf > baseHighestPf || (pf === baseHighestPf && maxPort > baseHighestPort)) {
        baseHighestPf = pf;
        baseHighestPort = maxPort;
      }
    });

    let currentHighestPf = 1;
    let currentHighestPort = 0;
    currentMaxPfMap.forEach((maxPort, pf) => {
      if (pf > currentHighestPf || (pf === currentHighestPf && maxPort > currentHighestPort)) {
        currentHighestPf = pf;
        currentHighestPort = maxPort;
      }
    });

    let suggestedPf = 1;
    let suggestedPort = 1;
    if (sequenceBasePlanId !== "current" && baseHighestPort > 0) {
      if (currentHighestPort > 0) {
        suggestedPf = Math.max(baseHighestPf, currentHighestPf);
        const maxP = Math.max(
          baseHighestPf === suggestedPf ? baseHighestPort : 0,
          currentHighestPf === suggestedPf ? currentHighestPort : 0
        );
        suggestedPort = maxP + 1;
      } else {
        suggestedPf = baseHighestPf;
        suggestedPort = baseHighestPort + 1;
      }
    } else if (currentHighestPort > 0) {
      suggestedPf = currentHighestPf;
      suggestedPort = currentHighestPort + 1;
    }

    return {
      currentCount: currentEdvMarkers.length,
      internalDuplicates,
      duplicateIds,
      basePlanName,
      baseHighestPf,
      baseHighestPort,
      currentHighestPf,
      currentHighestPort,
      crossPlanCollisions,
      collisionIds,
      hasCollisions: internalDuplicates.length > 0 || crossPlanCollisions.length > 0,
      suggestedPf,
      suggestedPort,
      suggestedCode: `P${suggestedPf}.${suggestedPort}`
    };
  }, [markers, baseMarkersEdv, sequenceBasePlanId, plans, activePlanId]);

  const duplicateEdvMarkerIds = edvAnalysis.duplicateIds;
  const collisionEdvMarkerIds = edvAnalysis.collisionIds;

  // Real-time EDV Duplicate warning in sidebar form
  const edvDuplicateInfo = useMemo(() => {
    if (editType !== "edv") return null;
    const pf = edvPatchfeld.trim();
    const p1 = edvPort1.trim();
    const p2 = edvPort2.trim();
    if (!pf || !p1) return null;

    const k1 = `P${pf}.${p1}`;
    const k2 = p2 ? `P${pf}.${p2}` : null;

    const duplicatesOnPlan = markers.filter(m => {
      if (selectedMarker && m.id === selectedMarker.id) return false;
      if (m.type !== "edv") return false;
      const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
      if (match) {
        const mk1 = `P${match[1]}.${match[2]}`;
        const mk2 = match[3] ? `P${match[1]}.${match[3]}` : null;
        return mk1 === k1 || mk1 === k2 || (mk2 && (mk2 === k1 || mk2 === k2));
      }
      return m.circuit_code === k1 || (k2 && m.circuit_code === k2);
    });

    if (duplicatesOnPlan.length > 0) {
      return {
        isDuplicate: true,
        message: `⚠️ Uwaga: Port ${k1}${k2 ? ` lub ${k2}` : ''} już istnieje na tym planie (${duplicatesOnPlan.map(d => d.circuit_code).join(', ')})!`
      };
    }

    if (sequenceBasePlanId !== "current" && baseMarkersEdv.length > 0) {
      const baseDup = baseMarkersEdv.find(m => {
        if (m.plan_id === activePlanId) return false;
        if (m.type !== "edv") return false;
        const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
        if (match) {
          const mk1 = `P${match[1]}.${match[2]}`;
          const mk2 = match[3] ? `P${match[1]}.${match[3]}` : null;
          return mk1 === k1 || mk1 === k2 || (mk2 && (mk2 === k1 || mk2 === k2));
        }
        return false;
      });
      if (baseDup) {
        return {
          isDuplicate: true,
          message: `⚠️ Kolizja: Port ${k1}${k2 ? ` lub ${k2}` : ''} jest już użyty na planie bazowym (${edvAnalysis.basePlanName || baseDup.circuit_code})!`
        };
      }
    }

    return null;
  }, [editType, edvPatchfeld, edvPort1, edvPort2, markers, selectedMarker, sequenceBasePlanId, baseMarkersEdv, activePlanId, edvAnalysis.basePlanName]);

  // Count duplicates for currently selected marker on this plan
  const selectedMarkerDuplicatesCount = useMemo(() => {
    if (!selectedMarker) return 0;
    const targetCode = (selectedMarker.circuit_code || "").trim().toLowerCase();
    if (!targetCode) return 0;
    const targetPanel = (selectedMarker.panel_group || "").trim().toLowerCase();
    return markers.filter(m => {
      const mCode = (m.circuit_code || "").trim().toLowerCase();
      if (mCode !== targetCode) return false;
      const mPanel = (m.panel_group || "").trim().toLowerCase();
      return mPanel === targetPanel;
    }).length;
  }, [selectedMarker, markers]);

  // Validations Engine
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const codes = new Set<string>();
    const labels = new Set<string>();

    // Rcd mappings
    const rcdMetaMap: Record<string, { current: number | null; ma: number | null }> = {};

    markers.forEach(m => {
      // 1. Duplicate circuit_code (validation removed as per user request)
      codes.add(m.circuit_code);

      // 2. Duplicate short_label (validation removed as per user request)
      labels.add(m.short_label);

      // 3. Required fields
      if (!m.circuit_code || !m.short_label || !m.full_name) {
        errors.push(t("stromkreise", "missingRequired" as any, `Missing fields for ${m.circuit_code}`).replace("{code}", m.circuit_code || "Unknown"));
      }

      // 4. Phase check for CEE outlets
      if (m.type === "cee" && m.phase !== 3) {
        errors.push(t("stromkreise", "invalidPhase" as any, `Invalid phase for ${m.circuit_code}`).replace("{code}", m.circuit_code));
      }

      // 5. RCD validation
      if (m.has_rcd && m.rcd_group) {
        const existing = rcdMetaMap[m.rcd_group];
        if (!existing) {
          rcdMetaMap[m.rcd_group] = { current: m.rcd_current, ma: m.rcd_ma };
        } else {
          if (existing.current !== m.rcd_current || existing.ma !== m.rcd_ma) {
            errors.push(t("stromkreise", "missingFiValues" as any, `FI/RCD mismatch in group ${m.rcd_group}`).replace("{group}", m.rcd_group));
          }
        }
      }
    });

    // 6. 3-Phase group missing elements check
    const codesArr = Array.from(codes);
    codesArr.forEach(c => {
      const m = markers.find(x => x.circuit_code === c);
      if (m?.type === "edv") return;

      if (c.startsWith("3F") && m?.phase === 3) {
        const match = c.match(/^3F([0-9]+)\.([0-9]+)$/);
        if (match) {
          const groupNum = match[1];

          const siblings = [1, 2, 3];
          siblings.forEach(s => {
            const expectedCode = `3F${groupNum}.${s}`;
            const sibMarker = markers.find(x => x.circuit_code === expectedCode);
            if (sibMarker && sibMarker.type === "edv") return;

            if (!codes.has(expectedCode)) {
              errors.push(t("stromkreise", "missing3fMember" as any, `Missing 3-phase member: ${expectedCode}`).replace("{code}", expectedCode));
            }
          });
        }
      }
    });

    // 7. EDV duplicate port validation
    const edvPortMap = new Map<string, StromkreisMarker[]>();
    markers
      .filter(m => m.type === "edv")
      .forEach(m => {
        const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
        if (match) {
          const pf = match[1];
          const p1 = match[2];
          const p2 = match[3] || null;
          const k1 = `P${pf}.${p1}`;
          if (!edvPortMap.has(k1)) edvPortMap.set(k1, []);
          edvPortMap.get(k1)!.push(m);
          if (p2) {
            const k2 = `P${pf}.${p2}`;
            if (!edvPortMap.has(k2)) edvPortMap.set(k2, []);
            edvPortMap.get(k2)!.push(m);
          }
        } else if (m.circuit_code) {
          const k = m.circuit_code;
          if (!edvPortMap.has(k)) edvPortMap.set(k, []);
          edvPortMap.get(k)!.push(m);
        }
      });

    edvPortMap.forEach((mList, portKey) => {
      if (mList.length > 1) {
        errors.push(
          t("stromkreise", "duplicateEdvPort" as any, `Powtórzony port EDV: {port} (występuje {count}x na planie)`)
            .replace("{port}", portKey)
            .replace("{count}", String(mList.length))
        );
      }
    });

    // 8. EDV duplicate with continuation base plan
    if (sequenceBasePlanId !== "current" && baseMarkersEdv.length > 0) {
      const basePortMap = new Set<string>();
      baseMarkersEdv
        .filter(m => m.type === "edv" && m.plan_id !== activePlanId)
        .forEach(m => {
          const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
          if (match) {
            basePortMap.add(`P${match[1]}.${match[2]}`);
            if (match[3]) basePortMap.add(`P${match[1]}.${match[3]}`);
          } else if (m.circuit_code) {
            basePortMap.add(m.circuit_code);
          }
        });

      const reportedBaseDups = new Set<string>();
      markers.filter(m => m.type === "edv").forEach(m => {
        const match = m.circuit_code?.match(/^P?([0-9]+)\.([0-9]+)(?:\/([0-9]+))?$/i);
        if (match) {
          const k1 = `P${match[1]}.${match[2]}`;
          const k2 = match[3] ? `P${match[1]}.${match[3]}` : null;
          if (basePortMap.has(k1) && !reportedBaseDups.has(k1)) {
            reportedBaseDups.add(k1);
            errors.push(`Port EDV ${k1} istnieje już na wybranym planie bazowym kontynuacji!`);
          }
          if (k2 && basePortMap.has(k2) && !reportedBaseDups.has(k2)) {
            reportedBaseDups.add(k2);
            errors.push(`Port EDV ${k2} istnieje już na wybranym planie bazowym kontynuacji!`);
          }
        }
      });
    }

    return errors;
  }, [markers, t, sequenceBasePlanId, baseMarkersEdv, activePlanId]);

  const getExportFilename = (prefix: string, plan: any) => {
    const dateStr = new Date().toISOString().split("T")[0];
    const activeProject = projects.find(p => p.id === projectId);
    const companyName = activeProject?.companies?.name || "";
    const planNameRaw = [plan.floors?.buildings?.name, plan.floors?.name].filter(Boolean).join("_");
    const planName = planNameRaw || plan.id;

    const cleanString = (str: string) => {
      const charMap: Record<string, string> = {
        'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
        'Ą': 'a', 'Ć': 'c', 'Ę': 'e', 'Ł': 'l', 'Ń': 'n', 'Ó': 'o', 'Ś': 's', 'Ź': 'z', 'Ż': 'z',
        'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
        'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue'
      };
      let res = "";
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        res += charMap[char] || char;
      }
      return res
        .toLowerCase()
        .replace(/[\s/\\?%*:|"<>.-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    };

    const cleanCompany = cleanString(companyName);
    const cleanPlan = cleanString(planName);

    const parts = [prefix, cleanCompany, cleanPlan, dateStr].filter(Boolean);
    return `${parts.join("_")}.pdf`;
  };

  // Client-side A0 vector PDF export
  const handleExportVectorPdf = async () => {
    const plan = plans.find(p => p.id === activePlanId);
    if (!plan) return;

    setIsExportingPdf(true);
    try {
      const urlRes = await apiGet<any>(`/api/plans/pdf-url?id=${plan.id}`);
      const pdfUrl = urlRes?.signedUrl;
      if (!pdfUrl) throw new Error("Could not retrieve plan PDF URL");

      const response = await fetch(pdfUrl);
      const originalPlanPdfBytes = await response.arrayBuffer();

      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      const mainPdfDoc = await PDFDocument.load(originalPlanPdfBytes);

      const [page1] = mainPdfDoc.getPages();
      const rotationAngle = page1.getRotation().angle || 0;
      const mediaBox = page1.getMediaBox();
      const cropBox = page1.getCropBox();
      const size = page1.getSize();

      console.log("PDF EXPORT DEBUG:", {
        mediaBox: { x: mediaBox.x, y: mediaBox.y, width: mediaBox.width, height: mediaBox.height },
        cropBox: { x: cropBox.x, y: cropBox.y, width: cropBox.width, height: cropBox.height },
        size,
        rotationAngle
      });

      const ox = cropBox.x !== undefined ? cropBox.x : (mediaBox.x || 0);
      const oy = cropBox.y !== undefined ? cropBox.y : (mediaBox.y || 0);
      const w = cropBox.width !== undefined ? cropBox.width : mediaBox.width;
      const h = cropBox.height !== undefined ? cropBox.height : mediaBox.height;

      let imgW = plan.image_width;
      let imgH = plan.image_height;

      if (!imgW || !imgH) {
        try {
          const { data: activeVer } = await supabase
            .from("plan_versions")
            .select("width_px, height_px")
            .eq("plan_id", plan.id)
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
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          headers["X-App-Token"] = token;
        }
        const metaResRaw = await fetch(getApiUrl(`/api/tiles/${plan.id}/meta?t=${Date.now()}`), { headers });
        if (metaResRaw.ok) {
          const metaRes = await metaResRaw.json();
          if (metaRes && metaRes.gridW && metaRes.gridH) {
            const tileSize = metaRes.tileSize || 256;
            const gridW = metaRes.gridW * tileSize;
            const gridH = metaRes.gridH * tileSize;
            if (imgW && imgH) {
              scaleX = gridW / imgW;
              scaleY = gridH / imgH;
              console.log("PDF SCALE CORRECTION FROM TILE METADATA:", { gridW, gridH, imgW, imgH, scaleX, scaleY });
            }
          }
        } else {
          console.warn("Tile metadata API response was not OK:", metaResRaw.status);
        }
      } catch (metaErr) {
        console.error("Failed to fetch tile metadata for scaling, using fallback math:", metaErr);
      }

      if (scaleX === 1 && scaleY === 1 && imgW && imgH) {
        const tileSize = 256;
        const gridW = Math.ceil(imgW / tileSize) * tileSize;
        const gridH = Math.ceil(imgH / tileSize) * tileSize;
        scaleX = gridW / imgW;
        scaleY = gridH / imgH;
        console.log("PDF SCALE CORRECTION FROM FALLBACK DIMENSIONS:", { imgW, imgH, scaleX, scaleY });
      }

      const helveticaBold = await mainPdfDoc.embedFont(StandardFonts.HelveticaBold);

      const getMarkerCoords = (marker: any, w: number, h: number, rot: number) => {
        const x = marker.x_norm * scaleX;
        const y = marker.y_norm * scaleY;
        let cx = 0;
        let cy = 0;
        if (rot === 90) {
          cx = y * w;
          cy = x * h;
        } else if (rot === 180) {
          cx = (1 - x) * w;
          cy = y * h;
        } else if (rot === 270) {
          cx = y * w;
          cy = (1 - x) * h;
        } else {
          cx = x * w;
          cy = (1 - y) * h;
        }

        console.log(`Marker ${marker.circuit_code} (${marker.type}) visual:`, { x: marker.x_norm, y: marker.y_norm }, `corrected:`, { x, y }, `-> PDF raw:`, { cx, cy }, `-> final:`, { x: cx + ox, y: cy + oy });
        return { x: cx + ox, y: cy + oy };
      };

      // Draw vector markers directly on page1
      markers.forEach(m => {
        const coords = getMarkerCoords(m, w, h, rotationAngle);
        const cx = coords.x;
        const cy = coords.y;

        if (m.type === "line" || m.type === "arrow") {
          const coords2 = getMarkerCoords({ x_norm: m.metadata?.x2_norm ?? m.x_norm, y_norm: m.metadata?.y2_norm ?? m.y_norm }, w, h, rotationAngle);
          const lineColor = rgb(234 / 255, 179 / 255, 8 / 255); // #eab308
          
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
          
          return; // skip text drawing for lines/arrows
        }

        // Check if it's a symbol marker
        if (["sym_socket", "sym_cee16", "sym_cee32"].includes(m.type)) {
          const symColor = rgb(22 / 255, 163 / 255, 74 / 255);
          const R = 3.5;
          const markerRotation = m.metadata?.rotation || (m.metadata?.orientation === "vertical" ? 270 : 0);
          const effectiveRotation = (markerRotation + rotationAngle + 180) % 360;
          
          const getPt = (xOffset: number, yOffset: number) => {
            if (effectiveRotation === 90) {
              return { x: cx + yOffset, y: cy - xOffset };
            }
            if (effectiveRotation === 180) {
              return { x: cx - xOffset, y: cy - yOffset };
            }
            if (effectiveRotation === 270) {
              return { x: cx - yOffset, y: cy + xOffset };
            }
            return { x: cx + xOffset, y: cy + yOffset };
          };

          // 1. Draw dome/semicircle as clean line segments (no mask, 100% transparent background)
          const steps = 16;
          const stepAngle = Math.PI / steps;
          for (let i = 0; i < steps; i++) {
            const a1 = i * stepAngle;
            const a2 = (i + 1) * stepAngle;
            
            const pt1 = getPt(R * Math.cos(a1), -R + R * Math.sin(a1));
            const pt2 = getPt(R * Math.cos(a2), -R + R * Math.sin(a2));
            
            page1.drawLine({
              start: pt1,
              end: pt2,
              thickness: 0.8,
              color: symColor
            });
          }
          
          // 3. Draw horizontal line
          const p1 = getPt(-R, 0);
          const p2 = getPt(R, 0);
          page1.drawLine({
            start: p1,
            end: p2,
            thickness: 0.8,
            color: symColor,
          });
          
          // 4. Draw vertical line
          const pVerticalStart = getPt(0, 0);
          const pVerticalEnd = getPt(0, R + 2.5);
          page1.drawLine({
            start: pVerticalStart,
            end: pVerticalEnd,
            thickness: 0.8,
            color: symColor,
          });
          
          // 5. CEE specific slanted ticks and text
          if (m.type === "sym_cee16" || m.type === "sym_cee32") {
            // Slanted ticks
            for (let i = 0; i < 3; i++) {
              const yOffset = 2 + i * 1.5;
              const tickStart = getPt(-1.5, yOffset);
              const tickEnd = getPt(1.5, yOffset + 1.5);
              page1.drawLine({
                start: tickStart,
                end: tickEnd,
                thickness: 0.8,
                color: symColor,
              });
            }
            // Text below (rotated accordingly)
            const labelText = m.type === "sym_cee16" ? "16A" : "32A";
            const textW = labelText.length * 2.5 * 0.55;
            let tx = cx - textW / 2;
            let ty = cy - 7;
            if (effectiveRotation === 90) {
              tx = cx - 7;
              ty = cy - textW / 2;
            } else if (effectiveRotation === 180) {
              tx = cx - textW / 2;
              ty = cy + 5.5;
            } else if (effectiveRotation === 270) {
              tx = cx + 5.5;
              ty = cy - textW / 2;
            }
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

        let txtColor = rgb(0, 0, 0);
        if (m.type === "socket") txtColor = rgb(220 / 255, 38 / 255, 38 / 255);
        else if (m.type === "light") txtColor = rgb(217 / 255, 119 / 255, 6 / 255);
        else if (m.type === "edv") txtColor = rgb(220 / 255, 38 / 255, 38 / 255);
        else if (m.type === "cee") txtColor = rgb(168 / 255, 85 / 255, 247 / 255);
        else if (m.type === "special") txtColor = rgb(139 / 255, 92 / 255, 246 / 255);
        else if (m.type === "reserve") txtColor = rgb(100 / 255, 116 / 255, 139 / 255);
        else if (m.type === "text") txtColor = rgb(15 / 255, 23 / 255, 42 / 255);

        const txt = m.type === "text"
          ? m.short_label
          : m.circuit_code;
        const fSize = 10.0;
        const txtW = txt.length * fSize * 0.55;
        const rectW = txtW + 16;
        const rectH = fSize + 12;

        let rectWidth = rectW;
        let rectHeight = rectH;
        let textRotation = 0;

        if (rotationAngle === 90) {
          rectWidth = rectH;
          rectHeight = rectW;
          textRotation = 90;
        } else if (rotationAngle === 180) {
          textRotation = 180;
        } else if (rotationAngle === 270) {
          rectWidth = rectH;
          rectHeight = rectW;
          textRotation = 270;
        }

        const markerRotation = m.metadata?.rotation || (m.metadata?.orientation === "vertical" ? 270 : 0);
        if (markerRotation === 90 || markerRotation === 270) {
          const tmp = rectWidth;
          rectWidth = rectHeight;
          rectHeight = tmp;
        }
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

        if (debugPdf) {
          page1.drawText(`[DBG: ${m.circuit_code}]\nVis: x=${m.x_norm.toFixed(3)} y=${m.y_norm.toFixed(3)}\nPDF: cx=${cx.toFixed(1)} cy=${cy.toFixed(1)}`, {
            x: cx + rectWidth / 2 + 3,
            y: cy,
            size: 4,
            font: helveticaBold,
            color: rgb(1, 0, 0),
            rotate: degrees(textRotation)
          });
        }
      });

      if (debugPdf) {
        page1.drawRectangle({
          x: ox,
          y: oy,
          width: w,
          height: h,
          borderColor: rgb(1, 0, 0),
          borderWidth: 4,
          color: rgb(1, 0, 0),
          opacity: 0.05
        });

        const drawLabel = (text: string, tx: number, ty: number) => {
          page1.drawText(text, {
            x: tx,
            y: ty,
            size: 14,
            font: helveticaBold,
            color: rgb(1, 0, 0)
          });
        };

        drawLabel(`Origin (0,0) raw: (${ox.toFixed(1)}, ${oy.toFixed(1)})`, ox + 15, oy + 15);
        drawLabel(`(w, 0) raw: (${(ox + w).toFixed(1)}, ${oy.toFixed(1)})`, ox + w - 280, oy + 15);
        drawLabel(`(0, h) raw: (${ox.toFixed(1)}, ${(oy + h).toFixed(1)})`, ox + 15, oy + h - 35);
        drawLabel(`(w, h) raw: (${(ox + w).toFixed(1)}, ${(oy + h).toFixed(1)})`, ox + w - 280, oy + h - 35);

        for (let i = 1; i < 10; i++) {
          const ratio = i / 10;
          page1.drawLine({
            start: { x: ox + w * ratio, y: oy },
            end: { x: ox + w * ratio, y: oy + h },
            thickness: 0.8,
            color: rgb(1, 0, 0),
            opacity: 0.25
          });
          page1.drawLine({
            start: { x: ox, y: oy + h * ratio },
            end: { x: ox + w, y: oy + h * ratio },
            thickness: 0.8,
            color: rgb(1, 0, 0),
            opacity: 0.25
          });
        }
      }



      // Save and trigger download
      const finalPdfBytes = await mainPdfDoc.save();
      const blob = new Blob([finalPdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getExportFilename("plan_stromkreise", plan);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification("A0 Vector PDF downloaded!", "success");
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Failed to generate vector PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Sicherungsbelegungsplan A4 PDF export
  const handleExportTablePdf = async () => {
    const plan = plans.find(p => p.id === activePlanId);
    if (!plan) return;
    setIsExportingTable(true);
    try {
      const docBlob = await pdf(
        <StromkreiseTablePdf
          projectName={projects.find(p => p.id === projectId)?.name || "Project"}
          planName={[plan.floors?.buildings?.name, plan.floors?.name].filter(Boolean).join(" - ")}
          markers={uniqueNonEdvMarkers}
          translations={{
            "stromkreise.table.pdfTitle": t("stromkreise", "exportTablePdf" as any, "Sicherungsbelegungsplan"),
            "stromkreise.table.nr": "Nr.",
            "stromkreise.table.breaker": "Sicherung",
            "stromkreise.table.current": "Nennstrom",
            "stromkreise.table.char": "Charakteristik",
            "stromkreise.table.phase": "Phase",
            "stromkreise.table.rcd": "RCD",
            "stromkreise.table.type": "Typ",
            "stromkreise.phase.3": t("stromkreise", "phase3" as any, "3-Phasen"),
            "stromkreise.phase.1": t("stromkreise", "phase1" as any, "1-Phase"),
          }}
        />
      ).toBlob();

      const url = URL.createObjectURL(docBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getExportFilename("Sicherungsbelegungsplan", plan);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification("Sicherungsbelegungsplan PDF downloaded!", "success");
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Failed to export table PDF", "error");
    } finally {
      setIsExportingTable(false);
    }
  };

  // Verteilerstruktur grouped FI PDF export
  const handleExportFIStructPdf = async () => {
    const plan = plans.find(p => p.id === activePlanId);
    if (!plan) return;
    setIsExportingFI(true);
    try {
      const docBlob = await pdf(
        <StromkreiseFIStructPdf
          projectName={projects.find(p => p.id === projectId)?.name || "Project"}
          planName={[plan.floors?.buildings?.name, plan.floors?.name].filter(Boolean).join(" - ")}
          rcdGroups={verteilerstruktur}
          translations={{
            "stromkreise.fi.pdfTitle": t("stromkreise", "exportFIStructPdf" as any, "Verteilerstruktur"),
            "stromkreise.rcd.noRcd": t("stromkreise", "rcdNoRcd" as any, "Ohne RCD / FI"),
          }}
        />
      ).toBlob();

      const url = URL.createObjectURL(docBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getExportFilename("Verteilerstruktur", plan);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification("Verteilerstruktur PDF downloaded!", "success");
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Failed to export Verteilerstruktur PDF", "error");
    } finally {
      setIsExportingFI(false);
    }
  };

  // EDV Patchfeld-Belegungsplan PDF export
  const handleExportEdvPdf = async () => {
    const plan = plans.find(p => p.id === activePlanId);
    if (!plan) return;
    setIsExportingEdv(true);
    try {
      const docBlob = await pdf(
        <StromkreiseEdvPdf
          projectName={projects.find(p => p.id === projectId)?.name || "Project"}
          planName={[plan.floors?.buildings?.name, plan.floors?.name].filter(Boolean).join(" - ")}
          edvGroups={edvStructure}
          translations={{
            "stromkreise.edv.pdfTitle": t("stromkreise", "exportEdvPdf" as any, "EDV Patchfeld-Belegungsplan"),
            "stromkreise.edv.port": "Port",
            "stromkreise.edv.code": "Kennzeichnung",
            "stromkreise.edv.desc": "Beschreibung / Ort",
          }}
        />
      ).toBlob();

      const url = URL.createObjectURL(docBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getExportFilename("EDV_Patchfeld", plan);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification("EDV Patchfeld PDF downloaded!", "success");
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Failed to export EDV PDF", "error");
    } finally {
      setIsExportingEdv(false);
    }
  };

  const handleTriggerAi = async () => {
    if (!activePlanId) return;
    setIsTriggeringAi(true);
    try {
      await apiPost(`/api/plans/${activePlanId}/trigger-ai`, {});
      showNotification("AI Parser uruchomiony w tle! Strona odświeży się automatycznie po zakończeniu.", "success");
      
      // Auto-refresh (polling)
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          clearInterval(interval);
          return;
        }
        try {
          const res = await apiGet<any>(`/api/stromkreise?planId=${activePlanId}&_t=${Date.now()}`);
          const currentData = res?.data || res || [];
          if (Array.isArray(currentData)) {
            const aiMarkers = currentData.filter(m => m.metadata?.is_ai_generated);
            if (aiMarkers.length > 0) {
              loadMarkers();
              showNotification("AI zakończyło pracę. Markery zostały zaktualizowane.", "success");
              clearInterval(interval);
            }
          }
        } catch(e) {}
      }, 5000);
    } catch (e: any) {
      showNotification(e.message || "Błąd uruchamiania AI", "error");
    } finally {
      setIsTriggeringAi(false);
    }
  };

  // PDF import / parsing triggers
  const handleSchematicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setParsedProposals([]);

    try {
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

      const res = await apiCall<{ fuses: any[] }>("/api/parse-plan", {
        method: "POST",
        body: {
          fileData: base64Data,
          fileName: file.name
        },
        timeoutMs: 120000
      });

      if (res && res.fuses) {
        setParsedProposals(res.fuses);
        showNotification(t("stromkreise", "importSuccess" as any, "Schematic parsed successfully!"), "success");
      }
    } catch (e: any) {
      showNotification(t("stromkreise", "errorUpdate" as any, "Error updating circuit") + ": " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddLineArrow = async (x1: number, y1: number, x2: number, y2: number) => {
    if (!isAdmin || !addMode || !token) return;
    setLoading(true);

    const circuit_code = activeType === "arrow" ? "Strzałka" : "Linia";
    
    try {
        const payload = {
            project_id: projectId,
            plan_id: activePlanId,
            circuit_code,
            short_label: circuit_code,
            full_name: circuit_code,
            type: "socket",
            marker_shape: "circle",
            x_norm: x1,
            y_norm: y1,
            metadata: { x2_norm: x2, y2_norm: y2, realType: activeType },
        };
        const res = await apiPost<any>("/api/stromkreise", payload);
        if (res && res.id) {
            // Restore the real type locally so it renders immediately
            const normalizedRes = { ...res, type: activeType, marker_shape: activeType };
            setMarkers(prev => [...prev, normalizedRes]);
            showNotification(t("stromkreise", "successCreate" as any, "Created successfully"), "success");
        }
    } catch (e) {
        showNotification("Error creating line/arrow", "error");
    } finally {
        setLoading(false);
        setAddMode(false);
    }
  };

  const handleMoveLineArrowPoint = async (id: string, pointIndex: 1 | 2, x: number, y: number) => {
    if (!isAdmin || !isEditMode) return;
    const m = markers.find(m => m.id === id);
    if (!m) return;
    
    // Local optimistic update
    setMarkers(prev => prev.map(mm => {
      if (mm.id === id) {
        if (pointIndex === 1) {
          return { ...mm, x_norm: x, y_norm: y };
        } else {
          return { ...mm, metadata: { ...mm.metadata, x2_norm: x, y2_norm: y } };
        }
      }
      return mm;
    }));

    // Update DB
    try {
      let payload: any = {};
      if (pointIndex === 1) {
        payload = { x_norm: x, y_norm: y };
      } else {
        payload = { metadata: { ...m.metadata, x2_norm: x, y2_norm: y } };
      }
      await apiPatch(`/api/stromkreise?id=${id}`, payload);
    } catch (e) {
      console.error(e);
      showNotification("Error updating line/arrow", "error");
    }
  };

  const displayMarkers = useMemo(() => {
    const disp = markers.map(m => {
      const copy = { ...m };
      if (m.type === "line" || m.type === "arrow") {
         if (m.metadata?.x2_norm) copy.metadata = { ...copy.metadata, x2_norm: m.metadata.x2_norm };
         if (m.metadata?.y2_norm) copy.metadata = { ...copy.metadata, y2_norm: m.metadata.y2_norm };
      }
      return copy;
    });



    if (isCreating && tempCoordinates) {
      disp.push({
        id: "temp-marker-id",
        circuit_code: editCode || "1F1.?",
        short_label: editShortLabel || "?",
        full_name: editName || "Temporary",
        type: editType,
        marker_shape: ["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? "circle" : editShape,
        x_norm: tempCoordinates.x,
        y_norm: tempCoordinates.y,
        metadata: { ...editMetadata, orientation: editOrientation },
        isTemp: true,
      } as unknown as StromkreisMarker);
    }
    return disp;
  }, [markers, isCreating, tempCoordinates, editCode, editShortLabel, editName, editType, editShape, editMetadata, editOrientation]);

  return (
    <div className="min-h-screen bg-ui-bg text-ui-text p-6 md:p-10 flex flex-col">
      {/* Head */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8 mb-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase">
            {t("stromkreise", "title" as any, "Stromkreise")}
          </h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">
            {t("stromkreise", "subtitle" as any, "Management of electrical circuits on installation plans")}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4 bg-black/40 border border-white/10 px-6 py-3 rounded-md">
            <Database className="w-5 h-5 text-blue-500" />
            <select
              value={projectId}
              onChange={e => handleSelectProject(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black text-white uppercase tracking-widest outline-none cursor-pointer"
            >
              {projects.map(p => {
                const compName = p.companies?.name || companies.find(c => c.id === p.company_id)?.name;
                return (
                  <option key={p.id} value={p.id} className="bg-slate-900">
                    🏢 {compName ? compName.toUpperCase() : "GLOBAL"} / 📁 {p.name.toUpperCase()}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-black/60 border border-white/10 px-4 py-2 rounded-md">
            <Layers className="w-5 h-5 text-blue-500 shrink-0" />
            <select
              value={activePlanId}
              onChange={e => setActivePlanId(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black text-blue-400 uppercase tracking-widest outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="">-- {t("stromkreise", "selectPlan" as any, "Select Plan")} --</option>
              {plans.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {[p.floors?.buildings?.name, p.floors?.name].filter(Boolean).join(" - ") || `Plan v${p.version}`}
                </option>
              ))}
            </select>
            {activePlanId && (() => {
              const p = plans.find(plan => plan.id === activePlanId);
              const planName = [p?.floors?.buildings?.name, p?.floors?.name].filter(Boolean).join(" - ") || `Plan v${p?.version}`;
              const isFav = favoritePlans.some(f => f.id === activePlanId);
              return (
                <button
                  type="button"
                  onClick={() => toggleFavoritePlan(activePlanId, planName, projects.find(pr => pr.id === projectId)?.name)}
                  title={isFav ? t("plansPage", "removeFromFavorites", "Usuń z ulubionych") : t("plansPage", "addToFavorites", "Dodaj do ulubionych")}
                  className={`p-1.5 rounded border transition-all flex items-center justify-center shrink-0 ${
                    isFav
                      ? "bg-[#FFD000]/20 border-[#FFD000] text-[#FFD000]"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-[#FFD000]"
                  }`}
                >
                  <span className="text-xs leading-none">{isFav ? "⭐" : "☆"}</span>
                </button>
              );
            })()}
          </div>

          {/* Copy Markers Button */}
          {activePlanId && (
            <button
              type="button"
              onClick={handleOpenCopyPlanModal}
              className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white border border-blue-500/40 px-3.5 py-2.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
              title={t("stromkreise", "copyMarkersFromPlan" as any, "Kopiuj markery z innego planu...")}
            >
              <Copy className="w-3.5 h-3.5 shrink-0 text-blue-400" />
              <span>{t("stromkreise", "copyMarkersFromPlan" as any, "Kopiuj z planu")}</span>
            </button>
          )}

          {/* Snapshots Controls */}
          {activePlanId && isAdmin && (
            <div className="flex items-center gap-2">
              <select 
                className="bg-black/40 border border-white/10 px-4 py-3 rounded-md text-[10px] font-black text-white uppercase outline-none cursor-pointer"
                onChange={(e) => {
                  if (e.target.value) {
                    handleRestoreSnapshot(e.target.value);
                    e.target.value = ""; // reset
                  }
                }}
              >
                <option value="">-- Wczytaj wersję --</option>
                {snapshots.map(s => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.name} ({new Date(s.created_at).toLocaleString()})
                  </option>
                ))}
              </select>
              <button
                onClick={() => setIsSnapshotModalOpen(true)}
                className="bg-emerald-600/20 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/50 px-4 py-3 rounded-md text-[10px] font-black uppercase transition-all"
              >
                Zapisz
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Access Bar for Favorite Plans & Active Projects */}
      <div className="mb-6 p-4 rounded-xl bg-ui-card/60 backdrop-blur-2xl border border-ui-border shadow-xl space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD000] animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-ui-text">
              ⚡ {t("plansPage", "quickAccess", "Szybki dostęp")}:
            </span>
          </div>
          {projectId && (() => {
            const currentProj = projects.find(p => p.id === projectId);
            const compName = currentProj?.companies?.name || companies.find(c => c.id === currentProj?.company_id)?.name;
            return (
              <div className="text-[11px] font-bold text-ui-muted flex items-center gap-2 bg-black/30 px-3.5 py-1.5 rounded-xl border border-white/5">
                <span>{t("plansPage", "activeProject", "Aktualny projekt:")}</span>
                {compName && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-[10px] font-black border border-blue-500/30">
                    🏢 {compName.toUpperCase()}
                  </span>
                )}
                <span className="text-[#FFD000] font-black">{currentProj?.name || projectId}</span>
              </div>
            );
          })()}
        </div>

        {/* Quick projects switch buttons */}
        {projects.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted shrink-0">
              {t("plansPage", "projects", "Projekty:")}
            </span>
            {projects.map((p) => {
              const isActive = p.id === projectId;
              const compName = p.companies?.name || companies.find(c => c.id === p.company_id)?.name;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectProject(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[#FFD000]/20 border-[#FFD000] text-[#FFD000] shadow-md shadow-[#FFD000]/10"
                      : "bg-black/30 hover:bg-black/50 border-white/10 hover:border-white/20 text-ui-muted hover:text-white"
                  }`}
                >
                  {compName && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                      isActive ? "bg-[#FFD000]/30 text-[#FFD000] border-[#FFD000]/40" : "bg-white/10 text-slate-300 border-white/10"
                    }`}>
                      {compName.toUpperCase()}
                    </span>
                  )}
                  <span>📁 {p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Favorite plans chips */}
        {favoritePlans.length > 0 && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-ui-border/30 max-w-full">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FFD000] shrink-0 mr-0.5 flex items-center gap-1">
              ⭐ {t("plansPage", "favoritePlans", "Ulubione plany:")}
            </span>
            <button
              type="button"
              onClick={() => scrollFavPlans(-200)}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-ui-card/80 hover:bg-ui-card border border-ui-border text-ui-muted hover:text-ui-text text-xs shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Przewiń w lewo"
              aria-label="Przewiń w lewo"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div
              ref={favPlansRef}
              className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 flex-nowrap scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {favoritePlans.map((fav) => {
                const isCurrent = fav.id === activePlanId;
                return (
                  <div key={fav.id} className="inline-flex items-center rounded-xl bg-[#FFD000]/10 border border-[#FFD000]/30 overflow-hidden shrink-0 group leading-tight">
                    <button
                      type="button"
                      onClick={() => handleSelectFavoritePlan(fav)}
                      className={`px-3 py-1.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                        isCurrent ? "text-[#FFD000] underline font-black" : "text-ui-text hover:text-[#FFD000]"
                      }`}
                      title={fav.name}
                    >
                      <span>⭐ {fav.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavoritePlan(fav.id, fav.name)}
                      title={t("plansPage", "removeFromFavorites", "Usuń z ulubionych")}
                      className="px-2 py-1.5 text-ui-muted hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => scrollFavPlans(200)}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-ui-card/80 hover:bg-ui-card border border-ui-border text-ui-muted hover:text-ui-text text-xs shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Przewiń w prawo"
              aria-label="Przewiń w prawo"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 flex-1">
        {/* Left column - plan editor map */}
        <div className="xl:col-span-8 flex flex-col h-[70vh] xl:h-auto bg-slate-950/40 rounded-md border border-white/5 shadow-2xl relative overflow-hidden">
          {activePlanId ? (
            <>
              <StromkreiseMap
                projectId={projectId}
                planId={activePlanId}
                token={token}
                markers={displayMarkers}
                selectedMarkerId={isCreating ? "temp-marker-id" : (selectedMarker?.id || null)}
                selectedCircuitCode={selectedMarker?.circuit_code || null}
                onSelectMarker={(marker: StromkreisMarker) => {
                  setAddMode(false);
                  setSelectedMarker(marker);
                  if (marker.type === "line" || marker.type === "arrow") {
                     setEditMetadata({ x2_norm: marker.metadata?.x2_norm, y2_norm: marker.metadata?.y2_norm });
                  }
                }}
                onDeselectMarker={() => {
                  setSelectedMarker(null);
                  setIsCreating(false);
                  setTempCoordinates(null);
                }}
                onMoveMarker={handleMoveMarker}
                onMoveLineArrowPoint={handleMoveLineArrowPoint}
                onAddMarker={handleAddMarker}
                onAddLineArrow={handleAddLineArrow}
                onToggleMarkerOrientation={handleToggleMarkerOrientation}
                activeType={activeType}
                activeShape={activeShape}
                isAdmin={isAdmin}
                isEditMode={isEditMode}
                addMode={addMode}
                tempCoordinates={tempCoordinates}
                onExecutionSubmit={handleExecutionSubmit}
                onExecutionUndo={handleExecutionUndo}
                onExecutionAction={handleExecutionAction}
                onReportProblem={handleReportProblem}
                duplicateMarkerIds={duplicateEdvMarkerIds}
                collisionMarkerIds={collisionEdvMarkerIds}
              />

              {/* Top overlay: type selector + add mode button + EDV Assistant directly below */}
              {isAdmin && (
                <div className="absolute top-4 left-4 z-[1500] flex flex-col gap-2 max-w-[calc(100%-2rem)] pointer-events-auto">
                  <div className="bg-slate-950/90 backdrop-blur-md border border-white/10 p-3 rounded-md flex flex-wrap items-center gap-2 shadow-2xl">
                    {["socket", "light", "edv", "cee", "special", "reserve", "text", "line", "arrow", "sym_socket", "sym_cee16", "sym_cee32"].map(tType => (
                      <button
                        key={tType}
                        onClick={() => handleTypeChange(tType)}
                        className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all whitespace-nowrap ${activeType === tType
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                            : "bg-white/5 text-slate-400 hover:text-white"
                          }`}
                      >
                        {getTypeLabel(tType, t)}
                      </button>
                    ))}

                    {/* Add mode toggle */}
                    <button
                      onClick={() => {
                        setAddMode(prev => !prev);
                        setSelectedMarker(null);
                      }}
                      className={`ml-2 px-4 py-1.5 rounded-md text-[9px] font-black uppercase transition-all flex items-center gap-1.5 border ${addMode
                          ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 animate-pulse"
                          : "bg-white/5 text-slate-400 hover:text-white border-white/10"
                        }`}
                    >
                      {addMode ? <MousePointer className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {addMode ? t("stromkreise", "addMarker" as any, "Click to place") : t("stromkreise", "addMarker" as any, "Add Marker")}
                    </button>

                    {/* Edit mode toggle (Bearbeiten) */}
                    <button
                      type="button"
                      onClick={() => setIsEditMode(prev => !prev)}
                      className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all flex items-center gap-1.5 border ${isEditMode
                          ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30"
                          : "bg-white/5 text-slate-400 hover:text-white border-white/10"
                        }`}
                      title={
                        isEditMode
                          ? t("stromkreise", "editModeOn" as any, "Edycja i przesuwanie włączone")
                          : t("stromkreise", "editModeOff" as any, "Edycja zablokowana (kliknij, aby odblokować)")
                      }
                    >
                      <span>{isEditMode ? "🔓" : "🔒"}</span>
                      <span>{isEditMode ? t("stromkreise", "editModeActive" as any, "Edycja aktywna") : t("stromkreise", "editMode" as any, "Bearbeiten")}</span>
                    </button>

                    {/* Sequence Base Plan Selector */}
                    <div className="ml-auto flex items-center gap-2 pl-4 border-l border-white/10">
                      <span className="text-[9px] font-black text-slate-500 uppercase">
                        Numeracja {activeType === 'edv' ? 'EDV' : 'Stromkreis'} z:
                      </span>
                      {activeType === 'edv' ? (
                        <select
                          value={sequenceBasePlanId}
                          onChange={e => setSequenceBasePlanId(e.target.value)}
                          className="bg-black/50 border border-white/10 rounded px-2 py-1 text-[9px] font-black text-blue-400 outline-none cursor-pointer"
                        >
                          <option value="current">Tego planu (Domyślnie)</option>
                          <option value="all">Wszystkich planów (Projekt)</option>
                          {plans.filter(p => p.id !== activePlanId).map(p => (
                            <option key={p.id} value={p.id}>
                              Plan: {[p.floors?.buildings?.name, p.floors?.name].filter(Boolean).join(" - ") || `Plan v${p.version}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={sequenceBasePlanId}
                          onChange={e => setSequenceBasePlanId(e.target.value)}
                          className="bg-black/50 border border-white/10 rounded px-2 py-1 text-[9px] font-black text-emerald-400 outline-none cursor-pointer"
                        >
                          <option value="current">Tego planu (Domyślnie)</option>
                          <option value="all">Wszystkich planów (Projekt)</option>
                          {plans.filter(p => p.id !== activePlanId).map(p => (
                            <option key={p.id} value={p.id}>
                              Plan: {[p.floors?.buildings?.name, p.floors?.name].filter(Boolean).join(" - ") || `Plan v${p.version}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* EDV Numbering & Collision Assistant Banner directly underneath */}
                  {(activeType === "edv" || editType === "edv" || selectedMarker?.type === "edv") ? (
                    <div className="bg-slate-950/95 backdrop-blur-md border border-blue-500/30 rounded-md px-3.5 py-2.5 shadow-2xl flex flex-wrap items-center gap-3 w-fit animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <span>🖧</span> EDV Asystent
                        </span>
                        <span className="text-[10px] font-bold text-slate-300">
                          {edvAnalysis.basePlanName ? (
                            <>
                              Baza (<span className="text-blue-400 font-black">{edvAnalysis.basePlanName}</span>): koniec na <span className="font-mono text-white font-black">{edvAnalysis.baseHighestPort > 0 ? `P${edvAnalysis.baseHighestPf}.${edvAnalysis.baseHighestPort}` : "brak"}</span>
                            </>
                          ) : (
                            <>
                              Zakres planu: <span className="font-mono text-white font-black">{edvAnalysis.currentHighestPort > 0 ? `P${edvAnalysis.currentHighestPf}.1 - P${edvAnalysis.currentHighestPf}.${edvAnalysis.currentHighestPort}` : "brak"}</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
                        <span className="text-[10px] text-slate-400 font-bold">Kolejny sugerowany port:</span>
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded font-mono font-black text-xs shadow-sm">
                          {edvAnalysis.suggestedCode}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
                        {!edvAnalysis.hasCollisions ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Brak kolizji ✓</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/50 px-2.5 py-1 rounded animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              {edvAnalysis.internalDuplicates.length > 0 && `⚠️ ${edvAnalysis.internalDuplicates.length} duplikat(y) na planie! `}
                              {edvAnalysis.crossPlanCollisions.length > 0 && `⚠️ ${edvAnalysis.crossPlanCollisions.length} kolizja(e) z bazą (${edvAnalysis.basePlanName})!`}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : edvAnalysis.hasCollisions ? (
                    <button
                      type="button"
                      onClick={() => handleTypeChange("edv")}
                      className="bg-amber-950/90 backdrop-blur-md border border-amber-500/40 px-3.5 py-2 rounded-md text-amber-300 text-[10px] font-black flex items-center gap-2 shadow-2xl hover:bg-amber-900/90 transition-all cursor-pointer animate-pulse w-fit"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>⚠️ Wykryto kolizje EDV ({edvAnalysis.internalDuplicates.length + edvAnalysis.crossPlanCollisions.length}) - Kliknij tutaj, aby otworzyć asystenta EDV</span>
                    </button>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
              <Info className="w-10 h-10 text-slate-600" />
              <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest">
                {t("stromkreise", "selectPlanHint" as any, "Select a floor plan from the sidebar to begin")}
              </p>
            </div>
          )}
        </div>

        {/* Right column - sidebar controls & structure */}
        <div className="xl:col-span-4 flex flex-col gap-6 max-h-[85vh] overflow-y-auto pr-2 no-scrollbar">
          {/* Edit Marker / Add Mode panel */}
          {(selectedMarker || isCreating) && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/60 backdrop-blur-xl border border-blue-500/20 rounded-md p-6 space-y-6 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {isCreating ? t("stromkreise", "createTitle" as any, "Create Circuit") : t("stromkreise", "editTitle" as any, "Edit Circuit")}
                </h3>
                <button
                  onClick={() => {
                    setSelectedMarker(null);
                    setIsCreating(false);
                    setTempCoordinates(null);
                  }}
                  className="text-slate-400 hover:text-white bg-white/5 p-2 rounded-full border border-white/5 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isCreating && (
                <div className="space-y-3 pb-4 border-b border-white/5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">
                    Quelle / Source
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCreationSource("manual")}
                      className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider border transition-all ${
                        creationSource === "manual"
                          ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20"
                          : "bg-slate-950/60 text-slate-400 border-white/5 hover:text-white"
                      }`}
                    >
                      ● Manuell
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreationSource("uv_plan")}
                      className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider border transition-all ${
                        creationSource === "uv_plan"
                          ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20"
                          : "bg-slate-950/60 text-slate-400 border-white/5 hover:text-white"
                      }`}
                    >
                      ○ Aus UV-Plan {projectUvPlans.length > 0 ? `(${projectUvPlans.length})` : ""}
                    </button>
                  </div>

                  {creationSource === "uv_plan" && (
                    <div className="space-y-2.5 p-3 bg-blue-950/20 border border-blue-500/20 rounded-md animate-fadeIn">
                      {projectUvPlans.length === 0 ? (
                        <p className="text-[10px] text-slate-400">
                          Keine UV-Pläne im Projekt vorhanden. Sie können unter „Stromkreise von UV-Plan“ Verteilerpläne hochladen.
                        </p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-blue-300 uppercase tracking-wider block">
                              UV-Plan wählen:
                            </label>
                            <select
                              value={selectedUvPlanId}
                              onChange={e => {
                                setSelectedUvPlanId(e.target.value);
                                setSelectedUvCircuitId("");
                              }}
                              className="w-full bg-slate-950 border border-blue-500/30 rounded-md px-3 py-2 text-xs text-white font-bold outline-none cursor-pointer"
                            >
                              <option value="" className="bg-slate-950 text-slate-500">
                                -- UV-Plan auswählen --
                              </option>
                              {projectUvPlans.map(uv => (
                                <option key={uv.id} value={uv.id} className="bg-slate-950 text-white">
                                  {uv.name} ({uv.circuits?.length || 0} Stromkreise)
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedUvPlanId && (
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-blue-300 uppercase tracking-wider block">
                                Stromkreis auswählen:
                              </label>
                              <select
                                value={selectedUvCircuitId}
                                onChange={e => handleSelectUvCircuit(e.target.value)}
                                className="w-full bg-slate-950 border border-blue-500/30 rounded-md px-3 py-2 text-xs text-white font-bold outline-none cursor-pointer"
                              >
                                <option value="" className="bg-slate-950 text-slate-500">
                                  -- Stromkreis wählen --
                                </option>
                                {(projectUvPlans.find(p => p.id === selectedUvPlanId)?.circuits || []).map(c => (
                                  <option key={c.id} value={c.id} className="bg-slate-950 text-white">
                                    {c.circuit_code} – {c.breaker_curve}{c.breaker_current}A – {c.description} ({c.phases || 1}P)
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isCreating && uniqueCircuits.length > 0 && creationSource === "manual" && (
                <div className="space-y-2 pb-4 border-b border-white/5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">
                    {t("stromkreise", "duplicateSelect" as any, "Duplicate Existing Circuit / Copy data")}
                  </label>
                  <select
                    value=""
                    onChange={e => handleDuplicateSelect(e.target.value)}
                    className="w-full bg-blue-500/10 border border-blue-500/20 rounded-md px-4 py-2.5 text-xs text-blue-300 font-bold outline-none cursor-pointer hover:bg-blue-500/20 transition-all"
                  >
                    <option value="" className="bg-slate-950 text-slate-500">
                      -- Select circuit to duplicate --
                    </option>
                    {uniqueCircuits.map(uc => (
                      <option key={uc.id} value={uc.circuit_code} className="bg-slate-950 text-white">
                        {uc.circuit_code} ({uc.full_name || uc.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) ? (
                  <div className="col-span-2 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {getTypeLabel(editType, t)}
                  </div>
                ) : editType === "edv" ? (
                  <>
                    <div className="space-y-2 col-span-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        Patchfeld / Patchfield (e.g. 1)
                      </label>
                      <input
                        value={edvPatchfeld}
                        onChange={e => setEdvPatchfeld(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none focus:border-blue-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        Port 1 (e.g. 12)
                      </label>
                      <input
                        value={edvPort1}
                        onChange={e => setEdvPort1(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none focus:border-blue-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        Port 2 (Optional)
                      </label>
                      <input
                        value={edvPort2}
                        onChange={e => setEdvPort2(e.target.value)}
                        placeholder="e.g. 13"
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none focus:border-blue-500/30"
                      />
                    </div>
                    {edvDuplicateInfo && (
                      <div className="col-span-2 flex flex-col gap-2 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded text-amber-400 text-[10px] font-bold">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                          <span>{edvDuplicateInfo.message}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEdvPatchfeld(String(edvAnalysis.suggestedPf));
                            setEdvPort1(String(edvAnalysis.suggestedPort));
                            setEdvPort2("");
                          }}
                          className="self-start px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                        >
                          <span>💡 Zmień na wolny port:</span>
                          <span className="font-mono underline">{edvAnalysis.suggestedCode}</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : editType !== "text" ? (
                  <>
                    <div className="space-y-2 col-span-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("stromkreise", "circuitCode" as any, "Circuit Code")}
                      </label>
                      <input
                        value={editCode}
                        onChange={e => setEditCode(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none focus:border-blue-500/30"
                      />
                    </div>
                  </>
                ) : null}

                {!["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) && (
                  <div className="space-y-2 col-span-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                      {t("stromkreise", "fullName" as any, "Full Name")}
                    </label>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none focus:border-blue-500/30"
                    />
                  </div>
                )}
                {editType !== "edv" && !["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) && (
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                      {t("stromkreise", "shortLabel" as any, "Short Label")}
                    </label>
                    <input
                      value={editShortLabel}
                      onChange={e => setEditShortLabel(e.target.value)}
                      className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                    />
                  </div>
                )}
                <div className={`space-y-2 ${(editType === "edv" || editType === "text" || editType === "sym_socket" || editType === "sym_cee16" || editType === "sym_cee32") ? "col-span-2" : ""}`}>
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                    {t("stromkreise", "type" as any, "Type")}
                  </label>
                  <select
                    value={editType}
                    onChange={e => handleTypeChange(e.target.value, true)}
                    className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-xs text-white font-bold outline-none cursor-pointer"
                  >
                    {["socket", "light", "edv", "cee", "special", "reserve", "text", "sym_socket", "sym_cee16", "sym_cee32"].map(tType => (
                      <option key={tType} value={tType} className="bg-slate-900">
                        {getTypeLabel(tType, t)}
                      </option>
                    ))}
                  </select>
                </div>

                {editType !== "edv" && editType !== "text" && !["sym_socket", "sym_cee16", "sym_cee32"].includes(editType) && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("stromkreise", "phase" as any, "Phase")}
                      </label>
                      <select
                        value={editPhase}
                        onChange={e => setEditPhase(parseInt(e.target.value, 10))}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-xs text-white font-bold outline-none cursor-pointer"
                      >
                        <option value={1}>1-Phase</option>
                        <option value={2}>2-Phase</option>
                        <option value={3}>3-Phase</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("stromkreise", "breakerCurve" as any, "Breaker Curve")}
                      </label>
                      <input
                        value={editBreakerCurve}
                        onChange={e => setEditBreakerCurve(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("stromkreise", "breakerCurrent" as any, "Breaker Current (A)")}
                      </label>
                      <input
                        type="number"
                        value={editBreakerCurrent}
                        onChange={e => setEditBreakerCurrent(parseInt(e.target.value, 10))}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                      />
                    </div>

                    <div className="space-y-2 flex items-center justify-between col-span-2 bg-black/45 p-3 rounded-md border border-white/5 my-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        {t("stromkreise", "rcdEnabled" as any, "RCD Enabled")}
                      </label>
                      <input
                        type="checkbox"
                        checked={editHasRcd}
                        onChange={e => setEditHasRcd(e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-blue-500"
                      />
                    </div>

                    {editHasRcd && (
                      <>
                        <div className="space-y-2 col-span-2">
                          <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                            {t("stromkreise", "rcdGroup" as any, "RCD Group Label")}
                          </label>
                          <input
                            value={editRcdGroup}
                            onChange={e => setEditRcdGroup(e.target.value)}
                            placeholder="e.g. 3Q1"
                            className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                          />
                        </div>

                        <div className="space-y-2 col-span-2">
                          <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                            {t("stromkreise", "panelGroup" as any, "Panel Group")}
                          </label>
                          <input
                            value={editPanelGroup}
                            onChange={e => setEditPanelGroup(e.target.value)}
                            className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                          />
                        </div>

                        <div className="space-y-2 col-span-2">
                          <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                            UV Status (Verteilerstruktur)
                          </label>
                          <select
                            value={editUvStatus}
                            onChange={e => setEditUvStatus(e.target.value)}
                            className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                          >
                            <option value="">Standard (Bestehend)</option>
                            <option value="nachruesten">Nachrüsten (bestehender UV)</option>
                            <option value="neue">Neue UV</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                            {t("stromkreise", "rcdCurrent" as any, "RCD Current (A)")}
                          </label>
                          <input
                            type="number"
                            value={editRcdCurrent}
                            onChange={e => setEditRcdCurrent(parseInt(e.target.value, 10))}
                            className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                            {t("stromkreise", "rcdMa" as any, "RCD Limit (mA)")}
                          </label>
                          <input
                            type="number"
                            value={editRcdMa}
                            onChange={e => setEditRcdMa(parseInt(e.target.value, 10))}
                            className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                          />
                        </div>
                      </>
                    )}

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("cables", "cableType", "Kabeltyp")}
                      </label>
                      <input
                        list="cableTypesList"
                        value={editKabeltyp}
                        onChange={e => setEditKabeltyp(e.target.value)}
                        placeholder={`-- ${t("cables", "noCategory", "Bez typu")} --`}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                      />
                      <datalist id="cableTypesList">
                        {cableTypes.map(cType => (
                          <option key={cType} value={cType} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("stromkreise", "switchGroup" as any, "Switch Group")}
                      </label>
                      <input
                        value={editSwitchGroup}
                        onChange={e => setEditSwitchGroup(e.target.value)}
                        placeholder="e.g. L1"
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                        {t("stromkreise", "panelGroup" as any, "Panel Group")}
                      </label>
                      <input
                        value={editPanelGroup}
                        onChange={e => setEditPanelGroup(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-md px-4 py-3 text-sm text-white font-bold outline-none"
                      />
                    </div>
                  </>
                )}

                {selectedMarker && selectedMarkerDuplicatesCount > 1 && (
                  <div className="col-span-2 bg-slate-900/90 border border-blue-500/40 rounded-lg p-3.5 space-y-3 mt-1 shadow-lg shadow-blue-950/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-[10px] font-black text-blue-300 uppercase tracking-wider">
                          {t("stromkreise", "editScopeTitle" as any, "Zakres edycji")}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                        {selectedMarkerDuplicatesCount} duplikaty
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-md border border-white/5">
                      <button
                        type="button"
                        onClick={() => setEditSyncAllDuplicates(false)}
                        className={`py-2 px-2.5 rounded text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                          !editSyncAllDuplicates
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>👤 {t("stromkreise", "editThisMarkerOnly" as any, "Tylko ten (1)")}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditSyncAllDuplicates(true)}
                        className={`py-2 px-2.5 rounded text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                          editSyncAllDuplicates
                            ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>👥 {t("stromkreise", "syncAllDuplicates" as any, `Zmień wszystkie ({count})`).replace("{count}", String(selectedMarkerDuplicatesCount))}</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-300 leading-relaxed bg-black/20 p-2.5 rounded border border-white/5">
                      {editSyncAllDuplicates
                        ? t("stromkreise", "syncAllDuplicatesHint" as any, `Zastosuj zmiany do wszystkich {count} markerów w tej grupie duplikatów na planie.`).replace("{count}", String(selectedMarkerDuplicatesCount)).replace("{code}", selectedMarker.circuit_code)
                        : t("stromkreise", "singleMarkerEditHint" as any, `Edytujesz tylko ten 1 marker. Pozostałe {count} duplikaty na planie pozostaną bez zmian.`).replace("{count}", String(selectedMarkerDuplicatesCount - 1)).replace("{code}", selectedMarker.circuit_code)}
                    </p>
                  </div>
                )}
              </div>



              {isAdmin && (
                <div className="flex gap-4 pt-4 border-t border-white/5">
                  {isCreating ? (
                    <>
                      <button
                        onClick={() => {
                          setIsCreating(false);
                          setTempCoordinates(null);
                        }}
                        className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 rounded-md text-[9px] font-black uppercase tracking-wider transition-all"
                      >
                        {t("stromkreise", "cancel" as any, "Cancel")}
                      </button>
                      <button
                        onClick={handleCreateMarker}
                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[9px] font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t("stromkreise", "create" as any, "Create")}
                      </button>
                    </>
                  ) : selectedMarker ? (
                    <>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteMarker(selectedMarker.id)}
                          className="flex-1 py-4 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t("stromkreise", "delete" as any, "Delete")}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditCode(selectedMarker.circuit_code);
                          setEditName(selectedMarker.full_name);
                          setEditShortLabel(selectedMarker.short_label);
                          setEditType(selectedMarker.type);
                          setEditShape(selectedMarker.marker_shape);
                          setEditPhase(selectedMarker.phase);
                          setEditBreakerCurrent(selectedMarker.breaker_current);
                          setEditBreakerCurve(selectedMarker.breaker_curve);
                          setEditHasRcd(selectedMarker.has_rcd);
                          setEditRcdGroup(selectedMarker.rcd_group || "");
                          setEditRcdCurrent(selectedMarker.rcd_current || 40);
                          setEditRcdMa(selectedMarker.rcd_ma || 30);
                          setEditSwitchGroup(selectedMarker.switch_group || "");
                          setEditPanelGroup(selectedMarker.panel_group || "");

                          setIsDuplicating(true);
                          setAddMode(true);
                          setSelectedMarker(null);
                          showNotification(t("stromkreise", "duplicatedOk" as any, "Copied data! Click on the plan to place duplicate."), "success");
                        }}
                        className="flex-1 py-4 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t("stromkreise", "duplicateSelect" as any, "Duplicate")}
                      </button>
                      {!["sym_socket", "sym_cee16", "sym_cee32"].includes(selectedMarker.type) && (
                        <button
                          onClick={handleSaveEdit}
                          className={`flex-1 py-4 text-white rounded-md text-[9px] font-black uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 ${
                            editSyncAllDuplicates
                              ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20"
                              : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/20"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {editSyncAllDuplicates
                            ? t("stromkreise", "saveAllDuplicates" as any, `Zapisz wszystkie ({count})`).replace("{count}", String(selectedMarkerDuplicatesCount))
                            : selectedMarkerDuplicatesCount > 1
                              ? t("stromkreise", "saveThisMarkerOnly" as any, "Zapisz (tylko ten marker)")
                              : t("stromkreise", "save" as any, "Save")}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </motion.div>
          )}

          {/* Add Mode Hint Panel */}
          {addMode && !selectedMarker && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-900/30 border border-emerald-500/20 rounded-md p-4 flex items-center gap-3"
            >
              <MousePointer className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                {t("stromkreise", "addMarker" as any, "Click on map to place marker")} — {getTypeLabel(activeType, t)}
              </p>
            </motion.div>
          )}

          {/* Validation Panel */}
          <div className="bg-slate-900/40 border border-white/5 rounded-md p-6 space-y-4">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
              {t("stromkreise", "validationTitle" as any, "Validations")}
            </h3>
            {validationErrors.length > 0 ? (
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 no-scrollbar">
                {validationErrors.map((err, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 p-2.5 rounded-md text-red-400 text-[10px] font-bold">
                    <span className="shrink-0 font-bold">•</span>
                    <span className="leading-relaxed">{err}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-md text-emerald-400 text-[10px] font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t("stromkreise", "statusOk" as any, "All configurations are valid")}</span>
              </div>
            )}
          </div>

          {/* Verteilerstruktur grouped FI/RCD */}
          <div className="bg-slate-900/40 border border-white/5 rounded-md p-6 space-y-4 flex flex-col h-auto">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              {t("stromkreise", "verteilerstruktur" as any, "Verteilerstruktur")}
            </h3>

            <div className="space-y-4 pr-1">
              {verteilerstruktur.map((g, idx) => (
                <div key={g.name || idx} className="bg-black/20 border border-white/5 rounded-md p-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-3">
                    <span className="text-[11px] font-black text-blue-400 uppercase">
                      {g.name.includes("__no_rcd__") ? g.name.replace("__no_rcd__", t("stromkreise", "rcdNoRcd" as any, "Ohne RCD / FI")) : g.name}
                    </span>
                    {!g.name.includes("__no_rcd__") && (g.current || g.ma) && (
                      <span className="text-[8px] font-black text-slate-500 uppercase">
                        FI: {g.current}A / {g.ma}mA
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 pl-2 border-l border-slate-700/60 ml-2">
                    {g.breakers.map((b, bIdx) => (
                      <div key={b.id || bIdx} 
                           onClick={() => setSelectedMarker(b)}
                           className="text-[10px] leading-relaxed bg-black/10 border border-white/5 p-2 rounded-md cursor-pointer hover:bg-white/5 hover:border-white/10 transition-all">
                        <div className="flex justify-between items-center bg-slate-100 p-2 rounded text-xs border border-slate-200">
                          <span className="font-mono text-slate-700 font-bold">{b.circuit_code}</span>
                          <span className="text-slate-500 font-bold">({formatSicherung(b.breaker_curve, b.phase, b.breaker_current)})</span>
                        </div>
                        <div className="flex justify-between items-center mt-1.5 gap-2">
                          <div className="text-[9px] font-bold text-slate-400 uppercase truncate flex-1" title={b.full_name}>{b.full_name}</div>
                          {isAdmin && (
                            <select
                              value={b.metadata?.uv_status || ""}
                              onChange={async (e) => {
                                const val = e.target.value;
                                const updatedMetadata = { ...(b.metadata || {}), uv_status: val || undefined };
                                
                                // Update local state immediately for instant feedback
                                setMarkers(prev => prev.map(mm => mm.id === b.id ? { ...mm, metadata: updatedMetadata } : mm));
                                
                                try {
                                  await apiPatch(`/api/stromkreise?id=${b.id}`, { metadata: updatedMetadata });
                                  showNotification("UV status updated", "success");
                                } catch (err) {
                                  console.error(err);
                                  showNotification("Failed to update status", "error");
                                }
                              }}
                              className="bg-slate-800 text-[8px] text-slate-300 font-bold border border-white/10 rounded px-1 py-0.5 outline-none hover:border-slate-500 transition-all cursor-pointer"
                            >
                              <option value="">Standard</option>
                              <option value="nachruesten">Nachrüsten</option>
                              <option value="neue">Neue UV</option>
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {markers.filter(m => m.type !== "edv").length === 0 && (
                <p className="text-[10px] text-slate-500 font-bold uppercase text-center py-6">
                  {t("stromkreise", "noMarkers" as any, "No circuit markers placed on this plan yet.")}
                </p>
              )}
            </div>
          </div>

          {/* EDV Patchfeld-Belegungsplan */}
          <div className="bg-slate-900/40 border border-white/5 rounded-md p-6 space-y-4 flex flex-col h-auto">
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              EDV Patchfeld-Belegungsplan
            </h3>

            <div className="space-y-4 pr-1">
              {edvStructure.map((g, idx) => (
                <div key={g.name || idx} className="bg-black/20 border border-white/5 rounded-md p-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-3">
                    <span className="text-[11px] font-black text-emerald-400 uppercase">{g.name}</span>
                  </div>

                  <div className="space-y-3 pl-2 border-l border-slate-700/60 ml-2">
                    {g.breakers.map((b, bIdx) => {
                      const isDup = duplicateEdvMarkerIds.has(b.id);
                      return (
                        <div key={b.id || bIdx} 
                             onClick={() => setSelectedMarker(b)}
                             className={`text-[10px] leading-relaxed bg-black/10 border ${isDup ? 'border-red-500/60 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'border-white/5'} p-2 rounded-md cursor-pointer hover:bg-white/5 hover:border-white/10 transition-all`}>
                          <div className={`flex justify-between items-center ${isDup ? 'bg-red-50 border-red-300' : 'bg-slate-100 border-slate-200'} p-2 rounded text-xs border`}>
                            <span className={`font-mono ${isDup ? 'text-red-700 font-black' : 'text-slate-700 font-bold'}`}>{b.circuit_code}</span>
                            <div className="flex items-center gap-1.5">
                              {isDup && (
                                <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                                  Duplikat
                                </span>
                              )}
                              <span className={`${isDup ? 'text-red-600 font-bold' : 'text-slate-500 font-bold'}`}>(Port: {b.short_label})</span>
                            </div>
                          </div>
                          <div className={`text-[9px] font-bold ${isDup ? 'text-red-400' : 'text-slate-400'} uppercase mt-1.5 flex items-center justify-between`}>
                            <span>{b.full_name}</span>
                            {isDup && <span className="text-[8px] text-red-400 lowercase italic">powtórzony port</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {markers.filter(m => m.type === "edv").length === 0 && (
                <p className="text-[10px] text-slate-500 font-bold uppercase text-center py-6">
                  Keine EDV-Marker na tym planie.
                </p>
              )}
            </div>
          </div>

          {/* Export Actions Panel */}
          {activePlanId && (
            <div className="bg-slate-900/40 border border-white/5 rounded-md p-6 space-y-4">
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                {t("stromkreise", "exportActions" as any, "PDF Export")}
              </h3>

              <div className="flex items-center justify-between bg-black/45 p-3 rounded-md border border-white/5 my-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                  Tryb debugowania PDF (Pokaż współrzędne)
                </label>
                <input
                  type="checkbox"
                  checked={debugPdf}
                  onChange={e => setDebugPdf(e.target.checked)}
                  className="w-4 h-4 cursor-pointer accent-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleExportVectorPdf}
                  disabled={isExportingPdf}
                  className="w-full py-4 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  {isExportingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {t("stromkreise", "exportPdf" as any, "Export Vector PDF")}
                </button>

                <button
                  onClick={handleExportTablePdf}
                  disabled={isExportingTable}
                  className="w-full py-4 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  {isExportingTable ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {t("stromkreise", "exportTablePdf" as any, "Export Sicherungsbelegungsplan")}
                </button>

                <button
                  onClick={handleExportFIStructPdf}
                  disabled={isExportingFI}
                  className="w-full py-4 bg-purple-600/10 hover:bg-purple-600 text-purple-400 hover:text-white border border-purple-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  {isExportingFI ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {t("stromkreise", "exportFIStructPdf" as any, "Export Verteilerstruktur")}
                </button>

                <button
                  onClick={handleExportEdvPdf}
                  disabled={isExportingEdv}
                  className="w-full py-4 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  {isExportingEdv ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  Export EDV Patchfeld-Belegungsplan
                </button>

                {isAdmin && (
                  <button
                    onClick={handleTriggerAi}
                    disabled={isTriggeringAi}
                    className="w-full mt-4 py-4 bg-yellow-600/10 hover:bg-yellow-600 text-yellow-400 hover:text-white border border-yellow-500/20 hover:border-transparent rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    {isTriggeringAi ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Stromkreise Automatik (AI)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PDF import panel */}
          {activePlanId && (
            <div className="bg-slate-900/40 border border-white/5 rounded-md p-6 space-y-4">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-500" />
                {t("stromkreise", "importTitle" as any, "Schaltplan hochladen (PDF)")}
              </h3>

              <label className="border-2 border-dashed border-white/10 hover:border-blue-500/30 bg-white/[0.01] hover:bg-white/[0.03] transition-all p-8 rounded-md flex flex-col items-center justify-center gap-3 cursor-pointer text-center relative overflow-hidden">
                {uploading ? (
                  <>
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parsing Schematic...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-blue-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {t("stromkreise", "importPrompt" as any, "Drag & drop PDF or browse")}
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleSchematicUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>

              {parsedProposals.length > 0 && (
                <div className="space-y-3 bg-black/25 p-4 rounded-md border border-white/5 max-h-[250px] overflow-y-auto pr-1 no-scrollbar">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-wider mb-2">Imported Proposals</p>
                  {parsedProposals.map((prop, pIdx) => (
                    <div key={pIdx} className="bg-white/[0.02] border border-white/5 p-3 rounded-md flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-white">{prop.name}</span>
                          <span className="text-[8px] font-black text-slate-500">({prop.characteristic}{prop.rating}A)</span>
                        </div>
                        <p className="text-[9px] font-bold text-slate-500 truncate mt-0.5">{prop.description}</p>
                      </div>

                      {isAdmin && (
                        <button
                          onClick={async () => {
                            const shape = "triangle";
                            const payload = {
                              project_id: projectId,
                              plan_id: activePlanId,
                              circuit_code: prop.name,
                              short_label: prop.name.split(".").pop() || "1",
                              full_name: prop.description || "Schematic Import",
                              type: "socket",
                              marker_shape: shape,
                              phase: prop.phases || 1,
                              breaker_current: prop.rating || 16,
                              breaker_curve: prop.characteristic || "B",
                              has_rcd: !!prop.rcd,
                              rcd_group: prop.rcd ? "3Q1" : null,
                              rcd_current: prop.rcd ? 40 : null,
                              rcd_ma: prop.rcd ? 30 : null,
                              x_norm: 0.5,
                              y_norm: 0.5,
                            };
                            try {
                              const cre = await apiPost("/api/stromkreise", payload);
                              if (cre) {
                                showNotification(`Created marker for ${prop.name}`, "success");
                                loadMarkers();
                              }
                            } catch (e: any) {
                              showNotification(e.message, "error");
                            }
                          }}
                          className="bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all"
                        >
                          Place
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Snapshot Modal */}
      {isSnapshotModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-black text-white mb-4">Zapisz jako nową wersję</h3>
            <input
              type="text"
              value={snapshotName}
              onChange={e => setSnapshotName(e.target.value)}
              placeholder="np. Wersja z opisem 1"
              className="w-full bg-slate-950 border border-white/10 rounded-md px-4 py-3 text-white text-sm outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-4">
              <button
                onClick={() => setIsSnapshotModalOpen(false)}
                className="flex-1 bg-slate-800 text-white font-bold py-3 rounded-md"
              >
                Anuluj
              </button>
              <button
                onClick={() => handleCreateSnapshot(snapshotName)}
                disabled={!snapshotName.trim()}
                className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-md disabled:opacity-50"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Markers from Plan Modal */}
      {isCopyPlanModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-blue-500/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white tracking-wide">
                    {t("stromkreise", "copyPlanModalTitle" as any, "Kopiuj markery z innego planu")}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {t("stromkreise", "copyPlanModalDesc" as any, "Przenieś lub skopiuj markery ze wskazanego planu na aktywny plan.")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCopyPlanModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target & Source Plan Info */}
            <div className="space-y-4 text-xs">
              {/* Target Plan (Current) */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-0.5">
                    Plan docelowy (Bieżący):
                  </span>
                  <span className="font-bold text-white text-sm">
                    {(() => {
                      const p = plans.find(plan => plan.id === activePlanId);
                      return [p?.floors?.buildings?.name, p?.floors?.name].filter(Boolean).join(" - ") || `Plan v${p?.version}`;
                    })()}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 font-black text-[11px] border border-blue-500/30">
                  {markers.length} {markers.length === 1 ? "marker" : "markerów"}
                </span>
              </div>

              {/* Source Plan Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                    {t("stromkreise", "sourcePlan" as any, "Wybierz plan źródłowy (z którego pobrać markery):")}
                  </label>
                  {isLoadingCounts && (
                    <span className="text-[10px] text-blue-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Sprawdzanie markerów...
                    </span>
                  )}
                </div>
                <select
                  value={selectedSourcePlanId}
                  onChange={e => setSelectedSourcePlanId(e.target.value)}
                  className="w-full bg-slate-950 border border-white/20 focus:border-blue-500 rounded-xl px-4 py-3 text-white text-xs outline-none cursor-pointer transition-all"
                >
                  <option value="">-- {t("stromkreise", "selectSourcePlan" as any, "Wybierz plan źródłowy...")} --</option>
                  {plans
                    .filter(p => p.id !== activePlanId)
                    .map(p => {
                      const name = [p.floors?.buildings?.name, p.floors?.name].filter(Boolean).join(" - ") || `Plan v${p.version}`;
                      const count = planMarkersCountMap[p.id] ?? 0;
                      return (
                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                          {name} ({count} {count === 1 ? "marker" : "markerów"})
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Copy Mode */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">
                  {t("stromkreise", "copyMode" as any, "Tryb kopiowania:")}
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    copyPlanMode === "replace"
                      ? "bg-blue-600/15 border-blue-500/60 text-white"
                      : "bg-black/30 border-white/5 text-slate-400 hover:border-white/20"
                  }`}>
                    <input
                      type="radio"
                      name="copyPlanMode"
                      value="replace"
                      checked={copyPlanMode === "replace"}
                      onChange={() => setCopyPlanMode("replace")}
                      className="mt-0.5 accent-blue-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-white text-xs">
                        {t("stromkreise", "copyModeReplace" as any, "Zastąp markery na aktywnym planie (Zalecane przy nowej rewizji)")}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Tworzy pełny automatyczny backup obecnych markerów planu docelowego i wstawia markery ze źródła na identycznych pozycjach.
                      </div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    copyPlanMode === "append"
                      ? "bg-blue-600/15 border-blue-500/60 text-white"
                      : "bg-black/30 border-white/5 text-slate-400 hover:border-white/20"
                  }`}>
                    <input
                      type="radio"
                      name="copyPlanMode"
                      value="append"
                      checked={copyPlanMode === "append"}
                      onChange={() => setCopyPlanMode("append")}
                      className="mt-0.5 accent-blue-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-white text-xs">
                        {t("stromkreise", "copyModeAppend" as any, "Dodaj do istniejących markerów (Scalenie)")}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Tworzy automatyczny backup i dokłada markery z planu źródłowego bez usuwania obecnych.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Safety guarantee banner */}
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-300 leading-relaxed">
                  <span className="font-bold block mb-0.5">🛡️ Gwarancja bezpieczeństwa danych (Zasada nadrzędna):</span>
                  {t("stromkreise", "safetyGuarantee" as any, "Twój plan źródłowy nie zostanie w żaden sposób zmodyfikowany ani usunięty. Przed wykonaniem jakichkolwiek zmian tworzona jest pełna kopia zapasowa (Snapshot) w bazie danych.")}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCopyPlanModalOpen(false)}
                disabled={isCopyingPlanMarkers}
                className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl text-xs transition-colors border border-white/10 cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleExecuteCopyMarkers}
                disabled={!selectedSourcePlanId || isCopyingPlanMarkers}
                className="flex-[1.5] bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-xs transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCopyingPlanMarkers ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t("stromkreise", "copying" as any, "Kopiowanie...")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{t("stromkreise", "copyButton" as any, "Kopiuj markery (Backup i Kopiuj)")}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
