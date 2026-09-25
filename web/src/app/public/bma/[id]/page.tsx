"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Activity, Map as MapIcon, Globe } from "lucide-react";

const BmaLeafletEditor = dynamic(
  () => import("@/components/BmaLeafletEditor"),
  { ssr: false }
) as any;

export default function PublicBmaPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = React.use(params);
  const planId = resolvedParams.id;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>({ scale: 100 });

  useEffect(() => {
    if (!planId) return;
    fetch(`/api/bma/public-plan?planId=${planId}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setData(res.data);
          // Fetch settings for the project
          if (res.data?.plan?.project_id) {
            fetch(`/api/bma/settings?projectId=${res.data.plan.project_id}`)
              .then(r => r.json())
              .then(s => setSettings(s.data || s))
              .catch(err => console.error("Failed to fetch settings:", err));
          }
        } else {
          setError(res.error || "Plan not found");
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) {
    return (
      <div className="h-screen bg-[#020617] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse shadow-[0_0_40px_rgba(37,99,235,0.3)]">
           <Activity className="w-8 h-8 text-white" />
        </div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Initializing Secure Map Engine...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen bg-[#020617] flex flex-col items-center justify-center gap-8 p-12 text-center">
        <div className="w-20 h-20 rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center shadow-2xl shadow-red-600/10">
           <Globe className="w-10 h-10 text-red-500" />
        </div>
        <div className="space-y-4 max-w-md">
           <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Access Denied</h1>
           <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] leading-relaxed">
             {error || "The plan you are looking for is no longer public or the link has expired."}
           </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all mt-4"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { plan, devices, connections, routes } = data;
  const planName = [plan.floors?.buildings?.name, plan.floors?.name].filter(Boolean).join(" - ") || `Plan v${plan.version}`;

  return (
    <div className="h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between">
         <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
               <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
                <h1 className="text-lg font-black text-white uppercase tracking-tight leading-none">{planName}</h1>
                <div className="flex items-center gap-3 mt-1">
                   <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Public Browser Mode • ET⚡U.DE</p>
                   <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                   <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      {devices.length} Units • {routes.length} Paths
                   </p>
                </div>
            </div>
         </div>
         <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global Access Active</span>
         </div>
      </div>

      {/* Map Content */}
      <div className="flex-1 relative h-full">
         <BmaLeafletEditor 
            projectId={plan.project_id}
            planId={plan.id}
            token={null} // Public mode
            devices={devices}
            connections={connections}
            routes={routes}
            onSave={() => {}} // Read only
            isAdmin={false} // Read only
            settings={settings}
         />
      </div>

      {/* Footer Instructions */}
      <div className="p-4 bg-black/60 backdrop-blur-md border-t border-white/5 text-center">
         <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">
            Interactive Infrastructure Map • Powered by ET⚡U.DE Automation Engine
         </p>
      </div>
    </div>
  );
}
