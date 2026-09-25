"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { useNotification } from "@/contexts/NotificationContext";
import { BusDesignerModal } from "./BusDesignerModal";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

const SingleMap = dynamic(
  () => import("@/components/CableRouteSingleMap").then(m => ({ default: m.CableRouteSingleMap })),
  { ssr: false }
);

const NetworkMap = dynamic(
  () => import("@/components/CableProjectNetworkMap").then(m => ({ default: m.CableProjectNetworkMap })),
  { ssr: false }
);

type Node = { id: string; name: string; x: number; y: number; plan_id: string; project_id: string };
type Bus = {
  id: string;
  name: string;
  spare_percent: number;
  multi_plan_data: any[];
  project_id: string;
  distance: number;
  created_at: string;
  node_a_id: string;
  node_b_id: string;
  node_a?: Node;
  node_b?: Node;
};

type Category = { id: string; name: string };

type CableInput = {
  id: string;
  name: string;
  cable_type: string;
  category_id: string;
  start_node_name: string;
  end_node_name: string;
  plan_id?: string;
};

export default function AutomationClient() {
  const { t, language } = useLanguage();
  const { showNotification } = useNotification();
  const [token, setToken] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [previewBus, setPreviewBus] = useState<Bus | null>(null);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [existingTypes, setExistingTypes] = useState<string[]>([]);
  const [trommels, setTrommels] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<"infrastructure" | "nodes" | "map">("infrastructure");
  const [activeMapPlanId, setActiveMapPlanId] = useState("");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState("");
  const [plans, setPlans] = useState<any[]>([]);

  const [cablesToCreate, setCablesToCreate] = useState<CableInput[]>([
    { id: Math.random().toString(36).substr(2, 9), name: "", cable_type: "", category_id: "", start_node_name: "", end_node_name: "", plan_id: "" }
  ]);
  const [simulationResult, setSimulationResult] = useState<any[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

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
      setPlans((res as any)?.data || res || []);
    });
  }, [projectId, token]);

  const loadInfrastructure = useCallback(async () => {
    if (!projectId || !token) return;
    setLoading(true);
    try {
      const [b, n, p] = await Promise.all([
        apiGet<any>(`/api/cable-buses?projectId=${projectId}`),
        apiGet<any>(`/api/cable-bus-nodes?projectId=${projectId}`),
        apiGet<any>(`/api/plans?projectId=${projectId}&limit=100`)
      ]);
      setBuses((b as any)?.data || b || []);
      setNodes((n as any)?.data || n || []);
      setPlans((p as any)?.data || p || []);
    } catch {} finally { setLoading(false); }
  }, [projectId, token]);

  const loadMetadata = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const [cats, trms, cbs] = await Promise.all([
        apiGet<Category[]>(`/api/cable-categories?projectId=${projectId}`),
        apiGet<any[]>(`/api/trommels?projectId=${projectId}`),
        apiGet<any[]>(`/api/cables?projectId=${projectId}&limit=500`)
      ]);
      setCategories(cats || []);
      setTrommels(trms || []);
      const types = new Set<string>();
      (trms || []).forEach(t => t.cable_type && types.add(t.cable_type));
      (cbs || []).forEach(c => c.cable_type && types.add(c.cable_type));
      setExistingTypes(Array.from(types));
    } catch {}
  }, [projectId, token]);

  useEffect(() => {
    loadInfrastructure();
    loadMetadata();
  }, [loadInfrastructure, loadMetadata]);

  useEffect(() => {
    if (plans.length > 0 && !activeMapPlanId) {
      setActiveMapPlanId(plans[0].id);
    }
  }, [plans, activeMapPlanId]);

  const findPath = (startName: string, endName: string, preferredPlanId?: string) => {
    if (!startName || !endName) return null;
    const graph: Record<string, { to: string, dist: number, multi_plan: any[] }[]> = {};
    buses.forEach(b => {
      const isPreferred = !preferredPlanId || b.multi_plan_data?.some(m => m.planId === preferredPlanId);
      const weight = isPreferred ? 1 : 1000;
      if (!graph[b.node_a_id]) graph[b.node_a_id] = [];
      if (!graph[b.node_b_id]) graph[b.node_b_id] = [];
      graph[b.node_a_id].push({ to: b.node_b_id, dist: b.distance * weight, multi_plan: b.multi_plan_data || [] });
      graph[b.node_b_id].push({ to: b.node_a_id, dist: b.distance * weight, multi_plan: (b.multi_plan_data || []).map(m => ({ ...m, waypoints: [...m.waypoints].reverse(), pinA: m.pinB, pinB: m.pinA })).reverse() });
    });
    const nodesByName: Record<string, string[]> = {};
    nodes.forEach(n => {
      if (!nodesByName[n.name]) nodesByName[n.name] = [];
      nodesByName[n.name].push(n.id);
    });
    Object.values(nodesByName).forEach(ids => {
      ids.forEach(id1 => {
        ids.forEach(id2 => {
          if (id1 !== id2) {
            if (!graph[id1]) graph[id1] = [];
            graph[id1].push({ to: id2, dist: 0.001, multi_plan: [] });
          }
        });
      });
    });
    const startIds = nodesByName[startName.trim()] || [];
    const endIds = nodesByName[endName.trim()] || [];
    if (startIds.length === 0 || endIds.length === 0) return null;
    const V_SOURCE = "V_SOURCE";
    const dists: Record<string, number> = {};
    const prev: Record<string, { node: string, multi_plan: any[] } | null> = {};
    const q = new Set<string>();
    nodes.forEach(n => { dists[n.id] = Infinity; prev[n.id] = null; q.add(n.id); });
    dists[V_SOURCE] = 0; prev[V_SOURCE] = null; q.add(V_SOURCE);
    graph[V_SOURCE] = startIds.map(id => ({ to: id, dist: 0, multi_plan: [] }));
    while (q.size > 0) {
      let u: string | null = null;
      for (const node of Array.from(q)) { if (u === null || dists[node] < dists[u]) u = node; }
      if (!u || dists[u] === Infinity) break;
      q.delete(u);
      (graph[u] || []).forEach(edge => {
        const alt = dists[u!] + edge.dist;
        if (alt < dists[edge.to]) { dists[edge.to] = alt; prev[edge.to] = { node: u!, multi_plan: edge.multi_plan }; }
      });
    }
    let bestEndId: string | null = null;
    for (const endId of endIds) { if (dists[endId] !== Infinity) { if (!bestEndId || dists[endId] < dists[bestEndId]) bestEndId = endId; } }
    if (!bestEndId) return null;
    const fullMultiPlan: any[] = [];
    let curr = bestEndId;
    while (prev[curr] && curr !== V_SOURCE) {
      const step = prev[curr]!;
      fullMultiPlan.unshift(...(step.multi_plan || []).map((m: any) => ({ ...m, id: Math.random().toString() })));
      curr = step.node;
    }
    return { distance: dists[bestEndId], multiPlan: fullMultiPlan };
  };

  const handleSimulate = async () => {
    setIsSimulating(true);
    const results: any[] = [];
    let currentTrommels = [...trommels].map(t => ({ ...t, rem: t.remaining_length ?? (t.total_length - (t.used_length || 0)) }));
    
    // Tracking for new trommel indices during this specific simulation run
    const simulationNewTrommelCount: Record<string, number> = {};

    for (const cable of cablesToCreate) {
      if (!cable.name || !cable.start_node_name || !cable.end_node_name) continue;
      const path = findPath(cable.start_node_name, cable.end_node_name, (cable as any).plan_id);
      if (!path) { showNotification(`${t('common', 'error')}: ${cable.name}`, "error"); continue; }
      const totalLen = Math.ceil(path.distance > 100000 ? (path.distance / 1000) * 1.1 : path.distance * 1.1);
      const targetType = cable.cable_type || "Unknown";
      
      // Try to find a trommel (including ones we might have "added" in this simulation run)
      let tr = currentTrommels.find(t => t.cable_type === targetType && t.status !== "picked_up" && t.rem >= totalLen);
      
      if (tr) {
        tr.rem -= totalLen;
      } else {
        // Need a new one. Find the next sequential index for this type.
        if (!simulationNewTrommelCount[targetType]) {
          const pattern = new RegExp(`${targetType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} auto Trommel (\\d+)`);
          const existingIndices = trommels
            .filter(t => t.cable_type === targetType)
            .map(t => {
              const match = t.name.match(pattern);
              return match ? parseInt(match[1]) : 0;
            });
          simulationNewTrommelCount[targetType] = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 1;
        } else {
          simulationNewTrommelCount[targetType]++;
        }

        const newIdx = simulationNewTrommelCount[targetType];
        tr = { 
          id: `new-${targetType}-${newIdx}`, 
          name: `${targetType} auto Trommel ${newIdx}`, 
          cable_type: targetType, 
          isNew: true,
          rem: 500 - totalLen 
        };
        currentTrommels.push(tr);
      }
      
      results.push({ ...cable, length: totalLen, trommel: tr, path, isNew: !!tr.isNew });
    }
    setSimulationResult(results);
    setIsSimulating(false);
  };

  const handleCommit = async () => {
    if (!simulationResult) return;
    setLoading(true);
    try {
      const trMap: Record<string, string> = {};
      for (const item of simulationResult) {
        if (item.isNew && !trMap[item.trommel.name]) {
          const res = await apiPost<any>("/api/trommels", { project_id: projectId, name: item.trommel.name, cable_type: item.cable_type, total_length: 500, status: "pending" });
          trMap[item.trommel.name] = res.id;
        }
      }
      for (const item of simulationResult) {
        const preferredPlan = (item as any).plan_id;
        const mainStage = preferredPlan ? (item.path.multiPlan.find((s: any) => s.planId === preferredPlan) || item.path.multiPlan[0]) : item.path.multiPlan[0];
        if (!mainStage) continue;
        const routeRes = await apiPost<any>("/api/cable-routes", {
          project_id: projectId, name: `${t('automation', 'activeRoute')} ${item.name}`, plan_id: mainStage.planId,
          point_a_label: item.start_node_name, point_b_label: item.end_node_name,
          point_a_x: mainStage.pinA?.x, point_a_y: mainStage.pinA?.y,
          point_b_x: mainStage.pinB?.x, point_b_y: mainStage.pinB?.y,
          waypoints: mainStage.waypoints, multi_plan_data: item.path.multiPlan
        });
        await apiPost("/api/cables", {
          project_id: projectId, route_id: routeRes.id, name: item.name, cable_type: item.cable_type,
          category_id: item.category_id || null, length: item.length,
          trommel_id: item.isNew ? trMap[item.trommel.name] : item.trommel.id
        });
      }
      showNotification(t('automation', 'saveSuccess'), "success");
      setSimulationResult(null); loadMetadata();
    } catch (e: any) { showNotification(e.message, "error"); } finally { setLoading(false); }
  };

  const handleDeleteBus = async (id: string) => {
    if (!confirm(t('common', 'confirmDelete'))) return;
    try { await apiDelete(`/api/cable-buses?id=${id}`, token); showNotification(t('common', 'success'), "success"); loadInfrastructure(); }
    catch (e: any) { showNotification(e.message, "error"); }
  };

  const cleanupNodes = async () => {
    if (!confirm(t('automation', 'cleanupNodes') + "?")) return;
    try { await apiDelete(`/api/cable-bus-nodes?projectId=${projectId}&cleanup=true`, token); showNotification(t('common', 'success'), "success"); loadInfrastructure(); }
    catch (e: any) { showNotification(e.message, "error"); }
  };

  const handleDeleteNode = async (id: string) => {
    if (!confirm(t('common', 'confirmDelete'))) return;
    try { await apiDelete(`/api/cable-bus-nodes?id=${id}`, token); showNotification(t('common', 'success'), "success"); loadInfrastructure(); }
    catch (e: any) { showNotification(e.message, "error"); }
  };

  const handleRenameNode = async (id: string, newName: string) => {
    if (!newName) return;
    try { await apiPatch(`/api/cable-bus-nodes?id=${id}`, { name: newName }); showNotification(t('common', 'success'), "success"); setEditingNodeId(null); loadInfrastructure(); }
    catch (e: any) { showNotification(e.message, "error"); }
  };

  const uniqueNodeNames = useMemo(() => Array.from(new Set(nodes.map(n => n.name))), [nodes]);

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] text-slate-200 selection:bg-amber-400/30 selection:text-amber-200 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#94a3b8 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      <div className="relative z-10 w-full flex flex-col items-center py-16 px-12 md:px-32">
        <div className="w-full max-w-[1920px] flex flex-col">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-14 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-16 rounded-2xl shadow-2xl shadow-black/70 px-28">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase leading-none">{t('automation', 'cableAutomationDashboard')}</h1>
            <div className="flex items-center gap-6 mt-6">
               <div className="flex bg-black/40 p-2 rounded-2xl border border-slate-700/30 backdrop-blur-xl gap-3">
                  {["infrastructure", "nodes", "map"].map((tab) => (
                    <button 
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 whitespace-nowrap ${activeTab === tab ? "bg-cyan-500 text-slate-900 shadow-[0_0_30px_rgba(6,182,212,0.5)]" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"}`}
                    >
                      {t('automation', `${tab}Tab`)}
                    </button>
                  ))}
               </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
             <button onClick={loadInfrastructure} className="p-4 rounded-2xl border border-slate-700/50 bg-slate-800/30 text-slate-400 hover:text-white hover:border-slate-500 transition-all shadow-xl">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
          <div className="xl:col-span-4 sticky top-8 space-y-8">
             <motion.div 
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-10 space-y-6 shadow-2xl"
             >
                <div className="flex items-center gap-4 border-b border-slate-800/50 pb-6">
                   <div className="w-10 h-10 rounded-xl bg-black/40 border border-slate-700/50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
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
                      <p className="text-slate-500 text-[9px] font-bold uppercase mt-1">Project Selector</p>
                   </div>
                </div>
             </motion.div>

             <AnimatePresence mode="wait">
                {activeTab === "infrastructure" ? (
                  <motion.div 
                    key="infrastructure" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-between items-center px-4">
                       <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">{t('automation', 'activeInfrastructure')}</h2>
                       <button onClick={() => setShowCreateModal(true)} className="text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:text-cyan-300 transition-all">{t('automation', 'newBusBtn')}</button>
                    </div>

                    <div className="space-y-4 max-h-[calc(100vh-350px)] overflow-y-auto pr-2 custom-scrollbar">
                       {buses.length === 0 && (
                         <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-6 text-2xl">🛣️</div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{t('automation', 'noBuses')}</p>
                         </div>
                       )}
                       {buses.map((bus, idx) => (
                         <motion.div 
                            key={bus.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => setPreviewBus(previewBus?.id === bus.id ? null : bus)}
                            className={`relative group bg-slate-900/60 backdrop-blur-xl border rounded-2xl p-6 cursor-pointer transition-all duration-500 ${previewBus?.id === bus.id ? "border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.15)]" : "border-slate-800/50 hover:border-slate-600 shadow-xl shadow-black/20"}`}
                         >
                            <div className="flex justify-between items-start relative z-10">
                               <div className="flex items-center gap-5">
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black border-2 transition-all duration-500 ${previewBus?.id === bus.id ? "bg-cyan-500 border-cyan-400 text-slate-950" : "bg-slate-800/50 border-slate-700/50 text-slate-400"}`}>
                                     {bus.node_a?.name?.[0]}
                                  </div>
                                  <div>
                                     <h3 className="text-base font-black text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors">{bus.node_a?.name} <span className="text-slate-600 mx-1">↔</span> {bus.node_b?.name}</h3>
                                     <div className="flex items-center gap-3 mt-1.5">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-slate-800/50 rounded-lg border border-slate-700/50">{bus.multi_plan_data?.length || 0} PLANS</span>
                                        <span className="text-[9px] font-black text-cyan-500/80 uppercase tracking-widest">{bus.distance?.toFixed(1)}m</span>
                                     </div>
                                  </div>
                               </div>
                               <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={(e) => { e.stopPropagation(); setEditingBus(bus); }} className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-all">
                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteBus(bus.id); }} className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-500 hover:text-red-400 transition-all">
                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                               </div>
                            </div>
                         </motion.div>
                       ))}
                    </div>
                  </motion.div>
                ) : activeTab === "nodes" ? (
                  <motion.div 
                    key="nodes" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-between items-center px-4">
                       <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">{t('automation', 'nodesTab')}</h2>
                       <button onClick={cleanupNodes} className="text-red-400 text-[10px] font-black uppercase tracking-widest hover:text-red-300 transition-all">{t('automation', 'cleanupNodes')}</button>
                    </div>
                    
                    <div className="space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto pr-2 custom-scrollbar">
                       {uniqueNodeNames.map((name, idx) => {
                         const instances = nodes.filter(n => n.name === name);
                         return (
                           <div key={name} className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5">
                              <div className="flex justify-between items-center mb-4">
                                 <p className="text-sm font-black text-white uppercase tracking-tight">{name}</p>
                                 <span className="text-[8px] font-black px-2.5 py-1 bg-cyan-500/10 text-cyan-400 rounded-lg">{instances.length}</span>
                              </div>
                              <div className="space-y-2">
                                 {instances.map(inst => (
                                   <div key={inst.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-slate-800/30">
                                      <span className="text-[11px] font-bold text-slate-300">{plans.find(p => p.id === inst.plan_id)?.name || inst.plan_id?.slice(0,8)}</span>
                                      <button onClick={() => handleDeleteNode(inst.id)} className="text-slate-600 hover:text-red-400 transition-all">✕</button>
                                   </div>
                                 ))}
                              </div>
                           </div>
                         );
                       })}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="map-selector" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="px-4">
                       <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-4">{t('automation', 'selectPlan')}</h2>
                       <select 
                         value={activeMapPlanId} onChange={e => setActiveMapPlanId(e.target.value)}
                         className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl px-5 py-4 text-[10px] font-black uppercase text-cyan-400 outline-none appearance-none cursor-pointer focus:border-cyan-500/50 transition-all"
                       >
                         <option value="" className="bg-slate-900 text-slate-300">{t('automation', 'selectPlan')}</option>
                         {plans.map(p => (
                           <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">{p.floors?.name || p.name || p.id.slice(0,8)}</option>
                         ))}
                       </select>
                    </div>

                    <div className="px-4 pt-4 border-t border-slate-800/50">
                       <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-4">{t('automation', 'infrastructureTab')}</h2>
                       <div className="space-y-3 max-h-[calc(100vh-450px)] overflow-y-auto pr-2 custom-scrollbar">
                          {buses.filter(b => b.multi_plan_data?.some(m => m.planId === activeMapPlanId)).map(bus => (
                             <div key={bus.id} className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                                <p className="text-[10px] font-black text-white uppercase">{bus.node_a?.name} ↔ {bus.node_b?.name}</p>
                                <p className="text-[8px] font-bold text-cyan-500 mt-1">{bus.distance?.toFixed(1)}m</p>
                             </div>
                          ))}
                       </div>
                    </div>
                  </motion.div>
                )}
             </AnimatePresence>
          </div>

          <div className="xl:col-span-8">
             <AnimatePresence mode="wait">
                {activeTab === "map" ? (
                  <motion.div 
                    key="map-main" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                    className="bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl overflow-hidden shadow-2xl h-[800px] relative"
                  >
                    {activeMapPlanId ? (
                       <NetworkMap planId={activeMapPlanId} token={token} nodes={nodes} buses={buses} />
                    ) : (
                       <div className="absolute inset-0 flex items-center justify-center text-slate-700">
                          <p className="text-[10px] font-black uppercase tracking-widest">{t('automation', 'selectPlanToView')}</p>
                       </div>
                    )}
                  </motion.div>
                ) : (
                  <>
                    <motion.div 
                      key="generator-main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="relative bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-16 shadow-2xl shadow-black/80 px-24"
                    >
                      <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-amber-500/5 blur-[120px] rounded-full pointer-events-none"></div>

                      <div className="flex justify-between items-end mb-12 relative z-10">
                         <div>
                            <h2 className="text-3xl font-black uppercase tracking-tighter text-white">{t('automation', 'generatorTitle')}</h2>
                            <p className="text-slate-500 text-xs mt-2 uppercase font-bold tracking-widest">{t('automation', 'subtitle')}</p>
                         </div>
                         <div className="flex gap-4">
                            <button onClick={() => setCablesToCreate([])} className="px-6 py-3 rounded-2xl border border-slate-700/50 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-slate-500 transition-all">{t('automation', 'clearWorkspace')}</button>
                            <button 
                              onClick={() => setCablesToCreate(p => [...p, { id: Math.random().toString(36).substr(2,9), name: "", cable_type: "", category_id: "", start_node_name: "", end_node_name: "", plan_id: "" }])}
                              className="px-8 py-3 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-amber-950 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 hover:scale-105 transition-all"
                            >
                              {t('automation', 'addCable')}
                            </button>
                         </div>
                      </div>

                      <div className="relative z-10 flex-1 mb-12">
                         <div className="space-y-4">
                            <AnimatePresence>
                              {cablesToCreate.map((row, idx) => {
                                const rowPlanId = row.plan_id;
                                const filteredNodes = rowPlanId ? nodes.filter(n => n.plan_id === rowPlanId).map(n => n.name) : Array.from(new Set(nodes.map(n => n.name)));
                                const datalistId = `nodesList-${row.id}`;
                                
                                return (
                                  <motion.div 
                                     key={row.id}
                                     initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                     className="grid grid-cols-1 md:grid-cols-12 gap-8 bg-slate-900/60 backdrop-blur-xl p-12 rounded-2xl border border-slate-800/50 items-end group hover:border-slate-600 transition-all duration-300"
                                   >
                                      <div className="md:col-span-2 space-y-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">{t('automation', 'targetPlan')}</span>
                                         <select value={rowPlanId || ""} onChange={e => setCablesToCreate(p => p.map(r => r.id === row.id ? {...r, plan_id: e.target.value} : r))} className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-5 py-4 text-[10px] font-bold text-cyan-400 outline-none appearance-none cursor-pointer focus:border-cyan-500/50 transition-all">
                                            <option value="" className="bg-slate-900">{t('automation', 'autoAny')}</option>
                                            {plans.map(p => <option key={p.id} value={p.id} className="bg-slate-900 text-slate-300">{p.floors?.name || p.name}</option>)}
                                         </select>
                                      </div>
                                      <div className="md:col-span-1 space-y-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">{t('automation', 'name')}</span>
                                         <input value={row.name} onChange={e => setCablesToCreate(p => p.map(r => r.id === row.id ? {...r, name: e.target.value} : r))} placeholder="C01" className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-4 py-4 text-[10px] font-bold text-white outline-none focus:border-amber-500/50 transition-all" />
                                      </div>
                                      <div className="md:col-span-2 space-y-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">{t('automation', 'cableType')}</span>
                                         <input list="types" value={row.cable_type} onChange={e => setCablesToCreate(p => p.map(r => r.id === row.id ? {...r, cable_type: e.target.value} : r))} placeholder="NYY..." className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-5 py-4 text-[10px] font-bold text-white outline-none focus:border-amber-500/50 transition-all" />
                                         <datalist id="types">{existingTypes.map(t => <option key={t} value={t} />)}</datalist>
                                      </div>
                                      <div className="md:col-span-2 space-y-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">{t('automation', 'fromBoard')}</span>
                                         <input list={datalistId} value={row.start_node_name} onChange={e => setCablesToCreate(p => p.map(r => r.id === row.id ? {...r, start_node_name: e.target.value} : r))} placeholder="A" className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-5 py-4 text-[10px] font-bold text-amber-400 outline-none focus:border-amber-500/50 transition-all" />
                                      </div>
                                      <div className="md:col-span-2 space-y-2">
                                         <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">{t('automation', 'toBoard')}</span>
                                         <input list={datalistId} value={row.end_node_name} onChange={e => setCablesToCreate(p => p.map(r => r.id === row.id ? {...r, end_node_name: e.target.value} : r))} placeholder="B" className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-5 py-4 text-[10px] font-bold text-amber-400 outline-none focus:border-amber-500/50 transition-all" />
                                         <datalist id={datalistId}>{filteredNodes.map(n => <option key={n} value={n} />)}</datalist>
                                      </div>
                                      <div className="md:col-span-3 flex gap-3">
                                         <select value={row.category_id} onChange={e => setCablesToCreate(p => p.map(r => r.id === row.id ? {...r, category_id: e.target.value} : r))} className="flex-1 bg-black/40 border border-slate-700/50 rounded-2xl px-4 py-4 text-[9px] font-black uppercase text-slate-400 outline-none appearance-none cursor-pointer focus:border-slate-500 transition-all">
                                            <option value="">{t('automation', 'category')}</option>
                                            {categories.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                                         </select>
                                         <button 
                                           onClick={() => setCablesToCreate(p => {
                                             const idx = p.findIndex(r => r.id === row.id);
                                             const newList = [...p];
                                             newList.splice(idx + 1, 0, { ...row, id: Math.random().toString(36).substr(2,9) });
                                             return newList;
                                           })}
                                           className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700/50 flex items-center justify-center text-slate-500 hover:text-white transition-all shadow-lg"
                                           title="Duplicate"
                                         >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                         </button>
                                         <button onClick={() => setCablesToCreate(p => p.filter(r => r.id !== row.id))} className="w-12 h-12 rounded-2xl bg-red-500/5 border border-red-500/20 flex items-center justify-center text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all shadow-lg">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                         </button>
                                      </div>
                                   </motion.div>
                                );
                              })}
                            </AnimatePresence>
                         </div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-6 relative z-10">
                         <button 
                           onClick={handleSimulate} 
                           disabled={isSimulating || cablesToCreate.length === 0}
                           className="flex-1 py-6 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:border-cyan-500/50 transition-all disabled:opacity-50"
                         >
                           {isSimulating ? "Processing..." : t('automation', 'routingSimulation')}
                         </button>
                         <button 
                           onClick={handleCommit} 
                           disabled={!simulationResult || loading}
                           className={`flex-1 py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl transition-all duration-500 ${simulationResult ? "bg-cyan-500 text-slate-950 shadow-[0_0_50px_rgba(6,182,212,0.3)]" : "bg-slate-800/50 text-slate-600 border border-slate-700/30 cursor-not-allowed"}`}
                         >
                           {loading ? "Generating..." : t('automation', 'commitGeneration')}
                         </button>
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {simulationResult && (
                        <motion.div 
                          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
                          className="mt-12 bg-slate-900/40 backdrop-blur-2xl border border-slate-700/30 rounded-2xl p-10 shadow-2xl"
                        >
                           <div className="flex justify-between items-center mb-10">
                              <h3 className="text-xl font-black uppercase tracking-tight text-white">{t('automation', 'simulationResultsTitle')}</h3>
                              <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                 <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span> {t('automation', 'newLabel')}</span>
                                 <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span> {t('automation', 'fromStockLabel')}</span>
                              </div>
                           </div>

                           <div className="space-y-8">
                              {simulationResult.map((res, i) => (
                                <motion.div 
                                  key={i} 
                                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                  className="bg-slate-950/60 p-10 rounded-2xl border border-slate-800/50 group hover:border-cyan-500/30 transition-all shadow-2xl"
                                >
                                   <div className="flex flex-col xl:flex-row gap-10">
                                      <div className="xl:w-1/3 space-y-8">
                                         <div className="flex justify-between items-start">
                                            <div>
                                               <p className="text-xl font-black text-white uppercase tracking-tight">{res.name}</p>
                                               <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mt-2">{res.cable_type}</p>
                                            </div>
                                            <span className={`text-[9px] font-black px-4 py-2 rounded-xl border ${res.isNew ? "bg-orange-500/10 text-orange-500 border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.1)]" : "bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]"}`}>
                                               {res.isNew ? t('automation', 'newLabel') : t('automation', 'fromStockLabel')}
                                            </span>
                                         </div>
                                         
                                         <div className="flex items-center justify-between p-8 rounded-2xl bg-black/40 border border-slate-800/50">
                                            <div className="text-center flex-1">
                                               <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">{t('automation', 'fromBoard')}</p>
                                               <p className="text-base font-black text-amber-400">{res.start_node_name}</p>
                                            </div>
                                            <div className="flex items-center justify-center px-6">
                                               <div className="w-12 h-px bg-slate-800"></div>
                                               <div className="w-3 h-3 rounded-full border-2 border-slate-700 bg-slate-900 shadow-[0_0_15px_rgba(255,255,255,0.05)]"></div>
                                               <div className="w-12 h-px bg-slate-800"></div>
                                            </div>
                                            <div className="text-center flex-1">
                                               <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">{t('automation', 'toBoard')}</p>
                                               <p className="text-base font-black text-amber-400">{res.end_node_name}</p>
                                            </div>
                                         </div>

                                         <div className="grid grid-cols-2 gap-8 px-4">
                                            <div>
                                               <p className="text-[10px] font-black text-slate-600 uppercase mb-1.5 tracking-widest">{t('automation', 'totalLength')}</p>
                                               <p className="text-2xl font-black text-white">{res.length.toFixed(1)}<span className="text-sm text-slate-500 ml-1">m</span></p>
                                            </div>
                                            <div>
                                               <p className="text-[10px] font-black text-slate-600 uppercase mb-1.5 tracking-widest">{t('cables', 'trommel')}</p>
                                               <p className="text-sm font-black text-cyan-400 break-all">{res.trommel.name}</p>
                                            </div>
                                         </div>
                                      </div>

                                      <div className="xl:w-2/3 space-y-6">
                                         {res.path.multiPlan.map((stage: any, idx: number) => (
                                           <div key={idx} className="h-[450px] rounded-2xl overflow-hidden border border-slate-800/50 bg-black relative group/map shadow-inner">
                                              <div className="absolute top-6 left-6 z-[10] bg-slate-900/95 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-slate-700/50 text-[9px] font-black text-white uppercase tracking-[0.3em] shadow-2xl">
                                                 {t('automation', 'segment')} {idx + 1}: <span className="text-cyan-400 ml-2">{plans.find((p: any) => p.id === stage.planId)?.name || "Plan"}</span>
                                              </div>
                                              <SingleMap 
                                                planId={stage.planId} token={token}
                                                pinA={stage.pinA} pinB={stage.pinB}
                                                waypoints={stage.waypoints} readOnly={true}
                                                setWaypoints={() => {}} setPinA={() => {}} setPinB={() => {}} picking={null as any} onPicked={() => {}}
                                              />
                                              <div className="absolute inset-0 bg-slate-950/20 group-hover/map:bg-transparent transition-colors duration-700 pointer-events-none"></div>
                                           </div>
                                         ))}
                                      </div>
                                   </div>
                                </motion.div>
                              ))}
                           </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
             </AnimatePresence>
          </div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setCablesToCreate(p => [...p, { id: Math.random().toString(36).substr(2,9), name: "", cable_type: "", category_id: "", start_node_name: "", end_node_name: "", plan_id: "" }])}
          className="fixed bottom-12 right-12 w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-amber-950 flex items-center justify-center text-4xl shadow-[0_20px_50px_rgba(251,191,36,0.4)] z-[100] group"
        >
           <span className="group-hover:hidden transition-all">+</span>
           <span className="hidden group-hover:block text-[10px] font-black uppercase tracking-widest transition-all">{t('automation', 'addCableFloating')}</span>
        </motion.button>
        
       {(showCreateModal || editingBus) && (
         <BusDesignerModal 
           projectId={projectId} token={token} buses={buses} allNodes={nodes} initialData={editingBus || undefined}
           onClose={() => { setShowCreateModal(false); setEditingBus(null); }}
           onConfirm={async (data) => {
              if (data._internal_saved) { /* Done inside */ } 
              else if (data.id) { await apiPatch(`/api/cable-buses?id=${data.id}`, data); } 
              else { await apiPost("/api/cable-buses", data); }
              setShowCreateModal(false); setEditingBus(null); loadInfrastructure();
           }}
         />
       )}
      </div>
    </div>
    </div>
  );
}
