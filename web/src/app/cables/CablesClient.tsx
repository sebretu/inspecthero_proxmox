"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";
import Link from "next/link";

const CableMapModal = dynamic(() => import("@/components/CableMapModal").then(m => ({ default: m.CableMapModal })), { ssr: false });
const TrommelPanel = dynamic(() => import("@/components/TrommelPanel").then(m => ({ default: m.TrommelPanel })), { ssr: false });
const CableDrawer = dynamic(() => import("@/components/CableDrawer").then(m => ({ default: m.CableDrawer })), { ssr: false });
const CableRouteMapPicker = dynamic(() => import("@/components/CableRouteMapPicker").then(m => ({ default: m.CableRouteMapPicker })), { ssr: false });
const CableRoutesList = dynamic(() => import("@/components/CableRoutesList").then(m => ({ default: m.CableRoutesList })), { ssr: false });
const QrScanner = dynamic(() => import("@/components/QrScanner").then(m => ({ default: m.QrScanner })), { ssr: false });
const BulkTrommelReportModal = dynamic(() => import("@/components/BulkTrommelReportModal"), { ssr: false });
const AdvancedCableAdderModal = dynamic(() => import("@/components/AdvancedCableAdderModal").then(m => ({ default: m.AdvancedCableAdderModal })), { ssr: false });
import { CableCategoriesModal } from "@/components/CableCategoriesModal";
import { SerialCableAdderModal } from "@/components/SerialCableAdderModal";
import { CategoryMapModal } from "@/components/CategoryMapModal";
import { normalizeCableType } from "@/lib/cableUtils";
import { TrommelVisual } from "@/components/TrommelVisual";
import { Et4uLogo } from "@/components/Et4uLogo";
import { motion } from "framer-motion";
import { 
  Cable, 
  Unplug, 
  RefreshCcw, 
  CheckCircle2, 
  Archive, 
  Truck, 
  ShieldCheck, 
  Scissors, 
  Search, 
  Map as MapIcon, 
  Plus, 
  Layers,
  Camera,
  LayoutGrid,
  ClipboardList,
  ChevronRight,
  Filter
} from "lucide-react";

const COLORS = ["#38bdf8","#f97316","#a78bfa","#34d399","#fb7185","#fbbf24","#60a5fa","#f472b6","#4ade80","#e879f9"];


type CableStatus = "pending" | "in_progress" | "pending_approval" | "done";
type Cable = {
  id: string; name: string; index_number: number | null; length: number | null; status: CableStatus;
  cable_type: string | null; route_id: string | null; trommel_id: string | null; category_id: string | null; created_at: string;
  is_verified?: boolean;
  cable_routes?: {
    id: string; name: string | null; point_a_label: string; point_b_label: string;
    plan_id?: string | null; point_a_x?: number | null; point_a_y?: number | null;
    point_b_x?: number | null; point_b_y?: number | null;
    waypoints?: any[] | null;
    plan_id_2?: string | null; point_c_x?: number | null; point_c_y?: number | null;
    point_d_x?: number | null; point_d_y?: number | null;
    waypoints_2?: any[] | null;
    scale?: number | null;
    scale_2?: number | null;
    point_a_photo?: string | null;
    point_b_photo?: string | null;
  } | null;
  trommels?: { id: string; name: string; index_number?: number | null; total_length: number | null } | null;
  reported_profile?: { id: string; full_name: string } | null;
};
type Project = { id: string; name: string; companies?: { name: string } | null };
type Route = {
  id: string; name: string | null; point_a_label: string; point_b_label: string;
  plan_id?: string | null; point_a_x?: number | null; point_a_y?: number | null;
  point_b_x?: number | null; point_b_y?: number | null;
  waypoints?: any[] | null;
  plan_id_2?: string | null; point_c_x?: number | null; point_c_y?: number | null;
  point_d_x?: number | null; point_d_y?: number | null;
  waypoints_2?: any[] | null;
  scale?: number | null;
  scale_2?: number | null;
  point_a_photo?: string | null;
  point_b_photo?: string | null;
};
type Trommel = { id: string; name: string; index_number?: number | null; total_length: number | null; cable_type?: string | null; used_length?: number; remaining_length?: number | null; remnant_length?: number | null; cables?: any[]; photo_url?: string | null; company_name?: string | null; serial_number?: string | null; diameter?: number | null; status?: "pending" | "delivered" | "empty" | "pickup_requested" | "picked_up"; pickup_requested_at?: string | null; pickup_requested_email_sent?: boolean; picked_up_at?: string | null; pickup_email_sent?: boolean; updated_at?: string; is_archived?: boolean; };
type Category = { id: string; project_id: string; name: string; plan_id?: string | null; point_a_x?: number; point_a_y?: number; point_a_label?: string; };

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:          { bg: "rgba(107,114,128,0.15)", color: "#9ca3af",  label: "⬜ Oczekuje" },
  in_progress:      { bg: "rgba(59,130,246,0.15)",  color: "#93c5fd",  label: "🔵 W trakcie" },
  pending_approval: { bg: "rgba(245,158,11,0.2)",   color: "#fbbf24",  label: "🟡 Do zatwierdzenia" },
  done:             { bg: "rgba(34,197,94,0.15)",   color: "#86efac",  label: "✅ Wykonany" },
};

export default function CablesClient() {
  const { t } = useLanguage();
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAdmin = (userRole || "").toUpperCase() === "ADMIN";
  const isMod = isAdmin;
  const [token, setToken] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [cables, setCables] = useState<Cable[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [trommels, setTrommels] = useState<Trommel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(""); const [qD, setQD] = useState("");
  const [globalCableTypes, setGlobalCableTypes] = useState<string[]>([]);
  const [qT, setQT] = useState(""); const [qTD, setQTD] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [hasMore, setHasMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    // Infinite scroll disabled as per request to load all at once
  }, []);

  const [mapCable, setMapCable] = useState<Cable | null>(null);
  const [selectedTrommel, setSelectedTrommel] = useState<Trommel | null>(null);
  const [selectedCable, setSelectedCable] = useState<Cable | null>(null);
  const [routeToEdit, setRouteToEdit] = useState<Cable | null>(null);
  const [showAdvancedAdder, setShowAdvancedAdder] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showSerialAdderModal, setShowSerialAdderModal] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentTargetCable, setAssignmentTargetCable] = useState<Cable | null>(null);
  const [suggestedTrommelId, setSuggestedTrommelId] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const [showTrommelsList, setShowTrommelsList] = useState(false);
  const [showTrommelForm, setShowTrommelForm] = useState(false);
  const [newTrName, setNewTrName] = useState(""); const [newTrLen, setNewTrLen] = useState(""); const [newTrType, setNewTrType] = useState("");
  const [newTrCompany, setNewTrCompany] = useState(""); const [newTrSerial, setNewTrSerial] = useState(""); const [newTrDiameter, setNewTrDiameter] = useState(""); const [newTrPhoto, setNewTrPhoto] = useState<string | null>(null);
  const [newTrPhotoName, setNewTrPhotoName] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingScan, setPendingScan] = useState<{ type: string; id: string } | null>(null);
  const [publicItemInfo, setPublicItemInfo] = useState<any | null>(null);
  const [publicSearch, setPublicSearch] = useState("");
  const [publicSearching, setPublicSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<"cables" | "trommels" | "picked_up" | "archive" | "control" | "logistics" | "remnants" | "unassigned">("cables");
  const [verificationSearch, setVerificationSearch] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [lastVerifiedCable, setLastVerifiedCable] = useState<Cable | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<Cable | null>(null);
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [isBulkReportModalOpen, setIsBulkReportModalOpen] = useState(false);
  const [selectedTrommels, setSelectedTrommels] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [mapCategory, setMapCategory] = useState<any | null>(null);
  const [trommelInitialEditing, setTrommelInitialEditing] = useState(false);

  const findBestTrommel = useCallback((cable: Cable) => {
    if (!cable.cable_type || !cable.length || !cable.cable_routes?.point_b_label) return null;
    
    const normType = normalizeCableType(cable.cable_type);
    const candidates = trommels.filter(t => normalizeCableType(t.cable_type) === normType && t.status !== "picked_up" && t.status !== "empty" && !t.is_archived);
    if (candidates.length === 0) return null;

    const scored = candidates.map(tr => {
        const trCables = cables.filter(c => c.trommel_id === tr.id);
        const used = trCables.reduce((sum, c) => sum + (c.length || 0), 0);
        const remaining = (tr.total_length || 0) - used;
        
        if (remaining < (cable.length || 0)) return { tr, score: -10000 };

        let score = 0;
        const hasSameDest = trCables.some(c => c.cable_routes?.point_b_label === cable.cable_routes?.point_b_label);
        if (hasSameDest) score += 100;
        
        const destinations = new Set(trCables.map(c => c.cable_routes?.point_b_label).filter(Boolean));
        if (destinations.size > 0 && !destinations.has(cable.cable_routes?.point_b_label)) {
            score -= 50;
        }

        return { tr, score };
    });

    const best = scored.sort((a, b) => b.score - a.score)[0];
    return (best && best.score > -1000) ? best.tr.id : null;
  }, [trommels, cables]);


  useEffect(() => {
    const t = setTimeout(() => setQD(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const handlePublicSearch = useCallback(async (searchVal: string) => {
    if (!searchVal) return;
    setPublicSearching(true);
    try {
      const { data: cable } = await supabase.from("cables").select("*, cable_routes(*)").eq("index_number", parseInt(searchVal)).single();
      if (cable) {
        setPublicItemInfo({ ...cable, type: "cable" });
        setPublicSearch("");
        setPublicSearching(false);
        return;
      }

      const { data: trommel, error: trErr } = await supabase.from("trommels").select("*").eq("index_number", parseInt(searchVal)).single();
      if (trErr) console.log("[publicSearch] trommel query error:", trErr);
      if (trommel) {
        if (trommel.status === "picked_up") {
          setPublicItemInfo({ type: "inactive" });
          setPublicSearch("");
          setPublicSearching(false);
          return;
        }
        const { data: cables, error: cErr } = await supabase.from("cables").select("*, cable_routes(*)").eq("trommel_id", trommel.id);
        if (cErr) console.log("[publicSearch] trommel cables query error:", cErr);
        setPublicItemInfo({ ...trommel, type: "trommel", cables: cables || [] });
        setPublicSearch("");
        setPublicSearching(false);
        return;
      }

      alert(t("cables", "publicSearchNotFound", "Nie znaleziono elementu o tym numerze."));
    } catch {
      alert(t("cables", "publicSearchError", "Błąd podczas wyszukiwania."));
    } finally {
      setPublicSearching(false);
    }
  }, [t]);

  useEffect(() => {
    const t = setTimeout(() => setQTD(qT), 300);
    return () => clearTimeout(t);
  }, [qT]);
  
  // Handle URL QR scan
  // Handle initial scan from URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams((window as any).location.search);
    const type = params.get("scan_type");
    const id = params.get("scan_id");
    const name = params.get("name");
    const indexNumber = params.get("index_number");

    // If we have an ID and name, we can show public info immediately
    // For admins, we prefer the internal panel (handled below in checkGlobal)
    if (name && (!token || !isAdmin)) {
      setPublicItemInfo({ type: type || "cable", name, index_number: indexNumber ? parseInt(indexNumber) : null });
      // If we have an ID, fetch full details including cables for trommel
      if (id) {
        (async () => {
          try {
            if (type === "trommel") {
              const { data: trommel } = await supabase.from("trommels").select("*").eq("id", id).single();
              const { data: cables } = await supabase.from("cables").select("*, cable_routes(*)").eq("trommel_id", id);
              if (trommel) {
                if (trommel.status === "picked_up") {
                  setPublicItemInfo({ type: "inactive" });
                  if (typeof window !== "undefined") {
                    window.history.replaceState({}, document.title, "/");
                  }
                  return;
                }
                setPublicItemInfo({ ...trommel, type: "trommel", cables: cables || [] });
              } else {
                setPublicItemInfo((prev: any) => ({ ...prev, id, cables: cables || [] }));
              }
            } else if (type === "cable") {
              const { data: cable } = await supabase.from("cables").select("*, cable_routes(*)").eq("id", id).single();
              if (cable) setPublicItemInfo({ ...cable, type: "cable" });
            }
          } catch (err) {
            console.error("[URL scan] Error fetching details:", err);
          }
        })();
      }
    }

    if (!type || !id) return;

    // Clear params immediately to avoid re-running this effect
    (window as any).history.replaceState({}, document.title, (window as any).location.pathname);

    async function checkGlobal() {
      // If we don't have a role yet but have a token, we might need to wait
      // But if we have no token, we are definitely NOT an admin
      if (token && userRole === null) return; 

      if (!isAdmin) return; // Non-admins use the public view handled above

      const table = type === "cable" ? "cables" : "trommels";
      const { data } = await supabase.from(table).select("*").eq("id", id).single();
      if (data) {
        if (type === "trommel" && (data as any).status === "picked_up") {
          setPublicItemInfo({ type: "inactive" });
          if (typeof window !== "undefined") {
            window.history.replaceState({}, document.title, "/");
          }
          return;
        }
        if (data.project_id !== projectId) {
          setProjectId(data.project_id);
          localStorage.setItem("selectedProjectId", data.project_id);
          setPendingScan({ type: type!, id: id! });
          setQ(""); setQD(""); setStatusFilter("");
        } else {
          setPendingScan({ type: type!, id: id! });
          setQ(""); setQD(""); setStatusFilter("");
        }
      }
    }
    checkGlobal();
  }, [projects, userRole]);

  // Handle URL QR scan (deprecated - handled by checkGlobal above, but kept for immediate action if already loaded)
  useEffect(() => {
    if (cables.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams((window as any).location.search);
      if (params.get("scan_type") === "cable" && params.get("scan_id")) {
        const id = params.get("scan_id")!;
        const c = cables.find(x => x.id === id);
        if (c) {
          setSelectedCable(c);
          if (c.cable_routes?.plan_id && c.cable_routes.point_a_x != null) setMapCable(c);
          (window as any).history.replaceState({}, document.title, (window as any).location.pathname);
        }
      }
    }
  }, [cables]);

  useEffect(() => {
    if (trommels.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams((window as any).location.search);
      if (params.get("scan_type") === "trommel" && params.get("scan_id")) {
        const id = params.get("scan_id")!;
        const cable = cables.find(c => c.id === id);
        if (cable) {
          setSelectedCable(cable);
          (window as any).history.replaceState({}, document.title, (window as any).location.pathname);
        }
      }
    }
  }, [trommels]);

  // Handle pending scan after project switch
  useEffect(() => {
    if (!pendingScan) return;
    if (pendingScan.type === "cable") {
      const c = cables.find(x => x.id === pendingScan.id);
      if (c) {
        setSelectedCable(c);
        if (c.cable_routes?.plan_id && c.cable_routes.point_a_x != null) setMapCable(c);
        setPendingScan(null);
      }
    } else if (pendingScan.type === "trommel") {
      const t = trommels.find(x => x.id === pendingScan.id);
      if (t) {
        setSelectedTrommel(t);
        setPendingScan(null);
      }
    }
  }, [cables, trommels, pendingScan]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data?.session?.access_token || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setToken(s?.access_token || null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let alive = true;
    async function loadRole() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        const j = await apiGet<any>("/api/me");
        if (alive) {
          setUserRole(j?.profile?.role || "USER");
        }
      } catch (err: any) {
        if (alive) {
          setUserRole(null);
        }
      }
    }
    loadRole();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!token) return;
    apiGet<Project[]>("/api/projects").then(ps => {
      setProjects(ps || []);
      const saved = typeof window !== "undefined" ? localStorage.getItem("selectedProjectId") : null;
      setProjectId((saved && (ps || []).find(p => p.id === saved)?.id) || ps?.[0]?.id || "");
    }).catch(() => {});
  }, [token]);

  const loadCables = useCallback(async () => {
    if (!projectId || !token) return;
    setLoading(true);
    try {
      // Load 2000 cables at once to avoid infinite scroll
      const p = new URLSearchParams({ projectId, limit: "2000", offset: "0" });
      if (qD) p.set("q", qD);
      const data = await apiGet<Cable[]>(`/api/cables?${p}`) || [];
      setCables(data);
      setHasMore(false);
    } catch {
    } finally { 
      setLoading(false); 
    }
  }, [projectId, qD, token]);

  const loadTrommels = useCallback(() => {
    if (!projectId || !token) return;
    const cacheBuster = `&_t=${Date.now()}`;
    apiGet<Trommel[]>(`/api/trommels?projectId=${projectId}${cacheBuster}`).then(d => setTrommels(d || [])).catch(() => {});
  }, [projectId, token]);

  async function handleBulkReport() {
    if (selectedTrommels.size === 0) return;
    setIsBulkReportModalOpen(true);
  }

  async function handleBulkArchive() {
    if (selectedTrommels.size === 0) return;
    if (!confirm(t("cables", "confirmMoveToArchive", "Przenieść wybrane bębny do archiwum?"))) return;
    
    setLoading(true);
    try {
      const ids = Array.from(selectedTrommels);
      for (const id of ids) {
        await apiPatch<any>("/api/trommels", { id, is_archived: true });
      }
      setSelectedTrommels(new Set());
      loadTrommels();
    } catch (e: any) {
      alert(e?.message || "Błąd podczas archiwizacji");
    } finally {
      setLoading(false);
    }
  }

  const loadRoutes = useCallback(() => {
    if (!projectId) return;
    apiGet<Route[]>(`/api/cable-routes?projectId=${projectId}`).then(d => setRoutes(d || [])).catch(() => {});
  }, [projectId]);

  const loadCategories = useCallback(() => {
    if (!projectId) return;
    apiGet<Category[]>(`/api/cable-categories?projectId=${projectId}`).then(d => setCategories(d || [])).catch(() => {});
  }, [projectId]);

  const loadGlobalCableTypes = useCallback(() => {
    if (!token) return;
    apiGet<string[]>("/api/cable-types").then(d => setGlobalCableTypes(d || [])).catch(() => {});
  }, [token]);

  useEffect(() => { loadCables(); }, [loadCables]);
  useEffect(() => { loadTrommels(); loadRoutes(); loadCategories(); loadGlobalCableTypes(); }, [loadTrommels, loadRoutes, loadCategories, loadGlobalCableTypes]);
  const cableTypes = useMemo(() => {
    const fromCables = cables.map(c => c.cable_type).filter(Boolean);
    const fromTrommels = trommels.map(t => t.cable_type).filter(Boolean);
    const all = new Set([...fromCables, ...fromTrommels, ...globalCableTypes]);
    return Array.from(all).sort() as string[];
  }, [cables, trommels, globalCableTypes]);

  const groupedCables = useMemo(() => {
    let filtered = [...cables];
    if (activeTab === "unassigned") {
      filtered = filtered.filter(c => !c.trommel_id);
    }
    if (statusFilter) {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    if (verifiedFilter === "verified") {
      filtered = filtered.filter(c => c.is_verified);
    } else if (verifiedFilter === "unverified") {
      filtered = filtered.filter(c => !c.is_verified);
    }

    const groups: { categoryId: string | null; name: string; cables: Cable[] }[] = [];
    
    // 1. Group "Bez kategorii"
    const noCat = filtered.filter(c => !c.category_id);
    groups.push({ categoryId: "none", name: t("cables", "noCategory", "Bez kategorii"), cables: noCat });

    // 2. Group by each category
    categories.forEach(cat => {
      const catCables = filtered.filter(c => c.category_id === cat.id);
      groups.push({ categoryId: cat.id, name: cat.name, cables: catCables });
    });

    return groups;
  }, [cables, categories, statusFilter, verifiedFilter, activeTab, t]);

  // Default to first category if none selected
  useEffect(() => {
    if (!selectedCategoryId && groupedCables.length > 0) {
      setSelectedCategoryId(groupedCables[0].categoryId || "none");
    }
  }, [groupedCables, selectedCategoryId]);

  useEffect(() => {
    if (!projectId) return;
    const ch = supabase.channel(`cables-v2-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cables" }, () => { loadCables(); loadTrommels(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "trommels" }, () => loadTrommels())
      .on("postgres_changes", { event: "*", schema: "public", table: "cable_routes" }, () => loadRoutes())
      .on("postgres_changes", { event: "*", schema: "public", table: "cable_categories" }, () => loadCategories())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, loadCables, loadTrommels, loadRoutes]);



  async function handleReport(cable: Cable) {
    const isReporting = cable.status !== "pending_approval";
    
    if (!isReporting) {
      const confirmed = window.confirm(t("cables", "cancelReportConfirmBody", "Czy na pewno...?"));
      if (!confirmed) return;
    }

    setReporting(cable.id);
    try {
      const next = isReporting ? "pending_approval" : "in_progress";
      const updated = await apiPatch<Cable>("/api/cables", { id: cable.id, status: next }, token);
      
      const fullUpdated = { ...cable, ...updated };
      setCables(prev => prev.map(c => c.id === updated.id ? fullUpdated : c));
      loadTrommels();

      if (isReporting && fullUpdated.cable_routes?.plan_id && fullUpdated.cable_routes.point_a_x != null) {
        setMapCable(fullUpdated as any);
      }
    } catch {}
    finally { setReporting(null); }
  }

  async function handleCreateTrommel() {
    if (!newTrName.trim()) return;
    try {
      let photoUrl: string | null = null;
      if (newTrPhoto) {
        try {
          const res = await fetch("/api/trommel-photos", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ base64: newTrPhoto, file_name: newTrPhotoName || "photo.jpg" })
          });
          const j = await res.json();
          if (j.ok) photoUrl = j.data.url;
        } catch {}
      }
      const tr = await apiPost<Trommel>("/api/trommels", {
        project_id: projectId,
        name: newTrName.trim(),
        total_length: newTrLen ? Number(newTrLen) : null,
        cable_type: normalizeCableType(newTrType),
        company_name: newTrCompany.trim() || null,
        serial_number: newTrSerial.trim() || null,
        diameter: newTrDiameter ? Number(newTrDiameter) : null,
        photo_url: photoUrl,
        status: (newTrSerial.trim() && photoUrl) ? "delivered" : "pending"
      });
      setTrommels(prev => [...prev, { ...tr, used_length: 0, remaining_length: tr.total_length, cables: [] }]);
      setNewTrName(""); setNewTrLen(""); setNewTrType(""); setNewTrCompany(""); setNewTrSerial(""); setNewTrDiameter(""); setNewTrPhoto(null); setNewTrPhotoName(""); 
      setShowTrommelForm(false);
      setShowTrommelsList(true);
      if (activeTab === "trommels" || activeTab === "picked_up" || activeTab === "archive") {
        setActiveTab("cables");
      }
    } catch (err: any) {
      alert("Error adding trommel: " + (err.message || "Unknown error"));
    }
  }

  function handleCableClick(cable: Cable) {
    if (cable.cable_routes?.plan_id && cable.cable_routes.point_a_x != null) setMapCable(cable);
    else setSelectedCable(cable);
  }

  async function handleScan(decodedText: string) {
    try {
      let type: string | null = null;
      let id: string | null = null;
      try {
        let extractedUrl = decodedText;
        const urlMatch = decodedText.match(/https?:\/\/[^\s]+/);
        if (urlMatch) extractedUrl = urlMatch[0];
        
        const url = new URL(extractedUrl);
        type = url.searchParams.get("scan_type");
        id = url.searchParams.get("scan_id");
      } catch {
        const idMatch = decodedText.match(/APP_ID:\s*([a-zA-Z0-9\-]+)/);
        const typeMatch = decodedText.match(/APP_TYPE:\s*(cable|trommel)/);
        if (idMatch && typeMatch) {
          id = idMatch[1]; type = typeMatch[1];
        } else {
          const jsonStart = decodedText.indexOf("{");
          if (jsonStart !== -1) {
            const data = JSON.parse(decodedText.substring(jsonStart));
            type = data.type; id = data.id;
          }
        }
      }

      if (!type || !id) {
        // Special case: CBL- (1D barcode for Brother)
        if (decodedText.startsWith("CBL-")) {
            const indexStr = decodedText.split("-")[1];
            if (indexStr) {
                handlePublicSearch(indexStr);
                setShowScanner(false);
                return;
            }
        }

        alert("Nie rozpoznano formatu QR");
        return;
      }


      if (type === "cable") {
        const c = cables.find(x => x.id === id);
        if (c) { 
          setSelectedCable(c); 
          if (c.cable_routes?.plan_id && c.cable_routes.point_a_x != null) setMapCable(c);
          setShowScanner(false);
          return;
        }
      } else if (type === "trommel") {
        const trObj = trommels.find(x => x.id === id);
        if (trObj) { 
          if (trObj.status === "picked_up") {
            setPublicItemInfo({ type: "inactive" });
            if (typeof window !== "undefined") {
              window.history.replaceState({}, document.title, "/");
            }
            setShowScanner(false);
            return;
          }

          if (isAdmin) {
            setSelectedTrommel(trObj); 
          } else {
            // For regular users and guests, show the public info view
            const { data: cData } = await supabase.from("cables").select("*, cable_routes(*)").eq("trommel_id", trObj.id);
            setPublicItemInfo({ ...trObj, type: "trommel", cables: cData || [] });
          }
          setShowScanner(false);
        }
      }

      const table = type === "cable" ? "cables" : "trommels";
      const { data, error } = await supabase.from(table).select("project_id").eq("id", id).single();
      
      if (error || !data) {
        alert(`Błąd: ${error?.message || "Nie znaleziono w bazie."}`);
        return;
      }

      if (data.project_id !== projectId) {
        setProjectId(data.project_id);
        localStorage.setItem("selectedProjectId", data.project_id);
        setPendingScan({ type, id });
        setShowScanner(false);
        setQ(""); setQD(""); setStatusFilter("");
      } else {
        alert("Błąd: Przedmiot powinien być w tym projekcie, ale nie ma go na liście. Sprawdź filtry.");
      }
    } catch (err: any) {
      alert("Wystąpił błąd: " + err?.message);
    }
  }

  const FILTERS = ["", "pending", "in_progress", "pending_approval", "done"];

  return (
    <div className="w-full flex flex-col items-center">
      {/* Public Search for non-logged-in users when no item is active */}
      {!token && !publicItemInfo && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full p-6 text-center">
          <div className="w-20 h-20 bg-ui-accent/10 rounded-full flex items-center justify-center mb-6 text-4xl animate-pulse">
            🔍
          </div>
          <h2 className="text-3xl font-black text-ui-text mb-2">{t("cables", "publicSearchTitle", "Wyszukiwarka Kabli")}</h2>
          <p className="text-ui-muted text-base mb-8 max-w-sm">{t("cables", "publicSearchSubtitle", "Wpisz numer kabla, aby sprawdzić jego dane i status.")}</p>
          
          <div className="w-full max-w-sm bg-ui-card border-2 border-ui-accent/30 rounded-2xl p-10 shadow-[0_0_80px_rgba(56,189,248,0.1)] backdrop-blur-xl relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-ui-accent/10 blur-3xl rounded-full" />
            <div className="flex flex-col gap-5 relative z-10">
              <div className="relative">
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-ui-accent/40 pointer-events-none">
                  <Search size={24} strokeWidth={3} />
                </div>
                <input 
                  type="number" 
                  value={publicSearch} 
                  onChange={e => setPublicSearch(e.target.value)} 
                  placeholder={t("cables", "publicSearchPlaceholder", "Numer kabla (np. 12)")}
                  className="w-full bg-black/60 border-2 border-white/10 rounded-2xl pl-5 pr-14 py-5 text-2xl font-black focus:outline-none focus:border-ui-accent focus:ring-8 focus:ring-ui-accent/10 text-ui-text transition-all text-center"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const btn = document.getElementById("public-search-btn");
                      if (btn) btn.click();
                    }
                  }}
                />
              </div>
              <button 
                id="public-search-btn"
                onClick={() => handlePublicSearch(publicSearch)}
                disabled={publicSearching}
                className="w-full bg-ui-accent text-ui-bg px-6 py-5 rounded-2xl font-black text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_40px_rgba(56,189,248,0.3)] flex items-center justify-center gap-3"
              >
                {publicSearching ? (
                  <div className="w-6 h-6 border-4 border-ui-bg/30 border-t-ui-bg rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{t("cables", "publicSearchBtn", "Szukaj")}</span>
                    <ChevronRight size={20} strokeWidth={3} />
                  </>
                )}
              </button>
            </div>
            <p className="mt-6 text-[10px] text-ui-muted font-bold uppercase tracking-widest opacity-40">{t("cables", "publicSearchSystemInfo", "System Informacji QR • ET⚡U.DE")}</p>
          </div>
        </div>
      )}

      {token && (
        <div className="w-full max-w-[1400px] p-4 md:p-10 space-y-8">

          {/* PAGE HEADER */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b border-white/5">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-ui-accent/10 border border-ui-accent/20 flex items-center justify-center text-ui-accent shadow-[0_0_20px_rgba(56,189,248,0.15)]">
                  <Cable size={24} />
                </div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white uppercase">{t("cables","title","Kable")}</h1>
              </div>
              <p className="text-ui-muted text-[11px] tracking-[0.3em] uppercase font-black opacity-40 ml-13">{t("cables","subtitle","Cable management & tracking")}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <select 
                  value={projectId} 
                  onChange={e => { setProjectId(e.target.value); localStorage.setItem("selectedProjectId", e.target.value); }} 
                  className="bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-sm font-black text-white focus:outline-none focus:border-ui-accent focus:ring-4 focus:ring-ui-accent/5 appearance-none transition-all cursor-pointer hover:bg-white/10 pr-10"
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>)}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-ui-muted/40">
                  <ChevronRight size={14} className="rotate-90" />
                </div>
              </div>

              <button 
                onClick={() => setShowScanner(true)} 
                className="flex items-center gap-3 px-6 py-3.5 rounded-xl border border-ui-accent/50 bg-ui-accent/5 text-ui-accent font-black text-sm hover:bg-ui-accent hover:text-ui-bg transition-all active:scale-95 shadow-lg shadow-ui-accent/10"
              >
                <Camera size={18} />
                <span>{t("cables","scanQr","Skanuj QR")}</span>
              </button>
            </div>
          </div>

          {/* MODERN NAVIGATION TABS - SPLIT INTO TWO ROWS */}
          <div className="flex flex-col gap-4">
            {/* ROW 1: CORE CABLE OPERATIONS */}
            <div className="flex flex-wrap bg-white/5 border border-white/10 rounded-2xl p-1.5 w-fit shadow-2xl backdrop-blur-md gap-1">
              {[
                { id: "cables", label: t("cables", "tabLabel", "Kable"), icon: Cable },
                { id: "unassigned", label: t("cables", "unassignedTab", "Nieprzydzielone"), icon: Unplug },
                { id: "trommels", label: t("cables", "emptyTrommelsTab", "Trommle"), icon: RefreshCcw },
                { id: "picked_up", label: t("cables", "pickedUpTab", "Odebrane"), icon: CheckCircle2 },
                { id: "cable_map", label: t("cables", "cableMapTitle", "MAPA KABLI"), icon: MapIcon, isLink: true, href: "/cables-map" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;

                if (tab.isLink) {
                  return (
                    <Link
                      key={tab.id}
                      href={tab.href!}
                      className="relative flex items-center gap-3 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap text-ui-muted hover:text-white hover:bg-white/5"
                    >
                      <Icon size={16} strokeWidth={2} className="opacity-60" />
                      <span>{tab.label}</span>
                    </Link>
                  );
                }

                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id as any); setSelectedTrommels(new Set()); }}
                    className={`
                      relative flex items-center gap-3 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap
                      ${isActive 
                        ? "bg-ui-accent/10 text-ui-accent border border-ui-accent/30 shadow-lg shadow-ui-accent/5" 
                        : "text-ui-muted hover:text-white hover:bg-white/5"
                      }
                    `}
                  >
                    <Icon size={16} strokeWidth={isActive ? 3 : 2} className={isActive ? "drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" : "opacity-60"} />
                    <span>{tab.label}</span>
                    {isActive && (
                      <motion.div 
                        layoutId="activeTabIndicatorCore"
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-ui-accent rounded-full shadow-[0_0_10px_rgba(56,189,248,1)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ROW 2: LOGISTICS & ADMIN */}
            {(isMod || isAdmin) && (
              <div className="flex flex-wrap bg-white/5 border border-white/10 rounded-2xl p-1.5 w-fit shadow-2xl backdrop-blur-md gap-1">
                {[
                  ...(isAdmin ? [{ id: "archive", label: t("cables", "archiveTab", "Archiwum"), icon: Archive }] : []),
                  ...(isMod ? [
                    { id: "logistics", label: t("cables", "logisticsTab", "Logistyka"), icon: Truck },
                    { id: "control", label: t("cables", "controlTab", "Kontrola"), icon: ShieldCheck },
                    { id: "remnants", label: t("cables", "remnants", "Resztki"), icon: Scissors }
                  ] : [])
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id as any); setSelectedTrommels(new Set()); }}
                      className={`
                        relative flex items-center gap-3 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap
                        ${isActive 
                          ? "bg-ui-accent/10 text-ui-accent border border-ui-accent/30 shadow-lg shadow-ui-accent/5" 
                          : "text-ui-muted hover:text-white hover:bg-white/5"
                        }
                      `}
                    >
                      <Icon size={16} strokeWidth={isActive ? 3 : 2} className={isActive ? "drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" : "opacity-60"} />
                      <span>{tab.label}</span>
                      {isActive && (
                        <motion.div 
                          layoutId="activeTabIndicatorAdmin"
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-ui-accent rounded-full shadow-[0_0_10px_rgba(56,189,248,1)]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        {isMod && (
          <div className="flex flex-wrap items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 shadow-xl">
            <p className="w-full md:w-auto text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted px-2 mb-2 md:mb-0 mr-4 border-r border-white/10">{t("common", "actions", "Akcje")}</p>
            <button onClick={() => setShowAdvancedAdder(true)} className="flex items-center gap-2 bg-ui-accent text-ui-bg px-5 py-3 rounded-xl text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 shadow-lg shadow-ui-accent/20">
              <Plus size={18} /> {t("cables", "createBtn", "Nowy kabel")}
            </button>
            <button onClick={() => setShowSerialAdderModal(true)} className="flex items-center gap-2 bg-white/5 border border-amber-500/30 text-amber-500 px-5 py-3 rounded-xl text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 hover:bg-amber-500/10">
              <LayoutGrid size={18} /> {t("cables", "serialAddBtn", "Seryjne dodawanie")}
            </button>
            <button onClick={() => setShowCategoriesModal(true)} className="flex items-center gap-2 bg-white/5 border border-white/10 text-white/70 px-5 py-3 rounded-xl text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 hover:border-ui-accent/50">
              <ClipboardList size={18} /> {t("cables", "categoriesBtn", "Rozdzielnie")}
            </button>
            <button onClick={() => setShowMapPicker(true)} className="flex items-center gap-2 bg-white/5 border border-emerald-500/30 text-emerald-400 px-5 py-3 rounded-xl text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 hover:bg-emerald-500/10">
              <MapIcon size={18} /> {t("cables", "addRoute", "Dodaj trasę")}
            </button>
            <button 
              onClick={() => {
                setShowTrommelForm(v => !v);
              }} 
              className="flex items-center gap-2 bg-white/5 border border-white/10 text-ui-muted px-5 py-3 rounded-xl text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 hover:text-white hover:border-white/20 ml-auto"
            >
              <RefreshCcw size={18} /> {t("cables", "addTrommel", "Dodaj bęben")}
            </button>
          </div>
        )}



        {isMod && showTrommelForm && (
          <div className="bg-ui-card border border-ui-border/50 rounded-2xl p-5 flex flex-col gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-ui-accent">Nowy bęben kablowy</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={newTrName} onChange={e => setNewTrName(e.target.value)} placeholder={`${t("cables","trommelNamePlaceholder","Nazwa bębna")} *`} className="bg-black/30 border border-ui-border/50 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={newTrLen} onChange={e => setNewTrLen(e.target.value)} placeholder={t("cables","totalLengthPlaceholder","Łączna długość (m)")} className="bg-black/30 border border-ui-border/50 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent" />
                <input list="cable-types" value={newTrType} onChange={e => setNewTrType(e.target.value)} placeholder={t("cables","cableTypePlaceholder","Typ kabla")} className="bg-black/30 border border-ui-border/50 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={newTrCompany} onChange={e => setNewTrCompany(e.target.value)} placeholder="Nazwa firmy (opcjonalnie)" className="bg-black/30 border border-ui-border/50 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent" />
              <input value={newTrSerial} onChange={e => setNewTrSerial(e.target.value)} placeholder="Nr trommla / seryjny (opcjonalnie)" className="bg-black/30 border border-ui-border/50 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent" />
              <input type="number" value={newTrDiameter} onChange={e => setNewTrDiameter(e.target.value)} placeholder={t("cables","diameter","Średnica (cm)")} className="bg-black/30 border border-ui-border/50 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-ui-accent md:col-span-2" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-ui-muted block mb-1">Zdjęcie bębna (opcjonalnie)</label>
              <input type="file" accept="image/*" onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setNewTrPhotoName(f.name);
                const reader = new FileReader();
                reader.onloadend = () => setNewTrPhoto(reader.result as string);
                reader.readAsDataURL(f);
              }} className="text-xs text-ui-muted" />
              {newTrPhoto && <img src={newTrPhoto} alt="preview" className="mt-2 h-16 w-auto rounded-lg border border-ui-border/30 object-cover" />}
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreateTrommel} disabled={!newTrName.trim()} className="flex-1 py-2 rounded-xl bg-ui-accent text-ui-bg font-black text-sm disabled:opacity-50">{t("common","save","Zapisz")}</button>
              <button onClick={() => { setShowTrommelForm(false); setNewTrPhoto(null); }} className="px-5 py-2 rounded-xl border border-ui-border/50 text-ui-muted font-black text-sm">{t("common","cancel","Anuluj")}</button>
            </div>

            <datalist id="cable-types">
              {cableTypes.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
        )}

        {/* Trommel Search & Filter Bar */}
        <div className="bg-[#0F172A]/80 border-2 border-white/10 rounded-2xl p-4 mb-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-grow w-full group">
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-ui-accent/50 group-focus-within:text-ui-accent transition-colors pointer-events-none">
                <Search size={22} strokeWidth={3} />
              </div>
              <input 
                type="text" 
                value={qT} 
                onChange={e => setQT(e.target.value)} 
                placeholder={t("cables", "searchTrommelPlaceholder", "Szukaj bębna (nazwa lub #numer)...")}
                className="w-full bg-black/60 border-2 border-white/5 rounded-2xl pl-8 pr-16 py-5 text-lg font-black text-white placeholder:text-ui-muted/20 focus:outline-none focus:border-ui-accent/40 focus:ring-8 focus:ring-ui-accent/5 transition-all shadow-2xl"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button className="flex-1 md:flex-none px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-ui-muted hover:text-white transition-all flex items-center justify-center gap-2">
                <Filter size={18} />
                <span className="text-[10px] font-black uppercase tracking-widest">{t("home", "sortBy", "Sortuj")}</span>
              </button>
              
              <button 
                onClick={() => setShowTrommelsList(!showTrommelsList)}
                className={`
                  flex-1 md:flex-none px-6 py-4 border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3
                  ${showTrommelsList 
                    ? "bg-ui-accent text-ui-bg border-ui-accent shadow-lg shadow-ui-accent/20" 
                    : "bg-white/5 border-white/10 text-ui-muted hover:text-white hover:border-white/20"
                  }
                `}
              >
                <LayoutGrid size={18} />
                {showTrommelsList ? t("common", "hide", "Ukryj") : t("cables", "trommelsList", "Bębny")}
              </button>
            </div>
          </div>
        </div>

        {(showTrommelsList || qTD || activeTab !== "cables") && trommels.length > 0 && (() => {
          const filteredTrommels = trommels.filter(tr => {
            const tCables = tr.cables || [];
            const total = tr.total_length;
            
            // Use backend pre-calculated values or calculate from tr.cables
            const used = tr.used_length ?? tCables.reduce((sum, c) => sum + (c.length || 0), 0);
            const rem = tr.remaining_length ?? (total ? total - used : 0);
            
            const allCablesFinished = tCables.length > 0 && tCables.every(c => ["done", "pending_approval"].includes(c.status));
            
            const isAutoEmpty = total != null && total > 0 && rem <= 0 && allCablesFinished;
            const isManualEmpty = ["empty", "pickup_requested"].includes(tr.status || "");
            const isPickedUp = tr.status === "picked_up";
            
            const isTrommelEmpty = isAutoEmpty || isManualEmpty;
            const isTrommelActive = !isTrommelEmpty && !isPickedUp;

            let isTabMatch = false;
            if (activeTab === "cables") isTabMatch = isTrommelActive && !tr.is_archived;
            else if (activeTab === "trommels") isTabMatch = isTrommelEmpty && !tr.is_archived && !(tr.remnant_length && tr.remnant_length > 0);
            else if (activeTab === "remnants") isTabMatch = (tr.remnant_length || 0) > 0 && !tr.is_archived;
            else if (activeTab === "picked_up") isTabMatch = isPickedUp && !tr.is_archived;
            else if (activeTab === "archive") isTabMatch = !!tr.is_archived;
            
            const matchesSearch = !qTD || (() => {
              const low = qTD.toLowerCase();
              const isNum = /^\d+$/.test(qTD);
              if (isNum) {
                return tr.index_number === parseInt(qTD);
              }
              return tr.name.toLowerCase().includes(low) || (tr.cable_type != null && tr.cable_type.toLowerCase().includes(low)) || (tr.status != null && tr.status.toLowerCase().includes(low));
            })();

            // If searching, respect archive status
            if (qTD && matchesSearch) {
              if (activeTab === "archive") return !!tr.is_archived;
              return !tr.is_archived;
            }

            return isTabMatch && matchesSearch;
          }).sort((a, b) => {
            if (activeTab === "picked_up") {
              const dA = a.picked_up_at || a.updated_at || "";
              const dB = b.picked_up_at || b.updated_at || "";
              return dB.localeCompare(dA);
            }
            if (activeTab === "trommels") {
              // For empty/requested trommels, sort by request date if exists
              const dA = a.pickup_requested_at || a.updated_at || "";
              const dB = b.pickup_requested_at || b.updated_at || "";
              if (a.status === "pickup_requested" || b.status === "pickup_requested") {
                return dB.localeCompare(dA);
              }
            }
            if (!a.cable_type && b.cable_type) return 1;
            if (a.cable_type && !b.cable_type) return -1;
            if (a.cable_type && b.cable_type) {
              const cmp = a.cable_type.localeCompare(b.cable_type);
              if (cmp !== 0) return cmp;
            }
            return a.name.localeCompare(b.name);
          });

          const LAID = new Set(["pending_approval", "done"]);
          const trommelGroups = filteredTrommels.reduce<{
            active: typeof trommels;
            reszta: typeof trommels;
          }>((acc, tr) => {
            const tCables = tr.cables || [];
            const allLaid = tCables.length > 0 && tCables.every(c => LAID.has(c.status));
            
            const total = tr.total_length || 0;
            const used = tr.used_length ?? tCables.reduce((sum, c) => sum + (c.length || 0), 0);
            const rem = tr.remaining_length ?? (total - used);
            const hasRemainder = rem > 0;
            
            acc.active.push(tr);
            return acc;
          }, { active: [], reszta: [] });

          const TrommelCard = ({ tr }: { tr: typeof trommels[0] }) => {
            const tCables = tr.cables || [];
            const total = tr.total_length;
            const used = tr.used_length ?? tCables.reduce((sum, c) => sum + (c.length || 0), 0);
            
            // IF REMNANT EXISTS, IT IS THE ACTUAL REMAINING LENGTH
            const isRemnant = (tr.remnant_length || 0) > 0;
            const rem = isRemnant ? tr.remnant_length : (tr.remaining_length ?? (total ? total - used : null));
            
            // Adjust percentage for remnants
            const pct = isRemnant 
              ? (total ? Math.min(100, ((total - (tr.remnant_length || 0)) / total) * 100) : 0)
              : (total ? Math.min(100, (used / total) * 100) : 0);
            
            const remPct = total ? Math.max(0, 100 - pct) : 100;
            
            // i18n labels
            const labels = {
              remaining: t("cables", "remaining", "Remaining"),
              total: t("cables", "total", "Total"),
              activeLoans: t("cables", "activeLoans", "Active Loans"),
              usageIntensity: t("cables", "usageIntensity", "Usage Intensity"),
              distribution: t("cables", "distribution", "Cable Distribution"),
              pickedUp: t("cables", "trommel_status_picked_up", "Picked up"),
              critical: t("taskPriority", "CRITICAL", "Critical"),
              low: t("taskPriority", "LOW", "Low"),
              full: t("taskPriority", "FULL", "Full"),
              meters: "m"
            };

            // Status logic
            const statusLabel = remPct < 15 ? labels.critical : remPct < 40 ? labels.low : labels.full;
            const statusColor = remPct < 15 ? "#ef4444" : remPct < 40 ? "#f59e0b" : "#22c55e";

            const isPickupRequested = tr.status === "pickup_requested";
            const isPickedUp = tr.status === "picked_up";
            const isEmpty = tr.status === "empty";
            const isSelected = selectedTrommels.has(tr.id);

            // Monochromatic segment system
            const getSegmentColor = (index: number) => {
              const opacities = [0.8, 0.6, 0.45, 0.7, 0.5];
              return `rgba(56, 189, 248, ${opacities[index % opacities.length]})`;
            };

            const visualCables = tCables.map((c, i) => ({
              id: c.id,
              name: c.name,
              length: c.length || 0,
              color: getSegmentColor(i),
              status: t("cables", `status_${c.status}`, c.status),
              rawStatus: c.status,
              location: c.cable_routes?.point_b_label,
              user: c.reported_profile?.full_name
            }));

            return (
              <div key={tr.id} className="relative group/card">
                <button 
                  onClick={() => setSelectedTrommel(tr)} 
                  className={`w-full text-left p-6 rounded-2xl bg-[#0F172A]/40 border-2 backdrop-blur-xl transition-all duration-300 group overflow-hidden ${isSelected ? "border-ui-accent ring-8 ring-ui-accent/5 shadow-[0_0_50px_rgba(56,189,248,0.15)]" : isPickedUp ? "border-emerald-500/20 opacity-60" : "border-white/5 hover:border-white/10 shadow-2xl hover:shadow-ui-accent/5"}`}
                >
                  <div className="absolute -top-24 -left-24 w-48 h-48 bg-ui-accent/5 blur-[100px] rounded-full group-hover:bg-ui-accent/10 transition-colors" />

                  <div className="relative flex flex-col md:flex-row gap-8 items-center md:items-start">
                    {/* LEFT ZONE: VISUAL */}
                    <div className="flex-shrink-0 relative">
                      <TrommelVisual 
                        size={140} 
                        totalLength={total} 
                        usedLength={isRemnant ? (total ? total - (tr.remnant_length || 0) : 0) : used} 
                        cables={visualCables} 
                        name={tr.name} 
                        cableType={tr.cable_type} 
                      />
                      {isCritical(remPct) && !isPickedUp && (
                         <div className="absolute inset-0 rounded-full border-2 border-red-500/20 animate-ping pointer-events-none" />
                      )}
                    </div>

                    {/* MIDDLE ZONE: PRIMARY INFO */}
                    <div className="flex-1 min-w-0 space-y-4 py-1 w-full">
                      <div>
                        <div className="flex flex-col mb-2">
                          <h3 className="text-xl md:text-2xl font-black text-white group-hover:text-ui-accent transition-colors leading-tight line-clamp-2">
                             {tr.index_number ? `#${tr.index_number} ` : ""}{tr.name}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {tr.cable_type && (
                              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-black text-ui-muted uppercase tracking-[0.15em]">
                                 {tr.cable_type}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-ui-accent/10 text-ui-accent text-[9px] font-black uppercase tracking-[0.15em]">
                               {tCables.length} {labels.activeLoans}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-ui-muted/40">
                           <span className="flex items-center gap-1.5 uppercase tracking-widest">
                              <span className="text-ui-accent opacity-50">📍</span>
                              {tr.company_name || "STORAGE"}
                           </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-[8px] font-black tracking-[0.2em] text-ui-muted/40 uppercase">
                           <span>{labels.usageIntensity}</span>
                           <span className="text-ui-text">{Math.round(pct)}%</span>
                        </div>
                        <div className="h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5 p-[1.5px]">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${pct}%` }}
                             transition={{ duration: 1.5, ease: "easeOut" }}
                             className="h-full rounded-full shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                             style={{ background: `linear-gradient(90deg, #38bdf8 0%, #0ea5e9 100%)` }}
                           />
                        </div>
                      </div>
                    </div>

                    {/* RIGHT ZONE: METRICS */}
                    <div className="flex-shrink-0 md:w-32 flex flex-row md:flex-col justify-between md:justify-start items-center md:items-end gap-2 md:gap-4 w-full border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-8">
                       <div className="text-right">
                          <p className="text-[10px] font-black text-ui-muted/30 uppercase tracking-[0.2em] leading-none mb-2">{labels.remaining}</p>
                          <h4 className="text-3xl font-black text-white leading-none tracking-tighter" style={{ color: statusColor }}>
                             {rem ?? 0}{labels.meters}
                          </h4>
                       </div>

                       <div className="text-right">
                          <p className="text-[10px] font-black text-ui-muted/30 uppercase tracking-[0.2em] leading-none mb-1">{labels.total}</p>
                          <p className="text-sm font-black text-ui-muted">
                             {used} / {total || "-"}m
                          </p>
                       </div>

                       <div 
                         className="px-4 py-1.5 rounded-lg text-[10px] font-black border tracking-[0.2em] transition-all"
                         style={{ 
                           borderColor: `${statusColor}33`, 
                           backgroundColor: `${statusColor}08`, 
                           color: statusColor,
                         }}
                       >
                          {statusLabel}
                       </div>
                    </div>
                  </div>

                  {/* BOTTOM ZONE: SEGMENT ALLOCATION BAR */}
                  {tCables.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/5">
                       <p className="text-[9px] font-black text-ui-muted/30 uppercase tracking-[0.2em] mb-4 text-center md:text-left">{labels.distribution}</p>
                       <div className="flex h-5 w-full rounded-lg overflow-hidden bg-black/40 border border-white/5 p-1 gap-1">
                          {visualCables.map((c, i) => (
                             <motion.div
                               key={c.id}
                               initial={{ flex: 0 }}
                               animate={{ flex: c.length || 1 }}
                               transition={{ duration: 1, delay: 0.5 + i * 0.05 }}
                               className="h-full rounded-sm cursor-help transition-all hover:brightness-125"
                               style={{ background: c.color }}
                               title={`${c.name}: ${c.length}m`}
                             />
                          ))}
                          {rem != null && rem > 0 && (
                             <div 
                               className="h-full rounded-sm flex-1 bg-white/5 border border-white/5" 
                               style={{ flex: rem }}
                               title={`Free space: ${rem}m`}
                             />
                          )}
                       </div>
                    </div>
                  )}

                  {isPickedUp && tr.picked_up_at && (
                    <div className="absolute top-4 right-4 text-[9px] flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-500/20 font-black tracking-widest uppercase">
                      <span>✅ {labels.pickedUp}: {new Date(tr.picked_up_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </button>

                {isMod && (activeTab === "trommels" || activeTab === "picked_up") && (
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = new Set(selectedTrommels);
                      if (next.has(tr.id)) next.delete(tr.id);
                      else next.add(tr.id);
                      setSelectedTrommels(next);
                    }}
                    className={`absolute -top-3 -right-3 w-10 h-10 rounded-full border-4 flex items-center justify-center cursor-pointer transition-all z-20 ${isSelected ? "bg-ui-accent border-ui-bg text-ui-bg scale-110 shadow-2xl shadow-ui-accent/40" : "bg-black/80 border-white/10 text-white/40 hover:border-ui-accent hover:text-white"}`}
                  >
                    {isSelected ? <span className="text-lg font-bold">✓</span> : <span className="text-xs">+</span>}
                  </div>
                )}
              </div>
            );
          };

          const isCritical = (remPct: number) => remPct < 15;



          return (
            <>
              {trommelGroups.active.length > 0 && (
                <div className="space-y-12">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl md:text-3xl font-black text-ui-text uppercase tracking-tight flex items-center gap-4">
                      <span className="w-2 h-8 bg-ui-accent rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)]"></span>
                      {activeTab === "trommels" ? t("cables", "emptyTrommelsTab", "Puste Bębny") : 
                       activeTab === "picked_up" ? t("cables", "pickedUpTitle", "Odebrane Bębny") : 
                       activeTab === "remnants" ? t("cables", "remnants", "Resztki") :
                       t("cables","trommelsList","Bębny")} ({trommelGroups.active.length})
                    </h2>
                    {isMod && (activeTab === "trommels" || activeTab === "picked_up" || activeTab === "remnants") && selectedTrommels.size > 0 && (
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handleBulkReport}
                          disabled={loading}
                          className="bg-ui-accent text-ui-bg px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-ui-accent/20"
                        >
                          📧 {loading ? "..." : t("cables", "reportSelected", "Zgłoś wybrane")} ({selectedTrommels.size})
                        </button>
                        {isAdmin && activeTab === "picked_up" && (
                          <button 
                            onClick={handleBulkArchive}
                            disabled={loading}
                            className="bg-slate-800 text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-900/40 border border-white/5"
                          >
                            📁 {loading ? "..." : t("cables", "moveToArchive", "Archiwizuj")} ({selectedTrommels.size})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                    {trommelGroups.active.map((tr, idx, arr) => {
                      const prev = arr[idx - 1];
                      let showHeader = false;
                      let headerLabel = "";

                      if (activeTab === "picked_up") {
                        const dateA = (tr.picked_up_at || tr.updated_at || "").split("T")[0];
                        const datePrev = prev ? (prev.picked_up_at || prev.updated_at || "").split("T")[0] : null;
                        if (dateA !== datePrev) {
                          showHeader = true;
                          headerLabel = dateA;
                        }
                      } else {
                        showHeader = !prev || prev.cable_type !== tr.cable_type;
                        headerLabel = tr.cable_type || t("cables", "noCategory", "Bez typu");
                      }

                      return (
                        <div key={tr.id} className={showHeader ? "contents" : ""}>
                          {showHeader && (
                            <div className="col-span-full mt-8 first:mt-0 mb-2 flex items-center gap-4">
                              <div className="h-px bg-ui-accent/30 flex-grow"></div>
                              <span className="text-sm font-black uppercase tracking-[0.2em] text-ui-accent drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]">
                                {headerLabel}
                              </span>
                              <div className="h-px bg-ui-accent/30 flex-grow"></div>
                            </div>
                          )}
                          <TrommelCard tr={tr} />
                        </div>
                      );
                    })}
                  </div>
                  {trommelGroups.active.length === 0 && <p className="text-center py-8 text-ui-muted font-bold text-sm">{t("cables", "noActiveTrommels", "Nie znaleziono aktywnych bębnów.")}</p>}
                </div>
              )}
              </>
            );
          })()}

        {activeTab === "control" && isMod && (
          <div className="flex flex-col items-center justify-center py-10 w-full animate-in fade-in duration-500">
            <div className="w-full max-w-md bg-ui-card border border-amber-500/30 rounded-2xl p-8 shadow-2xl">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🛡️</div>
                <h3 className="text-xl font-black text-ui-text">{t("cables", "controlTab", "Kontrola")}</h3>
                <p className="text-ui-muted text-xs font-bold uppercase tracking-widest mt-1 opacity-60">{t("cables", "verifyCable", "Weryfikuj kabel")}</p>
              </div>

              <div className="flex flex-col gap-6">
                {!verificationTarget ? (
                  <>
                    <div className="relative group">
                      <label className="text-[10px] font-black uppercase tracking-widest text-ui-muted mb-3 block opacity-60">{t("cables", "enterCableNumber", "Wpisz numer kabla (indeks)")}</label>
                      <div className="relative">
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-amber-500/40 pointer-events-none">
                          <Search size={24} strokeWidth={3} />
                        </div>
                        <input 
                          type="number" 
                          value={verificationSearch}
                          onChange={e => setVerificationSearch(e.target.value)}
                          placeholder={t("cables", "exampleIndex", "np. 12")}
                          className="w-full bg-black/60 border-2 border-white/10 rounded-2xl pl-6 pr-16 py-6 text-3xl font-black text-center focus:outline-none focus:border-amber-500 focus:ring-8 focus:ring-amber-500/10 transition-all text-ui-text shadow-2xl"
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const btn = document.getElementById("search-verify-btn");
                              if (btn) btn.click();
                            }
                          }}
                        />
                      </div>
                    </div>

                    <button 
                      id="search-verify-btn"
                      disabled={verifying || !verificationSearch}
                      onClick={async () => {
                        setVerifying(true);
                        try {
                          const idx = parseInt(verificationSearch);
                          // Fetch specifically from API to ensure we find it even if not in current local batch
                          const data = await apiGet<Cable[]>(`/api/cables?projectId=${projectId}&q=${idx}`);
                          const found = (data || []).find(c => c.index_number === idx);
                          
                          if (!found) {
                            alert(t("cables", "publicSearchNotFound", "Nie znaleziono kabla o takim numerze."));
                            return;
                          }
                          if (found.is_verified) {
                            if (!confirm(t("cables", "alreadyVerifiedWarning", "Ten kabel jest już zatwierdzony. Czy chcesz go sprawdzić ponownie?"))) {
                                setVerificationSearch("");
                                setVerifying(false);
                                return;
                            }
                          }
                          setVerificationTarget(found);
                        } catch (err: any) {
                          alert("Error: " + err.message);
                        } finally {
                          setVerifying(false);
                        }
                      }}
                      className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {verifying ? "..." : t("cables", "publicSearchBtn", "Szukaj")}
                    </button>
                  </>
                ) : (
                  <div className="space-y-6 animate-in zoom-in duration-300">
                    <div className="bg-white/5 border border-ui-border/30 rounded-2xl p-6 text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-ui-muted mb-4">{t("cables", "cableDetails", "Szczegóły kabla")}</p>
                      
                      <div className="flex items-center gap-4 mb-4">
                        <div className="bg-ui-accent/20 text-ui-accent px-3 py-1 rounded-lg font-black text-xl">
                          #{verificationTarget.index_number}
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-black text-ui-text truncate">{verificationTarget.name}</p>
                          <p className="text-[10px] font-bold text-ui-muted uppercase tracking-wider">{verificationTarget.cable_type || "-"}</p>
                        </div>
                      </div>

                      {verificationTarget.cable_routes && (
                        <div className="bg-black/40 rounded-xl p-3 border border-white/5 mb-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-ui-muted mb-1">{t("cables", "route", "Trasa")}</p>
                          <p className="text-xs font-bold text-ui-text/80 leading-relaxed">
                            {verificationTarget.cable_routes.point_a_label} 
                            <span className="mx-2 text-ui-accent opacity-50">→</span> 
                            {verificationTarget.cable_routes.point_b_label}
                          </p>
                        </div>
                      )}

                      <div className="flex justify-between items-center py-2 border-t border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted">{t("cables", "status", "Status")}</span>
                        <span className="text-xs font-black text-ui-text">
                          {t("cables", `status_${verificationTarget.status}`, verificationTarget.status)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setVerificationTarget(null)}
                        className="py-4 rounded-2xl bg-white/5 border border-ui-border/50 text-ui-muted font-black text-sm hover:bg-white/10 transition-all uppercase tracking-widest"
                      >
                        {t("common", "cancel", "Anuluj")}
                      </button>
                      <button 
                        disabled={verifying}
                        onClick={async () => {
                          setVerifying(true);
                          try {
                            const updated = await apiPatch<Cable>("/api/cables", { id: verificationTarget.id, is_verified: true }, token);
                            setCables(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
                            setLastVerifiedCable(updated);
                            setVerificationTarget(null);
                            setVerificationSearch("");
                            setTimeout(() => setLastVerifiedCable(null), 5000);
                          } catch (err: any) {
                            alert("Error: " + err.message);
                          } finally {
                            setVerifying(false);
                          }
                        }}
                        className="bg-emerald-500 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest"
                      >
                        {verifying ? "..." : t("cables", "verifyCable", "Potwierdź")}
                      </button>
                    </div>
                  </div>
                )}

                {lastVerifiedCable && (
                  <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl animate-in zoom-in duration-300">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">✅</span>
                      <div>
                        <p className="text-emerald-400 font-black text-sm">{t("cables", "cableVerifiedSuccess", "Zweryfikowano!")}</p>
                        <p className="text-ui-text text-xs font-bold">#{lastVerifiedCable.index_number} - {lastVerifiedCable.name}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "logistics" && isMod && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
            <div className="bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent border border-emerald-500/20 rounded-2xl p-8 md:p-12 shadow-2xl mb-12">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                <div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-ui-text uppercase mb-2">
                    {t("cables", "logisticsTitle", "Optymalizacja Logistyki")}
                  </h2>
                  <p className="text-xs md:text-sm font-black uppercase tracking-[0.3em] text-emerald-400">
                    {t("cables", "logisticsAnalysis", "Analiza tras i bębnów")} • {t("cables", "logisticSystem", "Logistic System")}
                  </p>
                </div>
                <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-4xl border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">🚚</div>
              </div>

              {(() => {
                const cablesByType: Record<string, Cable[]> = {};
                cables.forEach(c => {
                  if (c.status === "done" || !c.cable_type) return;
                  const norm = normalizeCableType(c.cable_type);
                  if (!cablesByType[norm]) cablesByType[norm] = [];
                  cablesByType[norm].push(c);
                });

                const suggestions: any[] = [];
                Object.entries(cablesByType).forEach(([type, typeCables]) => {
                  const byDest: Record<string, Cable[]> = {};
                  typeCables.forEach(c => {
                    const route = c.cable_routes;
                    if (!route) return;
                    const destKey = `${route.point_a_label} ↔ ${route.point_b_label}`;
                    if (!byDest[destKey]) byDest[destKey] = [];
                    byDest[destKey].push(c);
                  });

                  Object.entries(byDest).forEach(([dest, destCables]) => {
                    const trIds = new Set(destCables.map(c => c.trommel_id).filter(id => !!id));
                    if (trIds.size > 1) {
                      const totalGroupLength = destCables.reduce((sum, c) => sum + (c.length || 0), 0);
                      
                      const groupTrommels = Array.from(trIds).map(id => {
                        const tr = trommels.find(t => t.id === id);
                        if (!tr || tr.status === "picked_up" || tr.status === "empty") return null;
                        
                        const allCablesOnTr = cables.filter(c => c.trommel_id === tr.id);
                        const currentUsed = allCablesOnTr.reduce((sum, c) => sum + (c.length || 0), 0);
                        
                        const groupCablesOnTr = destCables.filter(c => c.trommel_id === tr.id);
                        const groupCablesOnTrLen = groupCablesOnTr.reduce((sum, c) => sum + (c.length || 0), 0);
                        
                        const otherCablesLen = currentUsed - groupCablesOnTrLen;
                        const potentialFree = (tr.total_length || 0) - otherCablesLen;
                        const canFitAll = potentialFree >= totalGroupLength;

                        return { 
                          ...tr, 
                          currentUsed,
                          potentialFree, 
                          canFitAll,
                          remainingAfterMerge: tr.total_length ? tr.total_length - otherCablesLen - totalGroupLength : null
                        };
                      }).filter(Boolean);

                      suggestions.push({
                        type: "split",
                        cableType: type,
                        dest,
                        totalLength: totalGroupLength,
                        cables: destCables,
                        trommels: groupTrommels
                      });
                    }
                  });
                });

                // --- NEW: Swap Suggestions ---
                trommels.filter(t => t.status !== "picked_up" && t.status !== "empty").forEach(tr => {
                  const trCables = cables.filter(c => c.trommel_id === tr.id && c.status !== "done");
                  if (trCables.length === 0) return;

                  // Find dominant destination for this trommel
                  const destCounts: Record<string, number> = {};
                  trCables.forEach(c => {
                    const d = c.cable_routes?.point_b_label;
                    if (d) destCounts[d] = (destCounts[d] || 0) + (c.length || 0);
                  });
                  const dominantDest = Object.entries(destCounts).sort((a,b) => b[1] - a[1])[0]?.[0];

                  // Find cables NOT going to dominant destination
                  trCables.forEach(c => {
                    const dest = c.cable_routes?.point_b_label;
                    if (!dest || dest === dominantDest) return;

                    // Is there a better trommel for this cable?
                    // (Same type, and that trommel has this 'dest' as its dominant dest)
                    const targetTr = trommels.find(t => {
                      if (t.id === tr.id || t.cable_type !== c.cable_type || t.status === "picked_up" || t.status === "empty") return false;
                      const otherTrCables = cables.filter(oc => oc.trommel_id === t.id && oc.status !== "done");
                      const otherDestCounts: Record<string, number> = {};
                      otherTrCables.forEach(oc => {
                        const od = oc.cable_routes?.point_b_label;
                        if (od) otherDestCounts[od] = (otherDestCounts[od] || 0) + (oc.length || 0);
                      });
                      const otherDominant = Object.entries(otherDestCounts).sort((a,b) => b[1] - a[1])[0]?.[0];
                      
                      // Check space
                      const used = otherTrCables.reduce((s, oc) => s + (oc.length || 0), 0);
                      const hasSpace = (t.total_length || 0) - used >= (c.length || 0);

                      return otherDominant === dest && hasSpace;
                    });

                    if (targetTr) {
                      suggestions.push({
                        type: "swap",
                        cable: c,
                        fromTr: tr,
                        toTr: targetTr
                      });
                    }
                  });
                });

                if (suggestions.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-8 text-5xl border border-emerald-500/20 shadow-2xl animate-bounce">✨</div>
                      <h3 className="text-3xl font-black text-ui-text mb-4">{t("cables", "logisticsOptimized", "Wszystko zoptymalizowane!")}</h3>
                      <p className="text-ui-muted text-base max-w-md font-bold opacity-80 leading-relaxed">{t("cables", "logisticsOptimizedDesc", "System nie znalazł bębnów tego samego typu, które zmierzają w to samo miejsce na budowie.")}</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-12">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-8 flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-ui-bg text-2xl shadow-xl">💡</div>
                      <div>
                        <p className="text-lg font-black text-ui-text mb-1 uppercase tracking-tight">{t("cables", "logisticsSuggestionsFound", "Analiza wykazała")} {suggestions.length} {t("cables", "logisticsSuggestionsSuffix", "możliwości usprawnienia")}</p>
                        <p className="text-sm text-ui-muted font-bold opacity-70">{t("cables", "logisticsSuggestionsDesc", "Poniższe grupy kabli mają ten sam typ i jadą w to samo miejsce, ale znajdują się na różnych bębnach.")}</p>
                      </div>
                    </div>
                    
                    {suggestions.map((s, i) => {
                      if (s.type === "split") return (
                        <div key={i} className="bg-ui-card border border-ui-border/40 rounded-2xl overflow-hidden shadow-2xl transition-all hover:border-ui-accent/30 group/opt">
                          <div className="p-10 border-b border-ui-border/30 bg-white/5">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
                              <div className="flex items-center gap-6">
                                <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-4xl border border-emerald-500/20 shadow-2xl">📦</div>
                                <div>
                                  <span className="bg-emerald-500 text-ui-bg text-[11px] font-black px-4 py-1.5 rounded-xl uppercase tracking-tighter shadow-lg shadow-emerald-500/20">{s.cableType}</span>
                                  <div className="flex items-baseline gap-3 mt-3">
                                    <h3 className="text-3xl font-black text-ui-text">{s.cables.length} {t("cables", "itemsToTarget", "kabli")}</h3>
                                    <span className="text-lg font-bold text-emerald-400 opacity-60">(∑ {s.totalLength}m)</span>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-black/60 px-8 py-5 rounded-2xl border border-ui-border/50 flex items-center gap-6 shadow-inner self-start lg:self-center">
                                 <div className="w-4 h-4 rounded-full bg-ui-accent animate-pulse shadow-[0_0_15px_rgba(56,189,248,0.5)]"></div>
                                 <span className="text-xl font-black text-ui-text tracking-tight uppercase">{s.dest}</span>
                              </div>
                            </div>
                            
                            <div className="space-y-12">
                              {s.trommels.map((tr: any, trIdx: number) => {
                                const trCables = s.cables.filter((c: any) => c.trommel_id === tr.id);
                                return (
                                  <div key={tr.id} className="relative">
                                    <div className={`border rounded-2xl p-10 transition-all ${tr.canFitAll ? 'bg-white/5 border-emerald-500/20 hover:border-emerald-500/40' : 'bg-red-500/5 border-red-500/10 opacity-70'}`}>
                                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 mb-10">
                                        <div className="flex items-center gap-6">
                                          <div className="w-14 h-14 rounded-2xl bg-ui-accent/10 flex items-center justify-center text-xl border border-ui-accent/20 font-black text-ui-accent">#</div>
                                          <div>
                                            <p className="text-[11px] font-black text-ui-muted uppercase tracking-[0.3em] mb-1">{t("cables", "currentDrum", "Aktualny bęben")}</p>
                                            <button 
                                                onClick={() => setSelectedTrommel(tr)}
                                                className="text-2xl font-black text-ui-text uppercase tracking-widest hover:text-ui-accent transition-colors text-left"
                                              >
                                                {tr.index_number ? `#${tr.index_number} ` : ""}{tr.name}
                                              </button>
                                          </div>
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-4">
                                          <div className="px-6 py-3 rounded-2xl bg-black/40 border border-white/5 flex flex-col items-center min-w-[100px]">
                                            <span className="text-[10px] font-black text-ui-muted uppercase tracking-widest mb-1">{t("cables", "capacity", "Pojemność")}</span>
                                            <span className="text-base font-bold text-ui-text">{tr.total_length}m</span>
                                          </div>
                                          <div className="px-6 py-3 rounded-2xl bg-black/40 border border-white/5 flex flex-col items-center min-w-[100px]">
                                            <span className="text-[10px] font-black text-ui-muted uppercase tracking-widest mb-1">{t("cables", "used", "Użyte")}</span>
                                            <span className="text-base font-bold text-ui-text">{tr.currentUsed}m</span>
                                          </div>
                                          <div className="px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center min-w-[120px]">
                                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">{t("cables", "remaining", "Pozostanie")}</span>
                                            <span className={`text-base font-black ${tr.canFitAll ? 'text-emerald-400' : 'text-red-400'}`}>
                                              {tr.remainingAfterMerge !== null ? `${tr.remainingAfterMerge}m` : "???"}
                                            </span>
                                          </div>
                                          
                                          {tr.canFitAll ? (
                                            <button 
                                              onClick={async () => {
                                                const cablesToMove = s.cables.filter((c: any) => c.trommel_id !== tr.id);
                                                if (cablesToMove.length === 0) return;
                                                
                                                if (confirm(`Czy na pewno chcesz przenieść ${cablesToMove.length} kabli na bęben ${tr.name}?`)) {
                                                  try {
                                                    await Promise.all(cablesToMove.map((c: any) => 
                                                      apiPatch("/api/cables", { id: c.id, trommel_id: tr.id }, token)
                                                    ));
                                                    await loadCables();
                                                    await loadTrommels();
                                                  } catch (e: any) {
                                                    alert("Błąd podczas scalania: " + e.message);
                                                  }
                                                }
                                              }}
                                              className="xl:ml-4 px-8 py-4 rounded-2xl bg-emerald-500 text-ui-bg text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-500/30"
                                            >
                                              {t("cables", "mergeToThisDrum", "Scal tutaj")}
                                            </button>
                                          ) : (
                                            <div className="xl:ml-4 px-6 py-3 rounded-2xl bg-red-500/10 text-red-400 text-[10px] font-black uppercase border border-red-500/20 tracking-widest">
                                              {t("cables", "noSpace", "Brak miejsca")}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {trCables.map((c: any) => (
                                          <button 
                                            key={c.id} 
                                            onClick={() => {
                                              const full = cables.find(x => x.id === c.id) || (c as any as Cable);
                                              setSelectedCable(full);
                                            }}
                                            className="flex items-center justify-between p-5 rounded-2xl bg-black/40 border border-white/5 hover:border-ui-accent/30 transition-all hover:bg-black/60 shadow-xl text-left group/cable"
                                          >
                                            <span className="font-bold text-ui-text text-base group-hover/cable:text-ui-accent transition-colors">#{c.index_number} {c.name}</span>
                                            <span className="text-xs font-black text-emerald-400 bg-emerald-400/10 px-4 py-1.5 rounded-full shadow-inner">{c.length}m</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {trIdx < s.trommels.length - 1 && (
                                      <div className="flex justify-center my-8">
                                        <div className="w-14 h-14 rounded-full bg-ui-card border-2 border-ui-border flex items-center justify-center text-2xl shadow-2xl z-20 group-hover/opt:border-ui-accent group-hover/opt:rotate-180 transition-all duration-700">↕️</div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="p-8 bg-emerald-500/5 flex items-center justify-center gap-6 border-t border-emerald-500/10 group-hover/opt:bg-emerald-500/10 transition-all">
                            <span className="text-3xl animate-pulse">💡</span>
                            <p className="text-sm font-black text-emerald-400 uppercase tracking-[0.2em] text-center">{t("cables", "logisticsSuggestionAction", "Możesz scalić te kable, aby zaoszczędzić miejsce i czas transportu.")}</p>
                          </div>
                        </div>
                      );

                      if (s.type === "swap") return (
                        <div key={i} className="bg-ui-card border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl transition-all hover:border-amber-500/60 group/swap">
                          <div className="p-10 bg-white/5">
                            <div className="flex items-center gap-6 mb-10">
                              <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center text-4xl border border-amber-500/20 shadow-2xl">🔄</div>
                              <div>
                                <h3 className="text-3xl font-black text-ui-text uppercase tracking-tight">{t("cables", "swapSuggestion", "Sugestia zamiany")}</h3>
                                <p className="text-xs font-black text-amber-500 uppercase tracking-[0.3em]">{t("cables", "optimizationDesc", "Lepsza organizacja bębnów")}</p>
                              </div>
                            </div>

                            <div className="flex flex-col xl:flex-row items-stretch gap-8">
                              <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-8 flex flex-col justify-between">
                                <div>
                                  <p className="text-[10px] font-black text-ui-muted uppercase tracking-widest mb-6">{t("cables", "moveCable", "Przenieś kabel")}</p>
                                  <div className="flex items-center gap-4 mb-4">
                                    <span className="text-xs font-black text-ui-accent bg-ui-accent/10 px-3 py-1 rounded-lg border border-ui-accent/20">#{s.cable.index_number}</span>
                                    <span className="text-xl font-black text-ui-text uppercase">{s.cable.name}</span>
                                  </div>
                                  <p className="text-sm font-bold text-ui-muted opacity-60">{s.cable.cable_routes?.point_a_label} → {s.cable.cable_routes?.point_b_label}</p>
                                </div>
                                <div className="mt-8 pt-8 border-t border-white/5">
                                  <p className="text-[9px] font-black text-ui-muted uppercase mb-2 opacity-40">{t("cables", "fromDrum", "Z bębna")}</p>
                                  <p className="text-base font-black text-ui-text">#{s.fromTr.index_number} {s.fromTr.name}</p>
                                </div>
                              </div>

                              <div className="flex items-center justify-center">
                                <div className="w-14 h-14 rounded-full bg-amber-500 text-ui-bg flex items-center justify-center text-2xl shadow-xl animate-pulse">➡️</div>
                              </div>

                              <div className="flex-1 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-8 flex flex-col justify-between">
                                <div>
                                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-6">{t("cables", "toDrum", "Na bęben")}</p>
                                  <div className="flex items-center gap-4 mb-4">
                                    <span className="text-lg font-black text-ui-text uppercase">#{s.toTr.index_number} {s.toTr.name}</span>
                                  </div>
                                  <p className="text-sm font-bold text-amber-400 opacity-80 italic">{t("cables", "swapReason", "Ten bęben jest już przypisany do tego samego miejsca.")}</p>
                                </div>
                                
                                <button 
                                  onClick={async () => {
                                    if (confirm(`${t("cables", "confirmMove", "Czy na pewno przenieść kabel")} ${s.cable.name} ${t("cables", "toDrumWord", "na bęben")} ${s.toTr.name}?`)) {
                                      try {
                                        await apiPatch("/api/cables", { id: s.cable.id, trommel_id: s.toTr.id }, token);
                                        await loadCables();
                                        await loadTrommels();
                                      } catch (e: any) { alert(e.message); }
                                    }
                                  }}
                                  className="mt-8 w-full py-5 rounded-2xl bg-amber-500 text-ui-bg text-sm font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl shadow-amber-500/30"
                                >
                                  {t("cables", "swapNow", "Zmień bęben")}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                      
                      return null;
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {(activeTab === "cables" || activeTab === "unassigned") && (
          <>
            {isMod && routes.length > 0 && (
              <div className="mb-6">
                <button 
                  onClick={() => setShowRoutes(!showRoutes)}
                  className="w-full flex items-center justify-between bg-black/40 border border-ui-border/30 rounded-2xl px-6 py-4 hover:bg-black/60 transition-all group"
                >
                  <span className="text-xs font-black uppercase tracking-widest text-ui-muted group-hover:text-ui-accent">🗺️ {t("cables", "routesTitle", "Trasy")} ({routes.length})</span>
                  <span className="text-ui-muted">{showRoutes ? "🔼" : "🔽"}</span>
                </button>
                {showRoutes && (
                  <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                    <CableRoutesList routes={routes} token={token} isMod={isMod} projectId={projectId} onAddNew={() => setShowMapPicker(true)}
                      onUpdated={r => {
                        setRoutes(prev => prev.map(x => x.id === r.id ? r : x));
                        setCables(prev => prev.map(c =>
                          c.cable_routes?.id === r.id
                            ? { ...c, cable_routes: { ...c.cable_routes, ...r } }
                            : c
                        ));
                      }}
                      onDeleted={id => setRoutes(prev => prev.filter(x => x.id !== id))} />
                  </div>
                )}
              </div>
            )}

        <div className="bg-[#0F172A]/80 border-2 border-white/10 rounded-2xl p-5 flex flex-col gap-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="relative group">
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-ui-accent/50 group-focus-within:text-ui-accent transition-colors pointer-events-none">
                <Search size={20} strokeWidth={3} />
              </div>
              <input 
                className="w-full bg-black/60 border-2 border-white/5 rounded-2xl pl-8 pr-16 py-4 text-base font-black placeholder:text-ui-muted/20 focus:outline-none focus:border-ui-accent/40 focus:ring-8 focus:ring-ui-accent/5 transition-all shadow-2xl" 
                value={q} 
                onChange={e => setQ(e.target.value)} 
                placeholder={t("cables","searchPlaceholder","Szukaj kabli po nazwie lub #numerze...")} 
              />
            </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(s => (
              <button key={s || "all"} onClick={() => setStatusFilter(s)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${statusFilter === s ? "bg-ui-accent text-ui-bg border-ui-accent scale-105" : "border-ui-border/50 text-ui-muted hover:text-ui-text"}`}>
                {s ? t("cables", `status_${s}`, STATUS_STYLE[s]?.label || s) : t("common", "ALL", "Wszystkie")}
              </button>
            ))}
          </div>
          <div className="h-px bg-white/5 w-full"></div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: t("common", "ALL", "Wszystkie"), icon: "📋" },
              { id: "verified", label: t("cables", "verified", "Zweryfikowano"), icon: "✔️" },
              { id: "unverified", label: t("cables", "notVerified", "Niezweryfikowano"), icon: "❌" },
            ].map(f => (
              <button key={f.id} onClick={() => setVerifiedFilter(f.id as any)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2 ${verifiedFilter === f.id ? "bg-amber-500 text-white border-amber-500 scale-105" : "border-ui-border/50 text-ui-muted hover:text-ui-text"}`}>
                <span>{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && cables.length === 0 ? (
          <p className="text-ui-muted text-sm font-bold text-center py-10">{t("common", "loading", "Ładowanie...")}</p>
        ) : cables.length === 0 ? (
          <p className="text-ui-muted text-sm font-bold text-center py-10">{t("cables","noCables","Brak kabli")}</p>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ui-muted opacity-50">{t("cables", "categoriesTitle", "Rozdzielnie / Kategorie")}</span>
                <span className="text-[9px] font-bold text-ui-accent/50 md:hidden">← {t("common", "swipe", "Przesuń")} →</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-4 pt-1 scrollbar-hide no-scrollbar -mx-2 px-2">
                {groupedCables.map(group => (
                  <button 
                    key={group.categoryId || "none"}
                    onClick={() => setSelectedCategoryId(group.categoryId || "none")}
                    className={`flex-shrink-0 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider border transition-all whitespace-nowrap shadow-lg ${selectedCategoryId === (group.categoryId || "none") ? "bg-ui-accent text-ui-bg border-ui-accent shadow-ui-accent/20" : "bg-white/5 border-ui-border/50 text-ui-muted hover:border-ui-accent/50"}`}
                  >
                    {group.name} ({group.cables.length})
                  </button>
                ))}
              </div>
            </div>

            {groupedCables.filter(g => qD ? g.cables.length > 0 : selectedCategoryId === (g.categoryId || "none")).map(group => (
              <div key={group.categoryId || "none"} className="flex flex-col gap-3">
                <div className="flex items-center gap-3 px-2 py-2">
                  <div className="h-[1px] flex-grow bg-white/5"></div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-ui-accent/60 whitespace-nowrap flex items-center gap-2">
                    {group.name} ({group.cables.length})
                    {group.cables.some((c: any) => c.cable_routes?.plan_id && c.cable_routes.point_a_x != null) && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setMapCategory(group); }}
                        className="p-1 hover:text-ui-accent transition-colors bg-white/5 rounded-md border border-white/5"
                        title={t("cables", "showCategoryMap", "Pokaż mapę kategorii")}
                      >
                        🗺️
                      </button>
                    )}
                  </h3>
                  <div className="h-[1px] flex-grow bg-white/5"></div>
                </div>

                <div className="flex flex-col gap-3">
                  {group.cables.map(cable => {
                    const st = STATUS_STYLE[cable.status] || STATUS_STYLE.pending;
                    const hasMap = !!(cable.cable_routes?.plan_id && cable.cable_routes.point_a_x != null);
                    const isPendingApproval = cable.status === "pending_approval";
                    const isReporting = reporting === cable.id;
                    return (
                      <div key={cable.id} onClick={() => handleCableClick(cable)}
                        className={`group flex items-center gap-4 bg-ui-card border rounded-2xl px-5 py-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 ${isPendingApproval ? "border-yellow-500/30" : hasMap ? "border-emerald-500/20" : "border-ui-border/50"}`}>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {cable.is_verified && (
                              <div className="bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40 border-2 border-emerald-400 animate-in zoom-in duration-300" title={t("cables", "verified", "Zweryfikowano")}>
                                <span className="text-[12px] font-black">✓</span>
                              </div>
                            )}
                            {hasMap && <span className="text-emerald-400 text-sm">🗺</span>}
                            {cable.index_number != null && <span className="text-xs font-black text-ui-accent bg-ui-accent/10 px-2 py-0.5 rounded border border-ui-accent/20">#{cable.index_number}</span>}
                            <p className={`text-base font-black text-ui-text group-hover:text-ui-accent transition-colors ${cable.status === "done" ? "line-through opacity-60" : ""}`}>{cable.name}</p>
                            {cable.cable_type && <span className="text-[10px] font-bold text-ui-muted bg-white/5 px-2 py-0.5 rounded-full">{cable.cable_type}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {cable.length != null && <span className="text-[10px] font-bold text-ui-muted">{cable.length}m</span>}
                            {cable.cable_routes && <span className="text-[10px] font-bold text-ui-muted/70 truncate max-w-[200px]">{cable.cable_routes.point_a_label} → {cable.cable_routes.point_b_label}</span>}
                            {cable.trommels && (() => {
                              const tr = Array.isArray(cable.trommels) ? cable.trommels[0] : cable.trommels;
                              if (!tr) return null;
                              return (
                                <span className="text-[11px] font-black text-ui-text/90 flex items-center gap-2 bg-ui-accent/10 px-3 py-1 rounded-xl border border-ui-accent/30 shadow-sm shadow-ui-accent/5">
                                  <span className="text-[14px]">🔄</span>
                                  {tr.index_number != null && (
                                    <span className="text-ui-accent bg-ui-accent/20 px-1.5 py-0.5 rounded-md border border-ui-accent/40 text-[12px]">
                                      #{tr.index_number}
                                    </span>
                                  )}
                                  <span className="truncate max-w-[120px] tracking-tight">{tr.name}</span>
                                </span>
                              );
                            })()}
                            {isPendingApproval && cable.reported_profile && (
                              <span className="text-[10px] font-bold text-yellow-400/80">{t("cables","reportedBy","zgłosił:")} {cable.reported_profile.full_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span style={{ background: st.bg, color: st.color }} className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-current/30 flex-shrink-0">
                            {t("cables", `status_${cable.status}`, st.label)}
                          </span>
                        </div>
                        {cable.status !== "done" && (
                          <button onClick={e => { e.stopPropagation(); handleReport(cable); }} disabled={isReporting}
                            className={`flex-shrink-0 px-4 py-2 rounded-xl font-black text-xs transition-all disabled:opacity-50 ${isPendingApproval ? "bg-gray-500/10 border border-gray-500/20 text-gray-400 hover:bg-gray-500/20" : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20"}`}>
                            {isReporting ? "..." : isPendingApproval ? `↩ ${t("cables","cancelReport","Cofnij")}` : t("cables","reportApproval","Zgłoś")}
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); setSelectedCable(cable); }} title={isMod ? t("common", "edit", "Edytuj") : t("common", "details", "Szczegóły")} className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/5 border border-ui-border/30 text-ui-muted text-sm hover:bg-white/10 hover:text-ui-text transition-all flex items-center justify-center">
                          {isMod ? "✏️" : "ℹ️"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {hasMore && (
              <div ref={lastElementRef} className="py-4 text-center">
                <p className="text-ui-muted text-xs font-bold uppercase tracking-widest">{t("common", "loading", "Ładowanie...")}</p>
              </div>
            )}
          </div>
        )}
      </>
    )}

    </div>
  )}

      {/* Modals and Overlays */}
      {showCategoriesModal && <CableCategoriesModal projectId={projectId} token={token} onClose={() => setShowCategoriesModal(false)} />}
      {showAdvancedAdder && <AdvancedCableAdderModal projectId={projectId} token={token} onClose={() => setShowAdvancedAdder(false)} onCableAdded={() => { loadCables(); loadTrommels(); }} cableTypes={cableTypes} />}
      {showSerialAdderModal && <SerialCableAdderModal projectId={projectId} token={token} onClose={() => setShowSerialAdderModal(false)} onCableAdded={() => { loadCables(); loadTrommels(); }} cableTypes={cableTypes} />}
      {showScanner && <QrScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      
      {showMapPicker && (
        <CableRouteMapPicker
          projectId={projectId}
          token={token}
          onClose={() => { setShowMapPicker(false); setRouteToEdit(null); }}
          initialPlanId={routeToEdit?.cable_routes?.plan_id || ""}
          initialPinA={routeToEdit?.cable_routes?.point_a_x != null ? { x: routeToEdit.cable_routes.point_a_x, y: routeToEdit.cable_routes.point_a_y! } : null}
          initialPinB={routeToEdit?.cable_routes?.point_b_x != null ? { x: routeToEdit.cable_routes.point_b_x, y: routeToEdit.cable_routes.point_b_y! } : null}
          initialLabelA={routeToEdit?.cable_routes?.point_a_label || ""}
          initialLabelB={routeToEdit?.cable_routes?.point_b_label || ""}
          initialWaypoints={routeToEdit?.cable_routes?.waypoints || []}
          initialPlanId2={routeToEdit?.cable_routes?.plan_id_2}
          initialPinC={routeToEdit?.cable_routes?.point_c_x != null ? { x: routeToEdit.cable_routes.point_c_x, y: routeToEdit.cable_routes.point_c_y! } : null}
          initialPinD={routeToEdit?.cable_routes?.point_d_x != null ? { x: routeToEdit.cable_routes.point_d_x, y: routeToEdit.cable_routes.point_d_y! } : null}
          initialWaypoints2={routeToEdit?.cable_routes?.waypoints_2 || []}
          initialScale={routeToEdit?.cable_routes?.scale}
          initialScale2={routeToEdit?.cable_routes?.scale_2}
          initialPointAPhoto={routeToEdit?.cable_routes?.point_a_photo}
          initialPointBPhoto={routeToEdit?.cable_routes?.point_b_photo}
          onChange={async (val: any) => {
            try {
              if (routeToEdit?.route_id) {
                const r = await apiPatch<Route>("/api/cable-routes", { id: routeToEdit.route_id, ...val }, token);
                setRoutes(prev => prev.map(x => x.id === r.id ? r : x));
                setCables(prev => prev.map(c => c.route_id === r.id ? { ...c, cable_routes: { ...c.cable_routes, ...r } as any } : c));
                if (selectedCable?.route_id === r.id) setSelectedCable(prev => prev ? { ...prev, cable_routes: { ...prev.cable_routes, ...r } as any } : null);
              } else {
                const r = await apiPost<Route>("/api/cable-routes", { project_id: projectId, ...val }, token);
                setRoutes(prev => [r, ...prev]);
                if (routeToEdit) {
                  const updated = await apiPatch<Cable>("/api/cables", { id: routeToEdit.id, route_id: r.id }, token);
                  const fullUpdated = { ...routeToEdit, ...updated, cable_routes: r as any };
                  setCables(prev => prev.map(c => c.id === updated.id ? fullUpdated : c));
                  if (selectedCable?.id === updated.id) setSelectedCable(fullUpdated);
                  
                  // Smart Assignment Suggestion
                  if (!updated.trommel_id) {
                    const bestId = findBestTrommel(fullUpdated);
                    if (bestId) {
                      setSuggestedTrommelId(bestId);
                      setAssignmentTargetCable(fullUpdated);
                      setShowAssignmentModal(true);
                    }
                  }
                }
              }
            } catch (err) {
              console.error("MapPicker error:", err);
            }
            setShowMapPicker(false);
            setRouteToEdit(null);
          }}
        />
      )}
      {/* Forms and other modals */}

      {mapCable && (
        <CableMapModal 
          key={mapCable.id}
          cable={mapCable} 
          token={token} 
          onClose={() => setMapCable(null)} 
          allCables={cables}
          trommels={trommels}
          onUpdated={u => {
            // Update local state immediately for responsiveness
            setCables(prev => prev.map(c => c.id === u.id ? { ...c, ...u } as any : c));
            loadCables();
            loadTrommels();
          }}
          onOpenCable={(c) => {
            const fresh = cables.find(x => x.id === c.id);
            if (fresh) {
              setMapCable(fresh as any);
            } else {
              setMapCable(c as any);
            }
          }}
          onEditCable={(c) => {
            setMapCable(null);
            setSelectedCable(c as any);
          }}
          onSelectTrommel={(tid) => {
            const tr = trommels.find(t => t.id === tid);
            if (tr) {
              setMapCable(null);
              setSelectedTrommel(tr);
            }
          }}
        />
      )}
      {selectedTrommel && (
        <TrommelPanel 
          trommel={selectedTrommel} 
          token={token} 
          isMod={isMod} 
          isAdmin={isAdmin}
          initialEditing={trommelInitialEditing}
          onClose={() => { setSelectedTrommel(null); setTrommelInitialEditing(false); }} 
          onUpdated={u => { 
            loadTrommels(); 
            loadCables(); 
            setSelectedTrommel(prev => prev ? { ...prev, ...u } : null); 
          }} 
          onDeleted={id => { 
            setTrommels(prev => prev.filter(t => t.id !== id)); 
            loadCables(); 
            setSelectedTrommel(null); 
          }} 
          cableTypes={cableTypes} 
          onCableClick={(c) => { 
            setSelectedTrommel(null); 
            const full = cables.find(x => x.id === c.id) || (c as any as Cable); 
            handleCableClick(full);
          }}
          onEditCable={(c) => {
            setSelectedTrommel(null);
            const full = cables.find(x => x.id === c.id) || (c as any as Cable); 
            setSelectedCable(full);
          }}
        />
      )}
      {selectedCable && (
        <CableDrawer
          cable={selectedCable}
          onClose={() => setSelectedCable(null)}
          onUpdated={u => {
            loadCables();
            loadTrommels();
            setSelectedCable(null);
          }}
          onDeleted={id => {
            setCables(prev => prev.filter(c => c.id !== id));
            setSelectedCable(null);
            loadTrommels();
          }}
          onEditRoute={c => {
            setRouteToEdit(c);
            setShowMapPicker(true);
          }}
          isMod={isMod}
          projectId={projectId}
          routes={routes}
          trommels={trommels}
          token={token}
          cableTypes={cableTypes}
          categories={categories}
          findBestTrommel={findBestTrommel}
          allCables={cables}
          onSelectTrommel={(tid) => {
            const tr = trommels.find(t => t.id === tid);
            if (tr) {
              setSelectedCable(null);
              setSelectedTrommel(tr);
            }
          }}
        />
      )}

      {showAssignmentModal && assignmentTargetCable && suggestedTrommelId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-ui-card border border-ui-accent/30 rounded-2xl p-8 max-w-md w-full shadow-2xl shadow-ui-accent/10 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-ui-accent/10 flex items-center justify-center text-2xl shadow-inner border border-ui-accent/20">💡</div>
              <div>
                <h3 className="text-xl font-black text-ui-text uppercase tracking-tight">{t("cables", "assignmentSuggestion", "Sugestia przydziału")}</h3>
                <p className="text-[10px] font-black text-ui-accent uppercase tracking-widest opacity-70">Smart Logistics • Suggestion</p>
              </div>
            </div>
            
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-6">
              <p className="text-sm text-ui-muted font-bold mb-4 leading-relaxed">
                {t("cables", "assignmentSuggestionDesc", "Na podstawie typu kabla i miejsca docelowego, system sugeruje bęben:")}
              </p>
              <div className="flex items-center gap-4 bg-ui-accent/10 p-4 rounded-xl border border-ui-accent/20">
                <div className="w-10 h-10 rounded-lg bg-ui-accent flex items-center justify-center text-ui-bg font-black">#</div>
                <div>
                  <p className="text-sm font-black text-ui-text uppercase">
                    {trommels.find(t => t.id === suggestedTrommelId)?.index_number ? `#${trommels.find(t => t.id === suggestedTrommelId)?.index_number} ` : ""}
                    {trommels.find(t => t.id === suggestedTrommelId)?.name}
                  </p>
                  <p className="text-[10px] font-bold text-ui-muted uppercase">{t("cables", "recommendedDrum", "Rekomendowany bęben")}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={async () => {
                  try {
                    const updated = await apiPatch<Cable>("/api/cables", { id: assignmentTargetCable.id, trommel_id: suggestedTrommelId }, token);
                    setCables(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
                    loadTrommels();
                  } catch (e) { alert("Błąd: " + e); }
                  setShowAssignmentModal(false);
                  setAssignmentTargetCable(null);
                }}
                className="w-full py-4 rounded-xl bg-ui-accent text-ui-bg font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-ui-accent/20"
              >
                {t("cables", "applyAssignment", "Zastosuj przydział")}
              </button>
              <button 
                onClick={() => { setShowAssignmentModal(false); setAssignmentTargetCable(null); }}
                className="w-full py-4 rounded-xl bg-white/5 text-ui-muted font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                {t("common", "cancel", "Pomiń")}
              </button>
            </div>
          </div>
        </div>
      )}

      {publicItemInfo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.9)", backdropFilter: "blur(20px)", padding: 20 }}>
          {publicItemInfo.type === "inactive" ? (
            <div className="w-full max-w-sm bg-ui-card border border-red-500/30 rounded-2xl p-10 text-center shadow-2xl animate-in zoom-in duration-300">
              <div className="mb-8 flex flex-col items-center">
                 <Et4uLogo size="md" animated />
                 <div className="h-px bg-white/10 w-24 mx-auto mt-6"></div>
              </div>
              
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl border border-red-500/20">
                ⚠️
              </div>
              
              <h3 className="text-red-500 text-xs font-black uppercase tracking-widest mb-4">
                QR-Code Inaktiv
              </h3>
              
              <p className="text-xl font-black text-ui-text mb-4">
                Trommel abgeholt
              </p>
              
              <div className="space-y-4 mb-8 text-sm font-bold text-ui-muted leading-relaxed">
                <p>Die Trommel wurde bereits von der Baustelle abgeholt.</p>
                <p>QR-Code Informationen sind nicht mehr verfügbar.</p>
              </div>

              <button 
                onClick={() => { setPublicItemInfo(null); setPublicSearch(""); }}
                className="w-full py-4 rounded-2xl bg-white/5 border border-ui-border/50 text-ui-text font-black hover:bg-white/10 transition-all uppercase tracking-widest text-[10px]"
              >
                Schließen
              </button>
              
              <p className="mt-8 text-[10px] text-ui-muted font-bold uppercase tracking-tighter opacity-40">
                ET⚡U.DE • QR Information System
              </p>
            </div>
          ) : (
            <div className="w-full max-w-sm bg-ui-card border border-ui-accent/30 rounded-2xl p-8 text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-ui-accent/10 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
              {publicItemInfo.type === "trommel" ? "🔄" : "🔌"}
            </div>
            <h3 className="text-ui-muted text-xs font-black uppercase tracking-widest mb-2">
              {publicItemInfo.type === "trommel" ? t("cables", "trommel", "Bęben") : t("cables", "cable", "Kabel")}
            </h3>
            {publicItemInfo.index_number != null && <p className="text-ui-accent font-black mb-1">#{publicItemInfo.index_number}</p>}
            <p className="text-2xl font-black text-ui-text mb-4">{publicItemInfo.name}</p>

            <div className="space-y-3 mb-8 text-left">
              {publicItemInfo.type === "cable" ? (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-ui-muted text-[10px] uppercase font-bold tracking-wider">{t("cables", "status", "Status")}</span>
                    <span className="px-2 py-0.5 rounded-full bg-ui-accent/10 text-ui-accent text-xs font-bold border border-ui-accent/20">
                      {t("cables", `status_${(publicItemInfo as any).status}`, (publicItemInfo as any).status)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-ui-muted text-[10px] uppercase font-bold tracking-wider">{t("cables", "cableType", "Typ kabla")}</span>
                    <span className="text-ui-text text-sm font-bold">{(publicItemInfo as any).cable_type || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-ui-muted text-[10px] uppercase font-bold tracking-wider">{t("cables", "length", "Długość")}</span>
                    <span className="text-ui-text text-sm font-bold">{(publicItemInfo as any).length} m</span>
                  </div>
                  {(publicItemInfo as any).trommels && (
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-ui-muted text-[10px] uppercase font-black tracking-widest">{t("cables", "trommel", "Bęben")}</span>
                      <span className="flex items-center gap-2 bg-ui-accent/10 px-4 py-2 rounded-2xl border border-ui-accent/30 shadow-lg shadow-ui-accent/5">
                        <span className="text-lg">🔄</span>
                        {(publicItemInfo as any).trommels.index_number != null && (
                          <span className="bg-ui-accent text-ui-bg px-2 py-0.5 rounded-lg font-black text-xs">
                            #{(publicItemInfo as any).trommels.index_number}
                          </span>
                        )}
                        <span className="text-ui-text font-black text-sm">{(publicItemInfo as any).trommels.name}</span>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-ui-muted text-[10px] uppercase font-bold tracking-wider">{t("cables", "cableType", "Typ kabla")}</span>
                    <span className="text-ui-text text-sm font-bold">{(publicItemInfo as any).cable_type || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-ui-muted text-[10px] uppercase font-bold tracking-wider">{t("cables_pdf", "lengthTotal", "Długość całk.")}</span>
                    <span className="text-ui-text text-sm font-bold">{(publicItemInfo as any).total_length} m</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-ui-muted text-[10px] uppercase font-bold tracking-wider">{t("cables_pdf", "remaining", "Pozostało")}</span>
                    <span className="text-ui-accent text-sm font-black">{(publicItemInfo as any).total_length - ((publicItemInfo as any).used_length || 0)} m</span>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-ui-muted mb-2">{t("cables", "cablesOnTrommel", "Kable na bębnie")}</p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                      {((publicItemInfo as any).cables || []).length === 0 ? (
                        <p className="text-xs text-ui-muted italic">{t("cables", "noAssignedCables", "Brak przypisanych kabli")}</p>
                      ) : (
                        (publicItemInfo as any).cables.map((c: any) => {
                          const hasMap = !!(c.cable_routes?.plan_id && c.cable_routes.point_a_x != null);
                          return (
                            <div 
                              key={c.id} 
                              onClick={() => {
                                if (hasMap) {
                                  setMapCable(c);
                                  setPublicItemInfo(null);
                                }
                              }}
                              className={`flex items-center justify-between p-3 rounded-xl bg-white/5 border ${hasMap ? "border-ui-accent/30 cursor-pointer hover:bg-ui-accent/5" : "border-white/5"} transition-all`}
                            >
                              <div className="text-left">
                                <p className={`text-xs font-bold ${hasMap ? "text-ui-accent" : "text-ui-text"}`}>
                                  {hasMap && "🗺 "}
                                  {c.index_number ? `#${c.index_number} ` : ""}
                                  {c.name}
                                </p>
                                {c.cable_routes && <p className="text-[9px] text-ui-muted">{c.cable_routes.point_a_label} → {c.cable_routes.point_b_label}</p>}
                              </div>
                              <span className="text-[10px] font-black text-ui-muted">{c.length}m</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="mb-6">
              <p className="text-[10px] text-ui-muted uppercase tracking-widest mb-2">{t("cables", "publicSearchAnother", "Wyszukaj inny numer")}</p>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={publicSearch} 
                  onChange={e => setPublicSearch(e.target.value)} 
                  placeholder={t("cables", "publicSearchPlaceholder", "Numer kabla")}
                  className="flex-1 bg-black/40 border border-ui-border/50 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ui-accent text-ui-text"
                />
                <button 
                  onClick={() => handlePublicSearch(publicSearch)}
                  disabled={publicSearching}
                  className="bg-ui-accent text-ui-bg px-4 py-2 rounded-xl font-black text-sm"
                >
                  {t("cables", "publicSearchBtn", "Szukaj")}
                </button>
              </div>
            </div>

            {(publicItemInfo as any).type === "cable" && (publicItemInfo as any).cable_routes?.plan_id && (
              <button 
                onClick={() => { setMapCable(publicItemInfo as any); setPublicItemInfo(null); }}
                className="w-full py-4 rounded-2xl bg-ui-accent/10 border border-ui-accent/20 text-ui-accent font-black hover:bg-ui-accent/20 transition-all mb-3"
              >
                {t("cables", "publicViewMap", "🗺 Zobacz na mapie")}
              </button>
            )}

            <button 
              onClick={() => { setPublicItemInfo(null); setPublicSearch(""); }}
              className="w-full py-4 rounded-2xl bg-white/5 border border-ui-border/50 text-ui-text font-black hover:bg-white/10 transition-all"
            >
              {t("common", "close", "Zamknij")}
            </button>
            <p className="mt-6 text-[10px] text-ui-muted font-bold uppercase tracking-tighter opacity-40">ET⚡U.DE • QR Information System</p>
          </div>
          )}
        </div>
      )}
      {isBulkReportModalOpen && (
        <BulkTrommelReportModal
          isOpen={isBulkReportModalOpen}
          onClose={() => setIsBulkReportModalOpen(false)}
          selectedTrommels={trommels.filter(tr => selectedTrommels.has(tr.id)) as any}
          onSuccess={() => {
            loadTrommels();
            setSelectedTrommels(new Set());
          }}
        />
      )}
      {mapCategory && (
        <CategoryMapModal
          categoryName={mapCategory.name}
          cables={mapCategory.cables}
          trommels={trommels}
          token={token}
          isAdmin={isAdmin}
          onUpdated={() => {
            loadCables();
          }}
          onClose={() => setMapCategory(null)}
          onSelectCable={(c) => {
            setMapCategory(null);
            setMapCable(c as any);
          }}
          onEditCable={(c) => {
            setMapCategory(null);
            setSelectedCable(c as any);
          }}
          onSelectTrommel={(tid) => {
            const tr = trommels.find(t => t.id === tid);
            if (tr) {
              setMapCategory(null);
              setSelectedTrommel(tr);
            }
          }}
        />
      )}
    </div>
  );
}
