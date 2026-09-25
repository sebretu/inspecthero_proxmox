"use client";

import React, { useState, useEffect, useMemo } from "react";
import { apiGet } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

type Activity = {
  id: string;
  type: string;
  action: string;
  timestamp: string;
  ref?: string;
  old_value?: any;
  new_value?: any;
  summary?: string;
  meta?: any;
};

type User = {
  id: string;
  full_name: string;
  email: string;
};

export default function UserReportsPage() {
  const { t, language } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showAllMonths, setShowAllMonths] = useState(false);

  useEffect(() => {
    apiGet<User[]>("/api/users?includeInactive=true").then((res) => {
      if (Array.isArray(res)) {
        setUsers(res);
        if (res.length > 0) setSelectedUserId(res[0].id);
      }
    });
  }, []);

  const fetchActivities = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    let from = "";
    let to = "";
    if (!showAllMonths) {
      from = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
      to = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString();
    } else {
      from = new Date(selectedYear, 0, 1).toISOString();
      to = new Date(selectedYear, 11, 31, 23, 59, 59).toISOString();
    }
    try {
      const res = await apiGet<Activity[]>(`/api/user-activity?userId=${selectedUserId}&from=${from}&to=${to}`);
      setActivities(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [selectedUserId, selectedYear, selectedMonth, showAllMonths]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, Activity[]> = {};
    activities.forEach(act => {
      const date = new Date(act.timestamp).toLocaleDateString('en-CA');
      if (!groups[date]) groups[date] = [];
      groups[date].push(act);
    });
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayActivities]) => [
        date, 
        dayActivities.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      ] as [string, Activity[]]);
  }, [activities]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'task_history': return "📝";
      case 'cable_history': return "🔌";
      case 'fehler_history': return "⚠️";
      case 'stromkreis_history': return "⚡";
      case 'attendance': return "📅";
      case 'comment': return "💬";
      default: return "⚡";
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'task_history': return "#3b82f6";
      case 'cable_history': return "#10b981";
      case 'fehler_history': return "#ef4444";
      case 'stromkreis_history': return "#eab308";
      case 'attendance': return "#f59e0b";
      case 'comment': return "#a855f7";
      default: return "#6366f1";
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "??:??";
    return d.toLocaleTimeString(language === "pl" ? "pl-PL" : "de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(language === "pl" ? "pl-PL" : "de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
  };

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 overflow-x-hidden pb-20"
    >
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/5 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(#94a3b8 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1200px]">
        {/* Header Card */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-24 gap-8 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-10 lg:p-14 rounded-2xl shadow-2xl shadow-black/50">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase leading-none">
              {t("user_reports", "title", "USERACTIVITY")}
            </h1>
            <p className="text-slate-500 text-xs mt-4 uppercase font-bold tracking-[0.3em]">
              {t("user_reports", "subtitle", "Echtzeit-Monitoring Dashboard")}
            </p>
          </div>

          <div className="flex flex-wrap gap-4 w-full lg:w-auto">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">{t("user_reports", "selectUser", "BENUTZER")}</label>
              <select 
                className="bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer min-w-[200px]" 
                value={selectedUserId} 
                onChange={e => setSelectedUserId(e.target.value)}
              >
                {users.map(u => <option key={u.id} value={u.id} className="bg-slate-900">{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">{t("user_reports", "month", "MONAT")}</label>
              <div className="flex gap-2">
                <select 
                  className="bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer" 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(parseInt(e.target.value))}
                >
                  {months.map((m, i) => <option key={m} value={i + 1} className="bg-slate-900">{t("user_reports", m, m).toUpperCase()}</option>)}
                </select>
                <select 
                  className="bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer" 
                  value={selectedYear} 
                  onChange={e => setSelectedYear(parseInt(e.target.value))}
                >
                  {years.map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Activities List */}
        <div className="max-w-4xl mx-auto space-y-48">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="py-40 text-center flex flex-col items-center gap-6"
              >
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 font-black uppercase tracking-[0.5em] animate-pulse">{t("common", "loading", "LADEN...")}</p>
              </motion.div>
            ) : groupedByDay.length > 0 ? (
              groupedByDay.map(([date, dayActivities], dayIdx) => (
                <motion.div 
                  key={date}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="relative"
                >
                  {/* Visual day separator line if not the first day */}
                  {dayIdx > 0 && (
                    <div className="absolute -top-24 left-0 right-0 flex items-center justify-center gap-6 opacity-10">
                      <div className="h-[1px] flex-grow bg-blue-500"></div>
                      <div className="text-blue-500 text-sm font-black tracking-widest uppercase italic">NEXT DAY</div>
                      <div className="h-[1px] flex-grow bg-blue-500"></div>
                    </div>
                  )}

                  <div className="sticky top-12 z-30 mb-16 flex justify-center">
                    <div className="bg-blue-500 text-slate-950 px-12 py-5 rounded-2xl font-black uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(59,130,246,0.4)] border-4 border-[#020617] text-xl">
                      {formatDateLabel(date)}
                    </div>
                  </div>

                  <div className="space-y-12 relative px-4">
                    <div className="absolute left-[64px] md:left-[156px] top-0 bottom-0 w-px bg-slate-800 rounded-full"></div>

                    {dayActivities.map((act, idx) => (
                      <motion.div 
                        key={idx} 
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-start gap-12 md:gap-24 group"
                      >
                        <div className="flex-shrink-0 w-[80px] md:w-[130px] pt-1 text-right">
                           <div className="bg-[#020617] border-2 border-blue-500/50 rounded-2xl px-3 py-2 shadow-xl inline-block group-hover:scale-110 transition-transform">
                              <span className="text-base md:text-2xl font-black text-white tabular-nums">
                                {formatTime(act.timestamp)}
                              </span>
                           </div>
                        </div>

                        <div className="absolute left-[56px] md:left-[148px] top-[14px] w-5 h-5 rounded-full border-4 border-[#020617] z-10 shadow-lg group-hover:scale-150 transition-transform" style={{ backgroundColor: getActivityColor(act.type) }}></div>
                        
                        <div className="flex-grow bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-8 md:p-10 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border-b-8 border-b-blue-500/10">
                          <div className="flex items-center gap-8 mb-8">
                            <div className="w-16 h-16 rounded-2xl bg-black/40 flex items-center justify-center text-4xl border border-white/5 shadow-inner">
                              {getActivityIcon(act.type)}
                            </div>
                            <div>
                              <h4 className="text-xl md:text-2xl font-black text-white group-hover:text-blue-400 transition-colors leading-tight mb-2 uppercase tracking-tighter">{act.ref || '-'}</h4>
                              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">{t("user_reports", `type_${act.type}`, act.type)}</p>
                            </div>
                          </div>

                          <div className="bg-black/40 rounded-2xl p-8 border border-white/5">
                            <p className="text-base text-slate-400 font-medium leading-relaxed">
                              {act.action || act.summary || (act.type === 'comment' ? t("user_reports", "type_comment", "Comment") : '-')}
                            </p>
                          </div>

                          {(act.old_value || act.new_value) && (
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] font-mono">
                              <div className="bg-red-500/5 p-6 rounded-2xl border border-red-500/10 truncate text-red-300/40">
                                 <span className="text-[8px] uppercase font-black text-red-500/50 block mb-2 tracking-widest">PREVIOUS</span>
                                 {typeof act.old_value === 'object' ? JSON.stringify(act.old_value) : String(act.old_value)}
                              </div>
                              <div className="bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/10 truncate text-emerald-300">
                                 <span className="text-[8px] uppercase font-black text-emerald-500/50 block mb-2 tracking-widest">UPDATED</span>
                                 {typeof act.new_value === 'object' ? JSON.stringify(act.new_value) : String(act.new_value)}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 0.2 }}
                className="py-40 text-center"
              >
                <span className="text-9xl block mb-10">📂</span>
                <p className="text-3xl font-black uppercase tracking-widest">
                  {t("user_reports", "noHistory", "NO HISTORY RECORDED")}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style jsx global>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}
