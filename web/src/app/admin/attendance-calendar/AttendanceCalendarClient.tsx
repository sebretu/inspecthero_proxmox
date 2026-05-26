"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, apiPatch, apiDelete, getToken } from "@/lib/apiClient";
import PhotoLightbox from "@/components/PhotoLightbox";
import { motion, AnimatePresence } from "framer-motion";

interface Worker {
    id: string;
    full_name: string;
    role?: string;
    type: 'PROFILE' | 'EMPLOYEE';
    photo_url?: string;
    is_active?: boolean;
}

interface Attendance {
    user_id?: string;
    employee_id?: string;
    date: string;
    status: 'PRESENT' | 'ABSENT';
    start_time?: string;
    end_time?: string;
    break_time?: number;
}

interface Vacation {
    user_id?: string;
    employee_id?: string;
    start_date: string;
    end_date: string;
    status: string;
}

interface Holiday {
    date: string;
    name: string;
}

interface CalendarData {
    year: number;
    workers: Worker[];
    attendance: Attendance[];
    vacations: Vacation[];
    holidays: Holiday[];
}

const COLORS = {
    HOLIDAY: "#2196f3", VACATION: "#f59e0b", PRESENT: "#22c55e", ABSENT: "#ef4444", WEEKEND: "#475569", SUNDAY: "#991b1b", NONE: "#1e293b"
};

export default function AttendanceCalendarClient() {
    const router = useRouter();
    const { t } = useLanguage();

    const [data, setData] = useState<CalendarData | null>(null);
    const [year, setYear] = useState(new Date().getFullYear());
    const [workerFilter, setWorkerFilter] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [newEmployeeName, setNewEmployeeName] = useState("");
    const [newEmployeePhoto, setNewEmployeePhoto] = useState<{ file: File, base64: string } | null>(null);

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingCell, setEditingCell] = useState<{ worker: Worker, date: string } | null>(null);
    const [editStatus, setEditStatus] = useState<'PRESENT' | 'ABSENT' | 'VACATION'>('PRESENT');
    const [editStart, setEditStart] = useState("");
    const [editEnd, setEditEnd] = useState("");
    const [me, setMe] = useState<{ id: string, role: string, email: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [showManageModal, setShowManageModal] = useState(false);
    const [allEmployees, setAllEmployees] = useState<Worker[]>([]);
    const [isManaging, setIsManaging] = useState(false);

    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [editBreak, setEditBreak] = useState(0);

    useEffect(() => { loadData(); }, [year]);

    async function loadData() {
        setIsLoading(true); setError(null);
        try {
            const token = await getToken();
            if (!token) { router.replace("/auth/login"); return; }
            const [calendarRes, meRes] = await Promise.all([
                apiGet<CalendarData>(`/api/calendar?year=${year}`, token),
                apiGet<any>('/api/me', token)
            ]);
            setData(calendarRes);
            if (meRes?.profile) setMe(meRes.profile);
        } catch (err: any) { setError(err.message); }
        finally { setIsLoading(false); }
    }

    const loadEmployeesList = async () => {
        setIsManaging(true);
        try {
            const token = await getToken();
            const res = await apiGet<Worker[]>("/api/employees", token);
            setAllEmployees(res);
        } catch (err: any) { alert(err.message); }
        finally { setIsManaging(false); }
    };

    const handlePhotoUpload = async (workerId: string, isProfile: boolean, file: File) => {
        setIsUploading(true);
        try {
            const token = await getToken();
            const reader = new FileReader(); reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;
                try {
                    await apiPost("/api/employee-photos", { [isProfile ? 'profile_id' : 'employee_id']: workerId, base64, file_name: file.name }, token);
                    loadData(); loadEmployeesList();
                } catch (e: any) { alert(e.message); }
                finally { setIsUploading(false); }
            };
        } catch (err: any) { alert(err.message); setIsUploading(false); }
    };

    const handleAddEmployee = async () => {
        if (!newEmployeeName.trim()) return;
        setIsSaving(true);
        try {
            const token = await getToken();
            const res = await apiPost<any>("/api/employees", { full_name: newEmployeeName }, token || "");
            if (newEmployeePhoto && res?.id) {
                await apiPost("/api/employee-photos", { employee_id: res.id, base64: newEmployeePhoto.base64, file_name: newEmployeePhoto.file.name }, token || "");
            }
            setShowEmployeeModal(false); setNewEmployeeName(""); setNewEmployeePhoto(null); loadData();
        } catch (err: any) { alert(err.message); }
        finally { setIsSaving(false); }
    };

    const handleEditClick = (worker: Worker, dateStr: string, event?: React.MouseEvent) => {
        const cellId = `${worker.id}|${dateStr}`;
        if (event && (event.altKey || event.ctrlKey || event.metaKey)) {
            const newSelected = new Set(selectedCells);
            if (newSelected.has(cellId)) newSelected.delete(cellId);
            else newSelected.add(cellId);
            setSelectedCells(newSelected);
            return;
        }
        if (selectedCells.size > 1 && selectedCells.has(cellId)) { setShowBulkModal(true); return; }
        const att = data?.attendance.find(a => (a.user_id === worker.id || a.employee_id === worker.id) && a.date === dateStr);
        setSelectedCells(new Set([cellId]));
        setEditingCell({ worker, date: dateStr });
        setEditStatus(att?.status || 'PRESENT'); setEditStart(att?.start_time || "07:00"); setEditEnd(att?.end_time || "18:00"); setEditBreak(att?.break_time || 0);
        setShowEditModal(true);
    };

    const handleBulkSave = async () => {
        setIsSaving(true);
        try {
            const token = await getToken();
            const promises = Array.from(selectedCells).map(cellId => {
                const [id, date] = cellId.split('|');
                const worker = data?.workers.find(w => w.id === id);
                if (!worker) return Promise.resolve();
                return apiPost("/api/attendance", {
                    date, status: editStatus, start_time: editStatus === 'PRESENT' ? editStart : null, end_time: editStatus === 'PRESENT' ? editEnd : null, break_time: editStatus === 'PRESENT' ? editBreak : 0, [worker.type === 'PROFILE' ? 'user_id' : 'employee_id']: worker.id
                }, token || "");
            });
            await Promise.all(promises); setShowBulkModal(false); setSelectedCells(new Set()); loadData();
        } catch (err: any) { alert(err.message); }
        finally { setIsSaving(false); }
    };

    const handleSaveAttendance = async () => {
        if (!editingCell) return;
        setIsSaving(true);
        try {
            const token = await getToken();
            await apiPost("/api/attendance", {
                date: editingCell.date, status: editStatus, start_time: editStatus === 'PRESENT' ? editStart : null, end_time: editStatus === 'PRESENT' ? editEnd : null, break_time: editStatus === 'PRESENT' ? editBreak : 0, [editingCell.worker.type === 'PROFILE' ? 'user_id' : 'employee_id']: editingCell.worker.id
            }, token || "");
            setShowEditModal(false); loadData();
        } catch (err: any) { alert(err.message); }
        finally { setIsSaving(false); }
    };

    const handleDeleteAttendance = async () => {
        if (!editingCell) return;
        if (!confirm(t("common", "deleteConfirm", "Are you sure?"))) return;
        setIsSaving(true);
        try {
            const token = await getToken();
            const idKey = editingCell.worker.type === 'PROFILE' ? 'user_id' : 'employee_id';
            await apiDelete(`/api/attendance?date=${editingCell.date}&${idKey}=${editingCell.worker.id}`, token || "");
            setShowEditModal(false); loadData();
        } catch (err: any) { alert(err.message); }
        finally { setIsSaving(false); }
    };

    const handleUpdateEmployee = async (id: string, name: string, active: boolean) => {
        try {
            const token = await getToken();
            await apiPatch("/api/employees", { id, full_name: name, is_active: active }, token || "");
            loadEmployeesList(); loadData();
        } catch (err: any) { alert(err.message); }
    };

    const handleDeleteEmployee = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            const token = await getToken();
            await apiDelete(`/api/employees?id=${id}`, token || "");
            loadEmployeesList(); loadData();
        } catch (err: any) { alert(err.message); }
    };

    const getDayStatus = (worker: Worker, dateStr: string) => {
        if (!data) return "NONE";
        const att = data.attendance.find(a => (a.user_id === worker.id || a.employee_id === worker.id) && a.date === dateStr);
        if (att) return att.status;
        const isVacation = data.vacations.find(v => (v.user_id === worker.id || v.employee_id === worker.id) && v.status === 'APPROVED' && dateStr >= v.start_date && dateStr <= v.end_date);
        if (isVacation) return "VACATION";
        const isHoliday = data.holidays.find(h => h.date === dateStr);
        if (isHoliday) return "HOLIDAY";
        const d = new Date(dateStr);
        if (d.getDay() === 0) return "SUNDAY";
        if (d.getDay() === 6) return "WEEKEND";
        return "NONE";
    };

    const calculateHours = (start?: string, end?: string, breakTime: number = 0) => {
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        return Math.max(0, (diff / 60) - breakTime);
    };

    const totals = useMemo(() => {
        if (!data) return {};
        const res: Record<string, { daily: Record<string, number>, monthly: number[] }> = {};
        data.workers.forEach(w => {
            res[w.id] = { daily: {}, monthly: Array(12).fill(0) };
            data.attendance.filter(a => a.user_id === w.id || a.employee_id === w.id).forEach(a => {
                if (a.status === 'PRESENT') {
                    const h = calculateHours(a.start_time, a.end_time, a.break_time);
                    res[w.id].daily[a.date] = h;
                    res[w.id].monthly[new Date(a.date).getMonth()] += h;
                }
            });
        });
        return res;
    }, [data]);

    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const getDaysInMonth = (monthIdx: number, year: number) => new Date(year, monthIdx + 1, 0).getDate();
    const filteredWorkers = data?.workers.filter(w => w.full_name.toLowerCase().includes(workerFilter.toLowerCase())) || [];
    const isAdmin = me?.role === 'ADMIN';

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#020617] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 overflow-x-hidden pb-20"
        >
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(#94a3b8 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
            </div>

            <div className="relative z-10 container mx-auto px-2 md:px-6 py-6 md:py-12 max-w-[1800px]">
                {/* Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-4 md:p-8 lg:p-14 rounded-lg md:rounded-xl shadow-2xl">
                    <div>
                        <h1 className="text-xl md:text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase leading-none">
                            {t("attendance", "title", "ANWESENHEITSKALENDER")}
                        </h1>
                        <p className="text-slate-500 text-xs mt-4 uppercase font-bold tracking-[0.3em]">
                            {t("attendance", "subtitle", "Arbeitszeiterfassung und Anwesenheitsübersicht")}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            className="bg-black/40 border border-slate-700/50 rounded-lg md:rounded-xl px-4 md:px-6 py-3 md:py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer"
                        >
                            {[2025, 2026, 2027].map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                        </select>
                        <div className="relative flex-1 sm:w-64">
                            <input
                                type="text"
                                placeholder={t("attendance", "filter", "Mitarbeiter filtern...")}
                                value={workerFilter}
                                onChange={e => setWorkerFilter(e.target.value)}
                                className="w-full bg-black/40 border border-slate-700/50 rounded-lg md:rounded-xl px-8 md:px-12 py-3 md:py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                            />
                            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                        </div>
                        <button
                            onClick={() => { setShowManageModal(true); loadEmployeesList(); }}
                            className="bg-slate-800 text-white px-8 py-4 rounded-lg md:rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-700 transition-all border border-slate-700/50"
                        >
                            {t("attendance", "manage", "VERWALTEN")}
                        </button>
                        <button
                            onClick={() => setShowEmployeeModal(true)}
                            className="bg-blue-500 text-slate-950 px-8 py-4 rounded-lg md:rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                        >
                            ➕ {t("attendance", "add", "HINZUFÜGEN")}
                        </button>
                    </div>
                </div>

                {/* Month Picker */}
                <div className="flex bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-1.5 md:p-3 rounded-lg md:rounded-xl mb-8 overflow-x-auto no-scrollbar shadow-xl">
                    {months.map((m, idx) => (
                        <button
                            key={m}
                            onClick={() => setSelectedMonth(idx)}
                            className={`px-4 md:px-8 py-3 md:py-4 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-1 min-w-[60px] md:min-w-[100px] ${
                                selectedMonth === idx 
                                ? "bg-blue-500 text-slate-950 shadow-lg shadow-blue-500/20" 
                                : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]"
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* Calendar Layout */}
                <div className="bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-lg md:rounded-xl overflow-hidden shadow-2xl">
                    <div className="px-3 md:px-10 py-4 md:py-8 bg-white/[0.02] border-b border-slate-800/50 flex justify-between items-center">
                        <div className="flex flex-wrap items-center gap-4 md:gap-10">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded bg-[#22c55e]" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("common", "present", "Anwesend")}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded bg-[#ef4444]" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("common", "absent", "Abwesend")}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded bg-[#f59e0b]" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("common", "vacation", "Urlaub")}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded bg-[#2196f3]" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t("common", "holiday", "Feiertag")}</span>
                            </div>
                        </div>
                        {selectedCells.size > 0 && (
                            <div className="flex items-center gap-6">
                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{selectedCells.size} AUSGEWÄHLT</span>
                                <button onClick={() => { setEditStatus('PRESENT'); setEditStart("07:00"); setEditEnd("18:00"); setShowBulkModal(true); }} className="bg-blue-500 text-slate-950 px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg">BULK EDIT</button>
                                <button onClick={() => setSelectedCells(new Set())} className="text-slate-500 hover:text-white transition-colors">✕</button>
                            </div>
                        )}
                    </div>

                    <div className="overflow-x-auto no-scrollbar">
                        <div className="min-w-fit inline-block">
                            <div className="grid grid-cols-[160px_repeat(31,minmax(36px,1fr))] md:grid-cols-[300px_repeat(31,minmax(45px,1fr))] border-b border-slate-800/50">
                                <div className="px-3 md:px-10 py-4 md:py-8 text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] border-r border-slate-800/50 sticky left-0 bg-[#0c1322] z-20 shadow-xl">
                                    {t("attendance", "worker", "MITARBEITER")}
                                </div>
                                {Array.from({ length: getDaysInMonth(selectedMonth, year) }, (_, i) => i + 1).map(day => {
                                    const d = new Date(year, selectedMonth, day);
                                    const isSun = d.getDay() === 0;
                                    const isSat = d.getDay() === 6;
                                    return (
                                        <div key={day} className={`py-8 text-center text-[11px] font-black tracking-tight border-r border-slate-800/20 ${isSun ? "bg-red-500/10 text-red-500" : isSat ? "bg-slate-800/40 text-slate-400" : "text-slate-500"}`}>
                                            {day}
                                        </div>
                                    );
                                })}
                            </div>

                            {filteredWorkers.map((worker, wIdx) => (
                                <div key={worker.id} className="grid grid-cols-[160px_repeat(31,minmax(36px,1fr))] md:grid-cols-[300px_repeat(31,minmax(45px,1fr))] group hover:bg-white/[0.01] transition-colors border-b border-slate-800/10">
                                    <div className="px-2 md:px-10 py-3 md:py-6 flex items-center gap-2 md:gap-4 border-r border-slate-800/50 sticky left-0 bg-[#0c1322] z-20 group-hover:bg-[#131b2d] transition-colors shadow-xl">
                                        <div 
                                            onClick={() => worker.photo_url && setLightboxUrl(worker.photo_url)}
                                            className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700/50 overflow-hidden cursor-pointer shrink-0 shadow-lg"
                                        >
                                            {worker.photo_url ? <img src={worker.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black">{worker.full_name[0]}</div>}
                                        </div>
                                        <div className="overflow-hidden">
                                            <div className="text-[11px] font-black text-white uppercase tracking-tight truncate">{worker.full_name}</div>
                                            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">TOTAL: {(totals[worker.id]?.monthly[selectedMonth] || 0).toFixed(1)}h</div>
                                        </div>
                                    </div>

                                    {Array.from({ length: getDaysInMonth(selectedMonth, year) }, (_, i) => i + 1).map(day => {
                                        const dateStr = `${year}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const status = getDayStatus(worker, dateStr);
                                        const isSelected = selectedCells.has(`${worker.id}|${dateStr}`);
                                        const hours = totals[worker.id]?.daily[dateStr];

                                        return (
                                            <div key={day} className={`relative flex items-center justify-center py-4 border-r border-slate-800/10 ${isSelected ? "bg-blue-500/20" : ""}`}>
                                                <motion.button
                                                    whileHover={{ scale: 1.2 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={(e) => handleEditClick(worker, dateStr, e as any)}
                                                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black transition-all shadow-lg ${isSelected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0c1322]" : ""}`}
                                                    style={{ background: COLORS[status as keyof typeof COLORS] || COLORS.NONE, color: status === 'VACATION' ? '#000' : '#fff' }}
                                                >
                                                    {hours && hours > 0 ? Math.round(hours) : ""}
                                                </motion.button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showEditModal && editingCell && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditModal(false)} className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-lg md:rounded-xl p-6 md:p-12 shadow-2xl">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">{editingCell.worker.full_name}</h2>
                            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-10">{editingCell.date}</p>
                            
                            <div className="space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("common", "status", "STATUS")}</label>
                                    <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)} className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer">
                                        <option value="PRESENT" className="bg-slate-900">{t("common", "present", "Anwesend")}</option>
                                        <option value="ABSENT" className="bg-slate-900">{t("common", "absent", "Abwesend")}</option>
                                        <option value="VACATION" className="bg-slate-900">{t("common", "vacation", "Urlaub")}</option>
                                    </select>
                                </div>

                                {editStatus === 'PRESENT' && (
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("common", "start", "VON")}</label>
                                            <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none" />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("common", "end", "BIS")}</label>
                                            <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none" />
                                        </div>
                                    </div>
                                )}

                                {editStatus === 'PRESENT' && (
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("attendance", "unpaidBreak", "UNBEZAHLTE PAUSE (H)")}</label>
                                        <select value={editBreak} onChange={e => setEditBreak(Number(e.target.value))} className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer">
                                            {[0, 0.5, 1.0].map(v => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                                        </select>
                                    </div>
                                )}

                                <div className="flex gap-4 pt-10 border-t border-slate-800/50">
                                    <button onClick={handleDeleteAttendance} className="flex-1 bg-red-500/10 text-red-500 border border-red-500/20 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest">LÖSCHEN</button>
                                    <button onClick={handleSaveAttendance} disabled={isSaving} className="flex-1 bg-blue-500 text-slate-950 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20">{isSaving ? "..." : "SPEICHERN"}</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </motion.div>
    );
}
