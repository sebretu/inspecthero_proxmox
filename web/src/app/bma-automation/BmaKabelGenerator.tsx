"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Zap, Trash2, Save, ChevronRight, Activity, Layers, Plus, Activity as SimIcon, Box } from "lucide-react";
import { apiPost, apiPatch, apiDelete, apiGet } from "@/lib/apiClient";
import { useNotification } from "@/contexts/NotificationContext";
import { motion, AnimatePresence } from "framer-motion";

interface BmaKabelGeneratorProps {
  projectId: string;
  devices: any[];
  routes: any[];
  connections: any[];
  categories: any[];
  existingTypes: string[];
  settings: any;
  onSave: () => void;
}

export default function BmaKabelGenerator({ 
  projectId, 
  devices, 
  routes, 
  connections, 
  categories, 
  existingTypes, 
  settings, 
  onSave 
}: BmaKabelGeneratorProps) {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [editingRoutes, setEditingRoutes] = useState<any[]>([]);
  const [trommels, setTrommels] = useState<any[]>([]);
  const [simulationResult, setSimulationResult] = useState<any[] | null>(null);

  const loadTrommels = useCallback(async () => {
    try {
        const trms = await apiGet<any[]>(`/api/trommels?projectId=${projectId}`);
        setTrommels(trms || []);
    } catch (e) {
        console.error("Failed to load trommels", e);
    }
  }, [projectId]);

  useEffect(() => {
    loadTrommels();
  }, [loadTrommels]);

  useEffect(() => {
    const initial = routes.map(r => {
      const src = devices.find(d => d.id === r.source_device_id);
      const tgt = devices.find(d => d.id === r.target_device_id);
      const metadata = r.metadata || {};
      
      return {
        ...r,
        cable_name: metadata.cable_name || `${src?.name || "?"} > ${tgt?.name || "?"}`,
        cable_type: metadata.cable_type || existingTypes[0] || "J-Y(St)Y 2x2x0.8",
        category_id: metadata.category_id || (categories[0]?.id || ""),
        length: r.length_meters || 0,
        sourceName: src?.name,
        targetName: tgt?.name
      };
    });
    setEditingRoutes(initial);
    setSimulationResult(null);
  }, [routes, devices, categories, existingTypes]);

  const handleUpdateField = (id: string, field: string, value: any) => {
    setEditingRoutes(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setSimulationResult(null);
  };

  const handleSimulate = async () => {
    setLoading(true);
    try {
        const results: any[] = [];
        let currentTrommels = [...trommels].map(t => ({ 
            ...t, 
            rem: t.remaining_length ?? (t.total_length - (t.used_length || 0)) 
        }));
        
        const simulationNewTrommelCount: Record<string, number> = {};

        for (const route of editingRoutes) {
            const totalLen = Math.ceil(route.length);
            const targetType = route.cable_type || "Unknown";
            
            let tr = currentTrommels.find(t => t.cable_type === targetType && t.status !== "picked_up" && t.rem >= totalLen);
            
            if (tr) {
                tr.rem -= totalLen;
            } else {
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
                    name: `${targetType} Trommel ${newIdx}`, 
                    cable_type: targetType, 
                    isNew: true,
                    rem: 500 - totalLen 
                };
                currentTrommels.push(tr);
            }
            
            results.push({ ...route, trommel: tr, isNew: !!tr.isNew });
        }
        setSimulationResult(results);
        showNotification("Stock verification complete", "success");
    } catch (err: any) {
        showNotification(`Simulation failed: ${err.message}`, "error");
    } finally {
        setLoading(false);
    }
  };

  const handleCommitToMainCables = async () => {
     if (!simulationResult) { showNotification("Run simulation first", "info"); return; }
     if (!window.confirm("This will create official cable entries in the main logistics system. Proceed?")) return;
     
     setLoading(true);
     try {
        const trMap: Record<string, string> = {};
        for (const item of simulationResult) {
            if (item.isNew && !trMap[item.trommel.name]) {
                const res = await apiPost<any>("/api/trommels", { 
                    project_id: projectId, name: item.trommel.name, cable_type: item.cable_type, total_length: 500, status: "pending" 
                });
                trMap[item.trommel.name] = res.id;
            }
        }
        for (const item of simulationResult) {
            await apiPost("/api/cables", {
                project_id: projectId, name: item.cable_name, cable_type: item.cable_type,
                category_id: item.category_id || null, length: Math.ceil(item.length),
                status: "PENDING", trommel_id: item.isNew ? trMap[item.trommel.name] : item.trommel.id
            });
        }
        showNotification("All cables committed to logistics", "success");
        setSimulationResult(null);
        loadTrommels();
        onSave();
     } catch (err: any) { showNotification(`Generation failed: ${err.message}`, "error"); }
     finally { setLoading(false); }
  };

   const handleRefreshLengths = async () => {
    setLoading(true);
    try {
        await apiPost(`/api/bma/recalculate-routes?projectId=${projectId}`, {});
        showNotification("All lengths recalculated from calibration", "success");
        onSave();
    } catch (err: any) {
        showNotification("Refresh failed", "error");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Header Card */}
      <div className="relative bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-16 overflow-hidden shadow-2xl">
         <div className="absolute -left-20 -top-20 w-80 h-80 bg-blue-500/5 blur-[120px] rounded-full pointer-events-none"></div>
         
         <div className="flex flex-col lg:flex-row justify-between items-end gap-10 relative z-10">
            <div className="space-y-4">
               <h2 className="text-4xl font-black text-white uppercase tracking-tighter">LOGISTICS OPTIMIZER</h2>
               <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.4em]">AUTOMATED CABLE & DRUM ALLOCATION</p>
            </div>
            
            <div className="flex flex-wrap gap-6">
                <button 
                    onClick={handleRefreshLengths}
                    disabled={loading}
                    className="px-10 py-5 bg-black/40 border border-white/5 rounded-2xl text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] hover:bg-blue-600/10 hover:border-blue-500 transition-all duration-500 disabled:opacity-50 flex items-center gap-3"
                >
                    <SimIcon className="w-4 h-4" />
                    REFRESH METERS
                </button>
                <button 
                    onClick={handleSimulate}
                    disabled={loading || editingRoutes.length === 0}
                    className="px-10 py-5 bg-slate-800/80 border border-slate-700/50 rounded-2xl text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] hover:text-white hover:border-blue-500 transition-all duration-500 disabled:opacity-50 flex items-center gap-3"
                >
                    <Activity className="w-4 h-4" />
                    VERIFY STOCK
                </button>
                <button 
                    onClick={handleCommitToMainCables}
                    disabled={loading || !simulationResult}
                    className={`px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-700 disabled:opacity-50 flex items-center gap-3 shadow-2xl ${simulationResult ? "bg-blue-600 text-white shadow-blue-500/40 scale-105" : "bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"}`}
                >
                    <Plus className="w-4 h-4" />
                    COMMIT TO MAIN SYSTEM
                </button>
            </div>
         </div>
      </div>

      {/* Routes List */}
      <div className="space-y-8">
        <AnimatePresence>
        {editingRoutes.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-48 text-center bg-slate-900/20 rounded-2xl border border-dashed border-white/5">
            <Box className="w-16 h-16 text-slate-800 mx-auto mb-8 opacity-20" />
            <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.5em]">No data segments available</p>
          </motion.div>
        ) : (
          editingRoutes.map((route) => {
            const sim = simulationResult?.find(s => s.id === route.id);
            return (
              <motion.div 
                key={route.id} 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 xl:grid-cols-12 gap-10 bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-12 rounded-2xl items-end group hover:border-blue-500/30 transition-all duration-500 shadow-xl"
              >
                {/* Visual Segments */}
                <div className="xl:col-span-3 space-y-6">
                   <div className="flex items-center justify-between bg-black/40 p-6 rounded-2xl border border-white/5 shadow-inner">
                      <div className="text-center flex-1">
                         <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2">FROM</p>
                         <p className="text-sm font-black text-white">{route.sourceName}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-800" />
                      <div className="text-center flex-1">
                         <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2">TO</p>
                         <p className="text-sm font-black text-white">{route.targetName}</p>
                      </div>
                   </div>
                   <div className="flex items-center justify-between px-6">
                      <div className="flex items-center gap-3">
                         <Activity className="w-4 h-4 text-blue-500" />
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Calculated</span>
                      </div>
                      <span className="text-xl font-black text-white">{route.length.toFixed(1)}<span className="text-xs text-slate-600 ml-1">m</span></span>
                   </div>
                </div>

                {/* Configuration Inputs */}
                <div className="xl:col-span-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4">Identifier</label>
                      <input 
                        type="text" value={route.cable_name} onChange={(e) => handleUpdateField(route.id, "cable_name", e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-[10px] font-bold text-white outline-none focus:border-blue-500/50 transition-all shadow-inner"
                      />
                   </div>
                   <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4">Technical Type</label>
                      <select 
                        value={route.cable_type} onChange={(e) => handleUpdateField(route.id, "cable_type", e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-[10px] font-black text-blue-400 outline-none focus:border-blue-500/50 transition-all cursor-pointer shadow-inner appearance-none"
                      >
                        {existingTypes.map(t => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
                      </select>
                   </div>
                   <div className="space-y-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-4">Category</label>
                      <select 
                        value={route.category_id} onChange={(e) => handleUpdateField(route.id, "category_id", e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-[10px] font-black text-amber-500 outline-none focus:border-blue-500/50 transition-all cursor-pointer shadow-inner appearance-none"
                      >
                        <option value="" className="bg-slate-900">NO CATEGORY</option>
                        {categories.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                      </select>
                   </div>
                </div>

                {/* Logistics & Actions */}
                <div className="xl:col-span-3 flex items-center justify-end gap-6">
                   <div className="flex-1 text-right space-y-2 pr-6 border-r border-white/5">
                      {sim ? (
                        <>
                           <span className={`text-[8px] font-black px-3 py-1 rounded-lg border ${sim.isNew ? "bg-orange-500/10 text-orange-500 border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.1)]" : "bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]"}`}>
                              {sim.isNew ? "AUTO GENERATE" : "STOCK ALLOCATION"}
                           </span>
                           <p className="text-[10px] font-black text-white uppercase truncate mt-1">{sim.trommel.name}</p>
                        </>
                      ) : (
                        <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Pending Verification</p>
                      )}
                   </div>
                   
                   <div className="flex gap-2">
                      <button 
                        onClick={() => handleUpdateField(route.id, "_saved", true)}
                        className="w-14 h-14 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center text-blue-500 hover:bg-blue-600 hover:text-white transition-all duration-500 shadow-xl"
                      >
                        <Save className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => apiDelete(`/api/bma/connections?id=${route.id}&type=route`).then(onSave)}
                        className="w-14 h-14 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center text-red-500 hover:bg-red-600 hover:text-white transition-all duration-500 shadow-xl"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                   </div>
                </div>
              </motion.div>
            );
          })
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
