"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost, apiPatch, apiDelete, apiCall } from "@/lib/apiClient";
import { useNotification } from "@/contexts/NotificationContext";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Zap, Search, Layers, Map as MapIcon, Link as LinkIcon, 
  FileDown, Trash2, X, CheckCircle2, Activity, Plus, 
  Settings, ChevronRight, Layout, Database, Globe
} from "lucide-react";
import { QrScanner } from "@/components/QrScanner";

const BmaLeafletEditor = dynamic(
  () => import("@/components/BmaLeafletEditor"),
  { ssr: false }
) as any;

const BmaKabelGenerator = dynamic(
  () => import("./BmaKabelGenerator"),
  { ssr: false }
) as any;

const BmaPlanQrModal = dynamic(
  () => import("./BmaPlanQrModal"),
  { ssr: false }
) as any;

export default function BmaAutomationClient() {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const [token, setToken] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [plans, setPlans] = useState<any[]>([]);
  const [activePlanId, setActivePlanId] = useState("");
  const [devices, setDevices] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [existingTypes, setExistingTypes] = useState<string[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"scan" | "loops" | "devices" | "editor" | "generator" | "export">("editor");
  const [scanning, setScanning] = useState(false);
  const [loopScanning, setLoopScanning] = useState(false);
  const [loopResults, setLoopResults] = useState<any[]>([]);
  const [loopPdfData, setLoopPdfData] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState("");
  const [snapshotType, setSnapshotType] = useState<"full" | "devices" | "routes">("full");
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [selectedScanIds, setSelectedScanIds] = useState<number[]>([]);
  const [settings, setSettings] = useState<any>({ scale: 100 });
  const [qrModalPlan, setQrModalPlan] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const isAdmin = (user?.role || "").toUpperCase() === "ADMIN";
  const isLoggedIn = !!user;

  const handleLoopScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePlanId) return;

    setLoopScanning(true);
    setLoopResults([]);
    setLoopPdfData(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        setLoopPdfData(base64);
        const res = await apiCall<any>("/api/bma/scan-loops", {
          method: "POST",
          body: {
            fileData: base64,
            projectId,
            planId: activePlanId,
            dryRun: true
          },
          timeoutMs: 120000
        });
        setLoopResults(res.connections || []);
        showNotification(`Schematic analyzed. Found ${res.connections?.length || 0} loops. Review and confirm to link.`, "success");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showNotification(err.message || "Error scanning loops", "error");
    } finally {
      setLoopScanning(false);
      e.target.value = ""; // Reset input
    }
  };

  const handleApplyLoops = async () => {
    if (!loopPdfData || !activePlanId) return;
    setLoopScanning(true);
    try {
      const res = await apiCall<any>("/api/bma/scan-loops", {
        method: "POST",
        body: {
          fileData: loopPdfData,
          projectId,
          planId: activePlanId,
          dryRun: false
        },
        timeoutMs: 120000
      });
      showNotification(`Successfully created ${res.routesCreated} routes across ${res.connections?.length || 0} loops.`, "success");
      setLoopResults([]);
      setLoopPdfData(null);
      loadData();
    } catch (err: any) {
      showNotification(err.message || "Error applying loops", "error");
    } finally {
      setLoopScanning(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!activePlanId || !projectId || !newSnapshotName) return;
    setIsSavingSnapshot(true);
    try {
      await apiPost("/api/bma/snapshots", { 
        projectId,
        planId: activePlanId, 
        name: newSnapshotName,
        type: snapshotType
      });
      showNotification("Snapshot saved", "success");
      setNewSnapshotName("");
      loadSnapshots();
    } catch (e: any) {
      showNotification(e.message, "error");
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleLoadSnapshot = async (id: string) => {
    if (!window.confirm("Restore this snapshot? (This will overwrite current state)")) return;
    try {
      await apiPost(`/api/bma/load-snapshot`, { snapshotId: id });
      showNotification("Snapshot restored", "success");
      loadData();
    } catch (e: any) {
      showNotification(e.message, "error");
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    try {
      await apiDelete(`/api/bma/snapshots?id=${id}`);
      loadSnapshots();
    } catch (e: any) {
      showNotification(e.message, "error");
    }
  };

  const loadSnapshots = useCallback(async () => {
    if (!activePlanId || !projectId) return;
    try {
      const res = await apiGet<any[]>(`/api/bma/snapshots?projectId=${projectId}&planId=${activePlanId}`);
      setSnapshots(res || []);
    } catch (e) {
      console.error(e);
      setSnapshots([]);
    }
  }, [activePlanId, projectId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    let alive = true;
    apiGet<any>('/api/me').then(j => {
      if (alive) setUser(j.profile);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const tabs = useMemo(() => {
    const base = [
      { id: "scan", icon: Search, label: t('bmaAutomation', 'pdfDecoder', 'PDF Decoder') },
      { id: "loops", icon: Activity, label: t('bmaAutomation', 'loopManager', 'Loop Manager') },
      { id: "devices", icon: Layers, label: t('bmaAutomation', 'devices', 'Devices') },
      { id: "editor", icon: MapIcon, label: t('bmaAutomation', 'tabEditor', 'Map Editor') },
    ];
    if (isAdmin) {
      base.push({ id: "generator", icon: Layout, label: t('bmaAutomation', 'export', 'Export') });
      base.push({ id: "export", icon: FileDown, label: "Export" });
    }
    return base;
  }, [isAdmin, t]);

  useEffect(() => {
    if (!isAdmin && activeTab !== "editor") {
      setActiveTab("editor");
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data?.session?.access_token || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setToken(s?.access_token || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    apiGet<any[]>("/api/projects").then(ps => {
      setProjects(ps || []);
      const saved = typeof window !== "undefined" ? localStorage.getItem("selectedProjectId") : null;
      const found = ps.find((p: any) => p.id === saved);
      setProjectId(found?.id || ps?.[0]?.id || "");
    });
  }, [token]);

  useEffect(() => {
    if (!projectId || !token) return;
    apiGet<any[]>(`/api/plans?projectId=${projectId}&limit=100`).then(res => {
      const ps = (res as any)?.data || res || [];
      const filtered = isAdmin ? ps : ps.filter((p: any) => p.is_archived === true);
      setPlans(filtered);
      if (filtered.length > 0 && !activePlanId) {
        setActivePlanId(filtered[0].id);
      }
    });
    apiGet<any>(`/api/bma/settings?projectId=${projectId}`).then(res => {
      setSettings(res?.data || res);
    });
    apiGet<any[]>(`/api/cable-categories?projectId=${projectId}`).then(setCategories);
    apiGet<string[]>("/api/cable-types").then(types => {
        setExistingTypes(types || []);
    });
  }, [projectId, token, isAdmin]);

  const loadData = useCallback(async () => {
    if (!projectId || !token) return;
    setLoading(true);
    try {
      const [devs, conns] = await Promise.all([
        apiGet<any>(`/api/bma/devices?projectId=${projectId}`),
        apiGet<any>(`/api/bma/connections?projectId=${projectId}`)
      ]);
      console.log('[BmaAutomation] Loaded:', { devs, conns });
      setDevices(devs || []);
      setConnections(conns?.connections || []);
      setRoutes(conns?.routes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleScan = async () => {
    if (!activePlanId) {
        showNotification("Select a plan first", "error");
        return;
    }
    setScanning(true);
    setScanResults([]);
    try {
        const res = await apiPost<any>("/api/bma/scan", { 
            planId: activePlanId, 
            projectId: projectId,
            useExisting: true 
        });
        const detected = res.data || res;
        setScanResults(Array.isArray(detected) ? detected : []);
        setSelectedScanIds(Array.isArray(detected) ? detected.map((_, i) => i) : []);
        showNotification(`AI Scan complete. Found ${detected.length || 0} units.`, "success");
    } catch (err: any) {
        showNotification(`Scan failed: ${err.message}`, "error");
    } finally {
        setScanning(false);
    }
  };

  const handleAddDetectedDevices = async () => {
    if (selectedScanIds.length === 0) return;
    setLoading(true);
    try {
        const toAdd = selectedScanIds.map(idx => scanResults[idx]);
        const payload = toAdd.map(d => ({
            project_id: projectId,
            plan_id: activePlanId,
            name: d.name,
            type: d.type || "Detected",
            x: d.x,
            y: d.y,
            metadata: { page: d.page, source: "PDF Decoder" }
        }));

        await apiPost("/api/bma/devices", payload);
        showNotification(`Successfully added ${payload.length} devices to plan`, "success");
        setScanResults([]);
        setSelectedScanIds([]);
        loadData();
    } catch (err: any) {
        showNotification(`Failed to add devices: ${err.message}`, "error");
    } finally {
        setLoading(false);
    }
  };

  const selectAllScans = () => setSelectedScanIds(scanResults.map((_, i) => i));
  const deselectAllScans = () => setSelectedScanIds([]);
  const toggleScanSelection = (id: number) => {
    setSelectedScanIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const clearPlanDevices = async () => {
    console.log("[BmaAutomation] clearPlanDevices triggered for:", activePlanId);
    if (!activePlanId) {
        showNotification("No plan selected", "error");
        return;
    }
    if (!window.confirm("WARNING: This will delete ALL devices and routes for this plan. Proceed?")) return;
    
    setLoading(true);
    try {
      console.log("[BmaAutomation] Calling DELETE /api/bma/devices?planId=" + activePlanId);
      const res = await apiDelete<any>(`/api/bma/devices?planId=${activePlanId}`);
      console.log("[BmaAutomation] DELETE response:", res);
      showNotification("Plan wiped successfully", "success");
      loadData();
    } catch (err: any) {
      console.error("[BmaAutomation] Wipe error:", err);
      showNotification(err.message || "Wipe failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30">
    <div className="p-4 md:p-8 lg:p-16 max-w-[1920px] mx-auto">
      <div className="space-y-12">
        {/* Header - Unified Look */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10">
          <div className="space-y-4">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-500/20">
                   <Activity className="w-6 h-6 text-white" />
                </div>
                 <div className="space-y-2">
                    <h1 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase">BMA AUTOMATION</h1>
                 </div>
              </div>
          </div>
          
          <div className="flex items-center bg-black/40 p-2 rounded-2xl border border-white/5 backdrop-blur-xl gap-2 shadow-2xl">
            {tabs.map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-3 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === tab.id ? "bg-blue-600 text-white shadow-[0_0_40px_rgba(37,99,235,0.4)] scale-105" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "animate-pulse" : ""}`} />
                <span className="hidden xl:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
          
          {/* Sidebar Area (Selection / Info) */}
          <div className="xl:col-span-3 space-y-10">
             <motion.div 
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-10 space-y-8 shadow-2xl shadow-black/50"
             >
                <div className="flex items-center gap-4 border-b border-white/5 pb-8">
                   <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center">
                      <Database className="w-5 h-5 text-blue-500" />
                   </div>
                   <div className="flex-1">
                      <select 
                        value={projectId} 
                        onChange={e => {
                          const newId = e.target.value;
                          setProjectId(newId);
                          if (typeof window !== "undefined") localStorage.setItem("selectedProjectId", newId);
                        }}
                        className="w-full bg-transparent border-none text-[10px] font-black text-white uppercase tracking-widest outline-none cursor-pointer appearance-none"
                      >
                        {projects.map(p => (
                          <option key={p.id} value={p.id} className="bg-slate-900">{p.companies?.name ? `[${p.companies.name.toUpperCase()}] ` : ""}{p.name}</option>
                        ))}
                      </select>
                      <p className="text-slate-500 text-[9px] font-bold uppercase mt-1">{t("bmaAutomation", "selectProject", "Select Project")}</p>
                   </div>
                </div>

                <div className="space-y-6">
                   <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4">{t("bmaAutomation", "currentPlan", "Current Plan")}</label>
                       <div className="flex items-center gap-3">
                          <select 
                            value={activePlanId} onChange={e => setActivePlanId(e.target.value)}
                            className="flex-1 bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-[10px] font-black text-blue-400 outline-none hover:border-blue-500/50 transition-all cursor-pointer shadow-inner appearance-none"
                          >
                            <option value="">-- {t('bmaAutomation', 'selectPlan')} --</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{[p.floors?.buildings?.name, p.floors?.name].filter(Boolean).join(" - ") || `Plan v${p.version}`}</option>)}
                          </select>
                          {isAdmin && activePlanId && (
                             <button 
                               onClick={async () => {
                                  const plan = plans.find(p => p.id === activePlanId);
                                  const newState = !plan?.is_archived;
                                  await apiPatch("/api/plans", { id: activePlanId, is_archived: newState });
                                  showNotification(newState ? t("bmaAutomation", "shareWithTeam", "Plan shared with team") : t("bmaAutomation", "hideFromTeam", "Plan hidden from team"), "success");
                                  // reload plans
                                  apiGet<any[]>(`/api/plans?projectId=${projectId}&limit=100`).then(res => {
                                      const ps = (res as any)?.data || res || [];
                                      setPlans(isAdmin ? ps : ps.filter((p: any) => p.is_archived === true));
                                  });
                               }}
                               title={plans.find(p => p.id === activePlanId)?.is_archived ? t('bmaAutomation', 'hideFromTeam', 'Hide from Team') : t('bmaAutomation', 'shareWithTeam', 'Share with Team')}
                               className={`p-4 rounded-2xl border transition-all ${plans.find(p => p.id === activePlanId)?.is_archived ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-500" : "bg-white/5 border-white/10 text-slate-500 hover:text-white"}`}
                             >
                                <Globe className="w-4 h-4" />
                             </button>
                          )}
                       </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/40 border border-white/5 p-6 rounded-2xl text-center space-y-2 group hover:border-blue-500/30 transition-all duration-500">
                         <p className="text-[8px] font-black text-slate-500 uppercase">{t("bmaAutomation", "devices", "Devices")}</p>
                         <p className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors">
                            {activePlanId ? devices.filter((d: any) => d.plan_id === activePlanId).length : devices.length}
                         </p>
                      </div>
                      <div className="bg-black/40 border border-white/5 p-6 rounded-2xl text-center space-y-2 group hover:border-cyan-500/30 transition-all duration-500">
                         <p className="text-[8px] font-black text-slate-500 uppercase">{t("bmaAutomation", "routes", "Routes")}</p>
                         <p className="text-2xl font-black text-white group-hover:text-cyan-400 transition-colors">
                            {activePlanId ? routes.filter((r: any) => {
                               const src = devices.find((d: any) => d.id === r.source_device_id);
                               return src?.plan_id === activePlanId;
                            }).length : routes.length}
                         </p>
                      </div>
                   </div>
                </div>

                {isAdmin && (
                  <div className="pt-8 border-t border-white/5">
                    <button 
                      onClick={clearPlanDevices} 
                      disabled={loading || !activePlanId} 
                      className="w-full flex items-center justify-center gap-3 py-5 bg-red-600/10 border border-red-500/20 rounded-2xl text-[10px] font-black text-red-400 hover:bg-red-600 hover:text-white transition-all duration-500 disabled:opacity-50 shadow-lg"
                    >
                        <Trash2 className="w-4 h-4" />
                        {t('bmaAutomation', 'wipePlan', 'WIPE CURRENT PLAN')}
                    </button>
                  </div>
                )}
             </motion.div>

             <motion.div 
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                className="bg-slate-900/20 backdrop-blur-3xl border border-white/5 rounded-2xl p-10 space-y-6 shadow-xl shadow-black/20"
             >
                <div className="flex items-center gap-4">
                   <Globe className="w-4 h-4 text-slate-600" />
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("bmaAutomation", "networkStatus", "Network Status")}</p>
                </div>
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] animate-pulse"></div>
                   <p className="text-[10px] font-black text-white">{t("bmaAutomation", "systemOnline", "SYSTEM ONLINE")}</p>
                </div>
             </motion.div>
          </div>

          {/* Main Content Area */}
          <div className="xl:col-span-9">
            <AnimatePresence mode="wait">
              {activeTab === "scan" && (
                <motion.div 
                  key="scan" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-16 lg:p-24 relative overflow-hidden shadow-2xl"
                >
                   <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none"></div>
                   
                   <div className="max-w-4xl mx-auto space-y-12 relative z-10">
                      <div className="text-center space-y-4">
                         <h2 className="text-4xl font-black text-white uppercase tracking-tight">{t("bmaAutomation", "pdfDecoder", "PDF DECODER")}</h2>
                         <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{t("bmaAutomation", "pdfDecoderSubtitle", "Advanced PDF Layer Recognition Engine")}</p>
                      </div>

                      {scanResults.length === 0 ? (
                        <div className="p-16 bg-black/40 border border-white/5 rounded-2xl shadow-inner space-y-10">
                           <div className="flex flex-col items-center gap-6">
                              <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-700 ${scanning ? "border-blue-500 border-t-transparent animate-spin" : "border-white/10"}`}>
                                 <Search className={`w-10 h-10 ${scanning ? "text-blue-500" : "text-slate-700"}`} />
                              </div>
                              <p className="text-slate-400 text-xs font-black uppercase tracking-[0.3em]">{scanning ? t("bmaAutomation", "processingInfra", "Processing Infrastructure...") : t("bmaAutomation", "readyToAnalyze", "Ready to Analyze")}</p>
                           </div>

                           <div className="grid grid-cols-1 gap-6">
                              <button 
                                onClick={handleScan}
                                disabled={!activePlanId || scanning}
                                className="w-full py-6 bg-blue-600 shadow-2xl shadow-blue-600/30 rounded-2xl text-[11px] font-black text-white uppercase tracking-[0.3em] hover:bg-blue-500 transition-all duration-500 disabled:opacity-50 disabled:grayscale"
                              >
                                {scanning ? t("bmaAutomation", "scanningBtn", "SCANNING...") : t("bmaAutomation", "initScan", "INITIALIZE SYSTEM SCAN")}
                              </button>
                           </div>
                        </div>
                      ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                           <div className="flex justify-between items-center px-4">
                              <div className="flex gap-4">
                                 <button onClick={selectAllScans} className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:text-white transition-all">{t("bmaAutomation", "selectAll", "SELECT ALL")}</button>
                                 <button onClick={deselectAllScans} className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all">{t("bmaAutomation", "deselectAll", "DESELECT ALL")}</button>
                              </div>
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{selectedScanIds.length} {t("bmaAutomation", "selected", "SELECTED")}</p>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                              {scanResults.map((res, i) => (
                                 <div 
                                    key={i} onClick={() => toggleScanSelection(i)}
                                    className={`p-6 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${selectedScanIds.includes(i) ? "bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/5" : "bg-black/40 border-white/5 hover:border-white/20"}`}
                                 >
                                    <div className="flex items-center gap-4">
                                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${selectedScanIds.includes(i) ? "bg-blue-600 text-white" : "bg-white/5 text-slate-500"}`}>
                                          {res.name.slice(0,2)}
                                       </div>
                                       <div>
                                          <p className="text-sm font-black text-white uppercase">{res.name}</p>
                                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t("bmaAutomation", "page", "Page")} {res.page} • {t("bmaAutomation", "detected", "DETECTED")}</p>
                                       </div>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedScanIds.includes(i) ? "border-blue-500 bg-blue-500 text-white" : "border-white/10 group-hover:border-white/30"}`}>
                                       {selectedScanIds.includes(i) && <CheckCircle2 className="w-4 h-4" />}
                                    </div>
                                 </div>
                              ))}
                           </div>

                           <div className="pt-8 border-t border-white/5 flex gap-4">
                              <button 
                                onClick={() => setScanResults([])}
                                className="px-8 py-5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all"
                              >
                                DISCARD
                              </button>
                              <button 
                                onClick={handleAddDetectedDevices}
                                disabled={loading || selectedScanIds.length === 0}
                                className="flex-1 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl shadow-blue-600/20 hover:scale-[1.02] transition-all disabled:opacity-50"
                              >
                                {loading ? t("bmaAutomation", "addingDevices", "ADDING DEVICES...") : t("bmaAutomation", "addDevicesToPlan", "ADD {count} DEVICES TO PLAN").replace("{count}", String(selectedScanIds.length))}
                              </button>
                           </div>
                        </div>
                      )}
                   </div>
                </motion.div>
              )}

              {activeTab === "loops" && (
                <motion.div 
                  key="loops" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-16 lg:p-24 relative overflow-hidden shadow-2xl"
                >
                   <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none"></div>
                   
                   <div className="max-w-4xl mx-auto space-y-12 relative z-10 text-center">
                      <div className="space-y-4">
                         <h2 className="text-4xl font-black text-white uppercase tracking-tight">{t("bmaAutomation", "loopManager", "LOOP MANAGER")}</h2>
                         <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">{t("bmaAutomation", "loopManagerSubtitle", "Import Schematic Routing Infrastructure")}</p>
                      </div>

                      <div className="p-16 bg-black/40 border border-white/5 rounded-2xl shadow-inner space-y-10">
                         {loopResults.length === 0 ? (
                            <>
                               <div className="flex flex-col items-center gap-6">
                                  <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-700 ${loopScanning ? "border-emerald-500 border-t-transparent animate-spin" : "border-white/10"}`}>
                                     <Activity className={`w-10 h-10 ${loopScanning ? "text-emerald-500" : "text-slate-700"}`} />
                                  </div>
                                  <p className="text-slate-400 text-xs font-black uppercase tracking-[0.3em]">{loopScanning ? t("bmaAutomation", "parsingSchematic", "Parsing Schematic...") : t("bmaAutomation", "readyToLink", "Ready to Link Infrastructure")}</p>
                               </div>

                               <div className="max-w-md mx-auto">
                                  <input 
                                    type="file" 
                                    accept=".pdf" 
                                    className="hidden" 
                                    id="loop-import-tab" 
                                    onChange={handleLoopScan}
                                    disabled={!activePlanId || loopScanning}
                                  />
                                  <button 
                                    onClick={() => document.getElementById('loop-import-tab')?.click()}
                                    disabled={!activePlanId || loopScanning}
                                    className="w-full py-8 bg-emerald-600 shadow-2xl shadow-emerald-600/30 rounded-2xl text-[11px] font-black text-white uppercase tracking-[0.3em] hover:bg-emerald-500 transition-all duration-500 disabled:opacity-50 disabled:grayscale"
                                  >
                                    {loopScanning ? t("bmaAutomation", "processing", "PROCESSING...") : t("bmaAutomation", "selectSchematicPdf", "SELECT SCHEMATIC PDF")}
                                  </button>
                                  <p className="mt-6 text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                                    This will draw routes between existing devices based on the loop sequencing in your PDF schematic. No new devices will be added.
                                  </p>
                               </div>
                            </>
                         ) : (
                            <div className="space-y-10">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                                  {loopResults.map((loop, idx) => (
                                     <div key={idx} className="p-8 bg-slate-900/60 border border-white/10 rounded-2xl space-y-4">
                                        <div className="flex items-center gap-4">
                                           <div className="w-4 h-4 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]" style={{ backgroundColor: loop.color }}></div>
                                           <p className="text-sm font-black text-white uppercase tracking-widest">{loop.name}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                           {loop.devices.map((dName: string, dIdx: number) => (
                                              <span key={dIdx} className="text-[9px] font-bold px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-slate-400">
                                                 {dName}
                                              </span>
                                           ))}
                                        </div>
                                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{loop.devices.length - 1} {t("bmaAutomation", "routesIdentified", "Routes identified")}</p>
                                     </div>
                                  ))}
                               </div>

                               <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row gap-6 justify-center">
                                  <button 
                                    onClick={() => { setLoopResults([]); setLoopPdfData(null); }}
                                    className="px-12 py-6 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-white/10 transition-all"
                                  >
                                     Cancel
                                  </button>
                                  <button 
                                    onClick={handleApplyLoops}
                                    disabled={loopScanning}
                                    className="px-20 py-6 bg-emerald-600 shadow-2xl shadow-emerald-600/30 rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.3em] hover:bg-emerald-500 transition-all duration-500 disabled:opacity-50"
                                  >
                                     {loopScanning ? t("bmaAutomation", "applying", "APPLYING...") : t("bmaAutomation", "confirmAddRoutes", "CONFIRM AND ADD ROUTES TO MAP")}
                                  </button>
                               </div>
                            </div>
                         )}
                      </div>
                   </div>
                </motion.div>
              )}

              {activeTab === "devices" && (
                <motion.div 
                  key="devices" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  className="space-y-10"
                >
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {devices.length === 0 ? (
                        <div className="col-span-full py-48 text-center bg-slate-900/20 rounded-2xl border border-dashed border-white/5">
                           <Layers className="w-16 h-16 text-slate-800 mx-auto mb-6 opacity-20" />
                           <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.4em]">{t('bmaAutomation', 'noDevices')}</p>
                        </div>
                      ) : (
                        devices.map((dev) => (
                          <motion.div 
                            layout key={dev.id} 
                            className="group bg-slate-900/40 backdrop-blur-2xl border border-white/5 p-8 rounded-2xl hover:border-blue-500/30 transition-all duration-500 shadow-xl hover:shadow-blue-500/5"
                          >
                             <div className="flex justify-between items-start mb-8">
                                <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-500 group-hover:scale-110 transition-all duration-700 shadow-inner">
                                   <span className="text-xs font-black text-white">{dev.name.slice(0,2)}</span>
                                </div>
                                <button onClick={() => apiDelete(`/api/bma/devices?id=${dev.id}`).then(loadData)} className="p-3 text-slate-700 hover:text-red-400 transition-all duration-500 hover:bg-red-500/5 rounded-xl">
                                   <Trash2 className="w-5 h-5" />
                                </button>
                             </div>
                             <div className="space-y-2">
                                <h3 className="text-xl font-black text-white uppercase tracking-tight">{dev.name}</h3>
                                <p className="text-[10px] font-black text-blue-500/70 uppercase tracking-[0.2em]">{dev.type || t("bmaAutomation", "unknownUnit", "UNKNOWN UNIT")}</p>
                             </div>
                             <div className="mt-8 pt-8 border-t border-white/5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                   <div className="space-y-1">
                                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">{t("bmaAutomation", "serialNumber", "Serial Number")}</p>
                                      <p className="text-[10px] font-black text-blue-400">{dev.metadata?.serial_number || t("bmaAutomation", "notSet", "NOT SET")}</p>
                                   </div>
                                   <div className="text-right space-y-1">
                                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">{t("bmaAutomation", "media", "Media")}</p>
                                      <p className="text-[10px] font-black text-slate-400">{(dev.metadata?.photos || []).length} {t("bmaAutomation", "photos", "Photos")}</p>
                                   </div>
                                </div>
                                <div className="flex items-center justify-between">
                                   <div className="space-y-1">
                                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">{t("bmaAutomation", "locationStatus", "Location Status")}</p>
                                      <span className="text-[10px] font-black text-slate-300">{plans.find(p => p.id === dev.plan_id)?.name || "N/A"}</span>
                                   </div>
                                   <span className="text-[10px] font-mono text-slate-600 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">{dev.x.toFixed(3)}, {dev.y.toFixed(3)}</span>
                                </div>
                             </div>
                          </motion.div>
                        ))
                      )}
                   </div>
                </motion.div>
              )}

              {activeTab === "editor" && (
                <motion.div 
                  key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-10"
                >
                {/* Snapshot Manager Section - Admin Only */}
                {isAdmin && (
                  <div className="bg-slate-900/50 rounded-2xl p-8 border border-white/5 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-wider">{t("bmaAutomation", "planSnapshots", "Plan Snapshots")}</h3>
                      <p className="text-slate-400 text-sm">{t("bmaAutomation", "snapshotSubtitle", "Save or restore your work state")}</p>
                    </div>
                    <div className="flex gap-3">
                      <select 
                        value={snapshotType}
                        onChange={(e: any) => setSnapshotType(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-blue-500/50 transition-all"
                      >
                        <option value="full">{t("bmaAutomation", "snapshotFull", "Execution Plan (Full)")}</option>
                        <option value="devices">{t("bmaAutomation", "snapshotDevices", "Devices")}</option>
                        <option value="routes">{t("bmaAutomation", "snapshotRoutes", "Routes")}</option>
                      </select>
                      <input 
                        type="text" 
                        value={newSnapshotName}
                        onChange={(e) => setNewSnapshotName(e.target.value)}
                        placeholder={t("bmaAutomation", "snapshotPlaceholder", "Snapshot name...")}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-blue-500/50 transition-all min-w-[200px]"
                      />
                      <button 
                        onClick={handleCreateSnapshot}
                        disabled={isSavingSnapshot || !newSnapshotName.trim()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg shadow-blue-600/20"
                      >
                        {isSavingSnapshot ? t("bmaAutomation", "savingSnapshot", "SAVING...") : t("bmaAutomation", "createSnapshot", "CREATE SNAPSHOT")}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {snapshots.length === 0 ? (
                      <div className="col-span-full py-12 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{t("bmaAutomation", "noSnapshots", "No snapshots found for this plan")}</p>
                      </div>
                    ) : (
                      snapshots.map(sn => (
                        <div key={sn.id} className="bg-black/40 p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all group">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-white font-black text-sm uppercase truncate max-w-[120px]">{sn.name}</p>
                                <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${
                                  sn.type === 'full' ? 'bg-blue-500/20 text-blue-400' :
                                  sn.type === 'devices' ? 'bg-green-500/20 text-green-400' :
                                  'bg-purple-500/20 text-purple-400'
                                }`}>
                                  {sn.type}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                                {new Date(sn.created_at).toLocaleString()}
                              </p>
                            </div>
                            <button 
                              onClick={() => handleDeleteSnapshot(sn.id)}
                              className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <button 
                            onClick={() => handleLoadSnapshot(sn.id)}
                            className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase rounded-xl border border-white/5 transition-all"
                          >
                            RESTORE SNAPSHOT
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  </div>
                )}

                {/* Import Loop Schematic Section */}
                <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl h-[850px] relative">
                      {activePlanId ? (
                        <BmaLeafletEditor 
                          projectId={projectId} planId={activePlanId} token={token} 
                          devices={devices.filter(d => d.plan_id === activePlanId)} 
                          connections={connections}
                          routes={routes.filter(r => {
                            const src = devices.find(d => d.id === r.source_device_id);
                            return src?.plan_id === activePlanId;
                          })}
                           onSave={loadData}
                           isAdmin={isAdmin}
                           isLoggedIn={isLoggedIn}
                          settings={settings}
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
                           <div className="w-32 h-32 rounded-2xl bg-slate-900/50 flex items-center justify-center border border-white/5 shadow-2xl">
                              <MapIcon className="w-12 h-12 text-slate-700 animate-pulse" />
                           </div>
                           <div className="text-center space-y-4">
                              <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.5em]">{t('bmaAutomation', 'selectPlan')}</p>
                              <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">{t("bmaAutomation", "selectPlanHint", "Select a floor plan from the sidebar to begin")}</p>
                           </div>
                        </div>
                      )}
                   </div>
                </motion.div>
              )}

              {activeTab === "generator" && (
                <motion.div 
                  key="generator" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                >
                   <BmaKabelGenerator 
                     projectId={projectId}
                     devices={devices}
                     routes={routes}
                     connections={connections}
                     categories={categories}
                     existingTypes={existingTypes}
                     settings={settings}
                     onSave={loadData}
                   />
                </motion.div>
              )}

              {activeTab === "export" && (
                 <motion.div 
                   key="export" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                   className="space-y-12 max-w-6xl mx-auto"
                 >
                    {/* Primary Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <motion.div 
                          whileHover={{ y: -5 }}
                          className="bg-slate-900/40 backdrop-blur-2xl border border-white/5 p-12 rounded-2xl text-center space-y-8 hover:bg-slate-900/60 transition-all duration-700 group shadow-2xl cursor-pointer"
                          onClick={() => window.open(`/api/bma/export-kabel-list?projectId=${projectId}`, '_blank')}
                       >
                          <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/10 mx-auto flex items-center justify-center group-hover:scale-110 group-hover:border-emerald-500/50 transition-all duration-700 shadow-inner">
                             <Globe className="w-8 h-8 text-emerald-500 group-hover:text-white transition-colors" />
                          </div>
                          <div className="space-y-3">
                             <h4 className="text-lg font-black tracking-widest text-white uppercase">{t("bmaAutomation", "cableList", "CABLE LIST")}</h4>
                             <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest opacity-60 leading-relaxed">{t("bmaAutomation", "cableListSubtitle", "Full technical inventory for field teams")}</p>
                          </div>
                       </motion.div>

                       <div className="bg-blue-600/5 backdrop-blur-2xl border border-blue-500/20 p-12 rounded-2xl flex flex-col justify-center items-center text-center space-y-6">
                          <Zap className="w-10 h-10 text-blue-500 animate-pulse" />
                          <div className="space-y-2">
                             <h4 className="text-lg font-black text-white uppercase tracking-tighter">{t("bmaAutomation", "qrPlanEngine", "QR PLAN ENGINE")}</h4>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-10">{t("bmaAutomation", "qrPlanEngineSubtitle", "Select a floor plan below to generate a secure public access label")}</p>
                          </div>
                       </div>
                    </div>

                    {/* Plan List */}
                    <div className="space-y-6">
                       <div className="flex items-center gap-4 px-8">
                          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                             <Layout className="w-4 h-4 text-slate-500" />
                          </div>
                          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">{t("bmaAutomation", "selectFloorQr", "Select Floor for QR Label")}</h3>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {plans.map((p) => (
                             <motion.div 
                                key={p.id}
                                whileHover={{ scale: 1.02 }}
                                className="bg-black/40 border border-white/5 p-8 rounded-2xl flex flex-col justify-between gap-6 hover:border-blue-500/30 transition-all group"
                             >
                                <div>
                                   <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">{t("bmaAutomation", "floorPlan", "Floor Plan")}</p>
                                   <h5 className="text-sm font-black text-white uppercase tracking-tight leading-tight">
                                      {[p.floors?.buildings?.name, p.floors?.name].filter(Boolean).join(" - ") || `Plan v${p.version}`}
                                   </h5>
                                </div>
                                <button 
                                   onClick={() => setQrModalPlan(p)}
                                   className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-500 transition-all shadow-lg"
                                >
                                   GENERATE QR LABEL
                                </button>
                             </motion.div>
                          ))}
                       </div>
                    </div>
                 </motion.div>
              )}
            </AnimatePresence>
          </div>
      </div>
    </div>
    {qrModalPlan && (
       <BmaPlanQrModal 
          planId={qrModalPlan.id}
          planName={[qrModalPlan.floors?.buildings?.name, qrModalPlan.floors?.name].filter(Boolean).join(" - ") || `Plan v${qrModalPlan.version}`}
          onClose={() => setQrModalPlan(null)}
       />
    )}
    </div>
    </div>
  );
}
