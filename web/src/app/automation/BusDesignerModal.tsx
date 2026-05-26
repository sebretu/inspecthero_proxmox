"use client";
import { useState, useEffect, useMemo } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

const SingleMap = dynamic(
  () => import("@/components/CableRouteSingleMap").then(m => ({ default: m.CableRouteSingleMap })),
  { ssr: false }
);

type Plan = { id: string; name: string; floors?: { name: string } };
interface Pin { x: number; y: number }
interface Node { id: string; name: string; x: number; y: number; plan_id: string }

interface PathPoint {
  id: string;
  name: string;
  pin: Pin | null;
  waypoints: Pin[]; 
}

interface Props {
  projectId: string;
  token: string | null;
  buses: any[];
  allNodes: Node[];
  initialData?: any;
  onConfirm: (data: any) => void;
  onClose: () => void;
}

function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m >= 1) return `${m.toFixed(1)} m`;
  return `${(m * 100).toFixed(0)} cm`;
}

const SCALE_LS_KEY = "cableMapScale_";

export function BusDesignerModal({ projectId, token, buses, allNodes, initialData, onConfirm, onClose }: Props) {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>([]);
  
  const [planId, setPlanId] = useState(initialData?.multi_plan_data?.[0]?.planId || "");
  const [points, setPoints] = useState<PathPoint[]>(() => {
    if (initialData?.node_a && initialData?.node_b) {
      const stage = initialData.multi_plan_data?.[0] || {};
      return [
        { id: "1", name: initialData.node_a.name, pin: stage.pinA || { x: initialData.node_a.x, y: initialData.node_a.y }, waypoints: stage.waypoints || [] },
        { id: "2", name: initialData.node_b.name, pin: stage.pinB || { x: initialData.node_b.x, y: initialData.node_b.y }, waypoints: [] }
      ];
    }
    return [
      { id: "1", name: "", pin: null, waypoints: [] },
      { id: "2", name: "", pin: null, waypoints: [] }
    ];
  });
  const [activePointIndex, setActivePointIndex] = useState(0);

  const [imgAspect, setImgAspect] = useState<number>(1);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calPixelDist, setCalPixelDist] = useState<number | null>(null);
  const [calRealDist, setCalRealDist] = useState("");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    apiGet<Plan[]>(`/api/plans?projectId=${projectId}&limit=100`).then(ps => {
      const list = ((ps as any)?.data || ps || []).map((p: any) => ({
        id: p.id,
        name: p.floors?.name || p.name || p.id.slice(0, 8),
        floors: p.floors
      }));
      setPlans(list);
      if (!planId && list.length > 0) setPlanId(list[0].id);
    });
  }, [projectId, planId]);

  useEffect(() => {
    if (!planId) return;
    fetch(`/api/tiles/${planId}/meta`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.gridW && d?.gridH && d?.tileSize) {
          setImgAspect((d.gridH * d.tileSize) / (d.gridW * d.tileSize));
        }
      });
  }, [planId, token]);

  const addPoint = () => {
    const nextIdx = points.length;
    setPoints(prev => [...prev, { id: Math.random().toString(), name: "", pin: null, waypoints: [] }]);
    setActivePointIndex(nextIdx - 1);
  };

  const removePoint = (idx: number) => {
    if (points.length > 2) {
      setPoints(prev => prev.filter((_, i) => i !== idx));
      setActivePointIndex(0);
    }
  };

  const updatePoint = (idx: number, patch: Partial<PathPoint>) => {
    setPoints(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  const handlePointNameChange = (idx: number, val: string) => {
    updatePoint(idx, { name: val });
    const name = val.trim();
    const existing = allNodes.find(n => n.name.toUpperCase().trim() === name.toUpperCase() && n.plan_id === planId);
    if (existing) { updatePoint(idx, { pin: { x: existing.x, y: existing.y } }); }
  };

  const calculateSegmentDist = (p1: PathPoint, p2: PathPoint) => {
    const scale = parseFloat(localStorage.getItem(SCALE_LS_KEY + planId) || "0");
    if (!imgAspect || !scale || !p1.pin || !p2.pin) return 0;
    const hM = scale * imgAspect;
    const pts = [p1.pin, ...p1.waypoints, p2.pin];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += Math.hypot((pts[i+1].x - pts[i].x) * scale, (pts[i+1].y - pts[i].y) * hM);
    }
    return total;
  };

  const totalDistance = useMemo(() => {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += calculateSegmentDist(points[i], points[i+1]);
    }
    return total;
  }, [points, planId, imgAspect]);

  const handleSave = async () => {
    if (!planId || points.some(p => !p.name || !p.pin)) return;
    setSaving(true);
    try {
      const savedNodes: Record<string, Node> = {};
      for (const p of points) {
        const res = await apiPost<Node>("/api/cable-bus-nodes", {
          project_id: projectId, plan_id: planId, name: p.name, x: p.pin!.x, y: p.pin!.y
        });
        savedNodes[p.id] = res;
      }
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const dist = calculateSegmentDist(p1, p2);
        await apiPost("/api/cable-buses", {
          project_id: projectId, name: `${p1.name} ↔ ${p2.name}`, spare_percent: 10,
          multi_plan_data: [{ id: "main", planId, pinA: p1.pin, pinB: p2.pin, waypoints: p1.waypoints, distance: dist }],
          node_a_id: savedNodes[p1.id].id, node_b_id: savedNodes[p2.id].id, distance: dist
        });
      }
      onConfirm({ _internal_saved: true });
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  if (!mounted) return null;

  const isValid = planId && points.length >= 2 && points.every(p => p.name && p.pin);

  return (
    <div className="absolute inset-x-0 top-0 z-[10000] flex justify-center p-8 pointer-events-none">
      <motion.div 
        drag
        dragMomentum={false}
        dragElastic={0.1}
        initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }}
        className="bg-[#0f172a]/98 backdrop-blur-3xl border border-slate-700/50 w-full max-w-7xl rounded-2xl shadow-[0_60px_150px_rgba(0,0,0,0.9)] flex flex-col h-fit max-h-[1000px] relative pointer-events-auto cursor-default active:cursor-grabbing select-none"
      >
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#94a3b8 1px, transparent 0)", backgroundSize: "30px 30px" }}></div>

        <div className="p-14 border-b border-slate-700/30 flex justify-between items-center bg-slate-900/40 relative z-10 px-20">
          <div className="flex items-center gap-10">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-3xl shadow-[0_0_30px_rgba(6,182,212,0.2)]">🌍</div>
            <div>
              <h2 className="text-4xl font-black uppercase tracking-tight text-white leading-tight">{t('automation', 'designerTitle')}</h2>
              <p className="text-[12px] font-black uppercase tracking-[0.4em] text-cyan-400/80 mt-2">{t('automation', 'designerSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-slate-500 hover:text-white transition-all">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-14 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10 px-20">
          <div className="lg:col-span-4 space-y-12 flex flex-col">
              <div className="space-y-6">
                 <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 ml-6">{t('automation', 'step1Plan')}</span>
                 <select value={planId} onChange={e => setPlanId(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-8 py-6 text-[13px] font-black uppercase text-cyan-400 outline-none appearance-none cursor-pointer focus:border-cyan-500/50 shadow-inner transition-all">
                    {plans.map(p => (
                      <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                        {p.floors?.name || p.name}
                      </option>
                    ))}
                 </select>
              </div>

              <div className="space-y-4 flex-1">
                 <div className="flex justify-between items-center px-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t('automation', 'step2Points')} ({points.length})</span>
                    <button onClick={addPoint} className="bg-gradient-to-br from-amber-400 to-orange-500 text-amber-950 w-10 h-10 rounded-xl flex items-center justify-center font-black text-2xl shadow-lg shadow-amber-500/20 hover:scale-110 transition-all">+</button>
                 </div>
                 <div className="space-y-3 max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
                    {points.map((p, idx) => (
                      <motion.div 
                        key={p.id} 
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        onClick={() => setActivePointIndex(Math.min(idx, points.length - 2))} 
                        className={`p-5 rounded-2xl border transition-all cursor-pointer relative group ${ (activePointIndex === idx || (activePointIndex === idx - 1 && idx === points.length - 1)) ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.05)]" : "bg-black/20 border-slate-800/50 hover:border-slate-700/50"}`}
                      >
                         <div className="flex items-center gap-4">
                            <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black border transition-all duration-300 ${p.pin ? "bg-cyan-500 border-cyan-400 text-slate-950" : "bg-slate-800 border-slate-700 text-slate-500"}`}>{idx + 1}</span>
                            <input 
                              value={p.name} onChange={e => handlePointNameChange(idx, e.target.value)}
                              onClick={e => e.stopPropagation()} placeholder="NAZWA..." 
                              list="busNodesList" className="flex-1 bg-transparent border-none text-[11px] font-black text-white uppercase tracking-wider outline-none placeholder:text-slate-700"
                            />
                            <datalist id="busNodesList">
                               {allNodes.filter(n => n.plan_id === planId).map(n => <option key={n.id} value={n.name} />)}
                            </datalist>
                            {p.pin && (
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[10px] text-cyan-400 font-black">✓</motion.span>
                            )}
                         </div>
                         {points.length > 2 && (
                            <button onClick={(e) => { e.stopPropagation(); removePoint(idx); }} className="absolute -top-1 -right-1 w-6 h-6 bg-red-500/20 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white">✕</button>
                         )}
                      </motion.div>
                    ))}
                 </div>
              </div>

              <div className="p-8 bg-slate-800/30 border border-slate-700/50 rounded-2xl shadow-inner relative overflow-hidden group">
                 <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-cyan-500/5 blur-2xl rounded-full"></div>
                 <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('automation', 'totalMeters')}</p>
                 <p className="text-4xl font-black text-white tracking-tighter group-hover:text-cyan-400 transition-colors">{fmtMeters(totalDistance)}</p>
              </div>
          </div>

          <div className="lg:col-span-8 flex flex-col h-[700px]">
             <div className="flex-1 bg-black/60 rounded-2xl overflow-hidden border border-slate-800/80 relative shadow-inner group">
                {planId && (
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={planId + activePointIndex}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="w-full h-full"
                    >
                       <SingleMap 
                         planId={planId} token={token} 
                         pinA={points[activePointIndex]?.pin} 
                         pinB={points[activePointIndex + 1]?.pin} 
                         setPinA={p => updatePoint(activePointIndex, { pin: p })} 
                         setPinB={p => updatePoint(activePointIndex + 1, { pin: p })}
                         picking={points[activePointIndex]?.pin ? "B" : "A"} 
                         onPicked={() => {}} 
                         waypoints={points[activePointIndex]?.waypoints || []} 
                         setWaypoints={w => updatePoint(activePointIndex, { waypoints: w })}
                         labelA={points[activePointIndex]?.name || `P${activePointIndex + 1}`}
                         labelB={points[activePointIndex + 1]?.name || `P${activePointIndex + 2}`}
                         calibrating={isCalibrating} onCalibrate={setCalPixelDist}
                       />
                    </motion.div>
                  </AnimatePresence>
                )}
                
                <div className="absolute top-8 left-8 right-8 flex justify-between items-center pointer-events-none">
                   <div className="bg-slate-900/90 backdrop-blur-2xl px-6 py-3.5 rounded-2xl border border-slate-700/50 shadow-2xl pointer-events-auto">
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-white">
                           {t('automation', 'drawingRoute')}: <span className="text-cyan-400">{points[activePointIndex]?.name || "P"+(activePointIndex+1)}</span> ↔ <span className="text-cyan-400">{points[activePointIndex+1]?.name || "P"+(activePointIndex+2)}</span>
                         </p>
                      </div>
                   </div>
                   <div className="flex gap-3 pointer-events-auto">
                      <button 
                        onClick={() => setIsCalibrating(!isCalibrating)} 
                        className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-lg ${isCalibrating ? "bg-red-500 border-red-400 text-white shadow-red-500/20" : "bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-white"}`}
                      >
                        {t('automation', 'calibrate')}
                      </button>
                   </div>
                </div>

                <div className="absolute bottom-8 left-8 right-8 flex justify-center gap-3 pointer-events-none">
                   {Array.from({ length: points.length - 1 }).map((_, i) => (
                     <button 
                       key={i} onClick={() => setActivePointIndex(i)} 
                       className={`pointer-events-auto px-6 py-3 rounded-2xl text-[10px] font-black tracking-widest transition-all duration-300 shadow-xl ${activePointIndex === i ? "bg-cyan-500 text-slate-950 scale-110 shadow-cyan-500/20" : "bg-slate-900/80 text-slate-500 border border-slate-700/50 hover:text-slate-300"}`}
                     >
                       {t('automation', 'segmentLabel')} {i + 1}
                     </button>
                   ))}
                </div>
             </div>
             
             <div className="mt-6 flex items-center justify-between px-6">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t('automation', 'designerTip')}</p>
                <div className="flex items-center gap-4 bg-slate-900/40 px-5 py-2.5 rounded-2xl border border-slate-800/50 shadow-inner">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('automation', 'planScale')}:</span>
                   <div className="flex items-center gap-2">
                      <input type="number" value={localStorage.getItem(SCALE_LS_KEY + planId) || ""} onChange={e => { localStorage.setItem(SCALE_LS_KEY + planId, e.target.value); }} className="w-20 bg-black/40 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-cyan-400 text-center outline-none focus:border-cyan-500/50" />
                      <span className="text-[10px] font-black text-slate-600 uppercase">px/m</span>
                   </div>
                </div>
             </div>
          </div>
        </div>

        <div className="p-14 border-t border-slate-700/30 bg-slate-900/40 flex gap-10 relative z-10 px-20">
          <button onClick={onClose} className="flex-1 py-7 rounded-2xl border border-slate-700/50 text-slate-500 font-black uppercase tracking-[0.2em] text-[13px] hover:bg-slate-800 hover:text-slate-300 transition-all">{t('common', 'cancel')}</button>
          <button 
            disabled={!isValid || saving} onClick={handleSave} 
            className={`flex-[2] py-7 rounded-2xl font-black uppercase tracking-[0.2em] text-[13px] transition-all shadow-2xl ${isValid ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/20 hover:scale-[1.02]" : "bg-slate-800/50 text-slate-700 border border-slate-700/30 opacity-50 cursor-not-allowed"}`}
          >
            {saving ? "Saving..." : t('automation', 'savePlanNetwork')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
