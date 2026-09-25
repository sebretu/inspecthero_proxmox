"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNotification } from "@/contexts/NotificationContext";
import { apiGet, apiPost, apiPatch, apiDelete, getToken } from "@/lib/apiClient";
import PhotoLightbox from "@/components/PhotoLightbox";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Plus, Trash2, Check, Users, User, Clock, AlertCircle } from "lucide-react";

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
    const { showNotification } = useNotification();

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
            setAllEmployees(Array.isArray(res) ? res : []);
        } catch (err: any) {
            console.error("loadEmployeesList error:", err);
            setAllEmployees([]);
        }
        finally { setIsManaging(false); }
    };

    const handlePhotoUpload = async (workerId: string, isProfile: boolean, file: File) => {
        setIsUploading(true);
        try {
            const token = await getToken();
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;
                try {
                    await apiPost("/api/employee-photos", { [isProfile ? 'profile_id' : 'employee_id']: workerId, base64, file_name: file.name }, token);
                    showNotification?.("Foto erfolgreich hochgeladen!", "success");
                    loadData();
                    loadEmployeesList();
                } catch (e: any) {
                    showNotification?.(e.message || "Fehler beim Hochladen des Fotos", "error");
                }
                finally { setIsUploading(false); }
            };
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Lesen der Datei", "error");
            setIsUploading(false);
        }
    };

    const handleAddEmployee = async () => {
        if (!newEmployeeName.trim()) return;
        setIsSaving(true);
        try {
            const token = await getToken();
            const res = await apiPost<any>("/api/employees", { full_name: newEmployeeName.trim() }, token || "");
            if (newEmployeePhoto && res?.id) {
                await apiPost("/api/employee-photos", { employee_id: res.id, base64: newEmployeePhoto.base64, file_name: newEmployeePhoto.file.name }, token || "");
            }
            setShowEmployeeModal(false);
            setNewEmployeeName("");
            setNewEmployeePhoto(null);
            showNotification?.("Mitarbeiter erfolgreich hinzugefügt!", "success");
            loadData();
            loadEmployeesList();
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Hinzufügen des Mitarbeiters", "error");
        }
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
            await Promise.all(promises);
            setShowBulkModal(false);
            setSelectedCells(new Set());
            showNotification?.("Einträge erfolgreich gespeichert!", "success");
            loadData();
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Speichern", "error");
        }
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
            setShowEditModal(false);
            showNotification?.("Anwesenheit gespeichert!", "success");
            loadData();
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Speichern", "error");
        }
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
            setShowEditModal(false);
            showNotification?.("Eintrag gelöscht!", "success");
            loadData();
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Löschen", "error");
        }
        finally { setIsSaving(false); }
    };

    const handleUpdateEmployee = async (id: string, name: string, active: boolean) => {
        try {
            const token = await getToken();
            await apiPatch("/api/employees", { id, full_name: name, is_active: active }, token || "");
            showNotification?.("Mitarbeiter aktualisiert!", "success");
            loadEmployeesList();
            loadData();
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Aktualisieren", "error");
        }
    };

    const handleDeleteEmployee = async (id: string) => {
        if (!confirm(t("common", "deleteConfirm", "Are you sure?"))) return;
        try {
            const token = await getToken();
            await apiDelete(`/api/employees?id=${id}`, token || "");
            showNotification?.("Mitarbeiter gelöscht!", "success");
            loadEmployeesList();
            loadData();
        } catch (err: any) {
            showNotification?.(err.message || "Fehler beim Löschen", "error");
        }
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
                {/* Single Day Edit Modal */}
                {showEditModal && editingCell && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditModal(false)} className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-2xl p-6 md:p-10 shadow-2xl">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">{editingCell.worker.full_name}</h2>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{editingCell.date}</p>
                                </div>
                                <button onClick={() => setShowEditModal(false)} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("common", "status", "STATUS")}</label>
                                    <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none appearance-none cursor-pointer focus:border-blue-500/50">
                                        <option value="PRESENT" className="bg-slate-900">{t("common", "present", "Anwesend")}</option>
                                        <option value="ABSENT" className="bg-slate-900">{t("common", "absent", "Abwesend")}</option>
                                        <option value="VACATION" className="bg-slate-900">{t("common", "vacation", "Urlaub")}</option>
                                    </select>
                                </div>

                                {editStatus === 'PRESENT' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("common", "start", "VON")}</label>
                                            <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none focus:border-blue-500/50" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("common", "end", "BIS")}</label>
                                            <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none focus:border-blue-500/50" />
                                        </div>
                                    </div>
                                )}

                                {editStatus === 'PRESENT' && (
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("attendance", "unpaidBreak", "UNBEZAHLTE PAUSE (H)")}</label>
                                        <select value={editBreak} onChange={e => setEditBreak(Number(e.target.value))} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none appearance-none cursor-pointer focus:border-blue-500/50">
                                            {[0, 0.5, 1.0].map(v => <option key={v} value={v} className="bg-slate-900">{v} h</option>)}
                                        </select>
                                    </div>
                                )}

                                <div className="flex gap-4 pt-6 border-t border-slate-800/50">
                                    <button onClick={handleDeleteAttendance} disabled={isSaving} className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                        LÖSCHEN
                                    </button>
                                    <button onClick={handleSaveAttendance} disabled={isSaving} className="flex-1 bg-blue-500 hover:bg-blue-400 text-slate-950 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all">
                                        {isSaving ? "..." : "SPEICHERN"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Add Employee Modal */}
                {showEmployeeModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEmployeeModal(false)} className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl p-6 md:p-8 shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                                        <Plus className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-white uppercase tracking-tight">{t("attendance", "addWorkerTitle", "Neuen Mitarbeiter hinzufügen")}</h2>
                                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{t("attendance", "title", "Anwesenheitskalender")}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowEmployeeModal(false)} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("attendance", "workerName", "Vollständiger Name")}</label>
                                    <input 
                                        type="text" 
                                        placeholder="z.B. Jan Kowalski" 
                                        value={newEmployeeName} 
                                        onChange={e => setNewEmployeeName(e.target.value)} 
                                        autoFocus
                                        className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600" 
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("attendance", "workerPhoto", "Foto (optional)")}</label>
                                    {newEmployeePhoto ? (
                                        <div className="flex items-center gap-4 p-3 bg-black/40 border border-slate-700/50 rounded-xl">
                                            <img src={newEmployeePhoto.base64} alt="Preview" className="w-12 h-12 rounded-full object-cover border border-blue-500/50" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{newEmployeePhoto.file.name}</p>
                                                <p className="text-[9px] text-slate-500">{(newEmployeePhoto.file.size / 1024).toFixed(0)} KB</p>
                                            </div>
                                            <button onClick={() => setNewEmployeePhoto(null)} className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-700/60 hover:border-blue-500/50 rounded-xl cursor-pointer bg-black/20 hover:bg-black/40 transition-all">
                                            <Camera className="w-6 h-6 text-slate-400 mb-2" />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t("attendance", "choosePhoto", "Foto auswählen")}</span>
                                            <span className="text-[9px] text-slate-600 mt-1">PNG, JPG bis 5MB</span>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                className="hidden" 
                                                onChange={e => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.readAsDataURL(file);
                                                        reader.onload = () => setNewEmployeePhoto({ file, base64: reader.result as string });
                                                    }
                                                }} 
                                            />
                                        </label>
                                    )}
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-slate-800/50">
                                    <button 
                                        type="button"
                                        onClick={() => setShowEmployeeModal(false)} 
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        {t("common", "cancel", "Abbrechen")}
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={handleAddEmployee} 
                                        disabled={isSaving || !newEmployeeName.trim()} 
                                        className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-slate-950 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all"
                                    >
                                        {isSaving ? "..." : t("attendance", "addBtn", "Hinzufügen")}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Manage Employees Modal */}
                {showManageModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowManageModal(false)} className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/50 rounded-2xl p-6 md:p-8 shadow-2xl max-h-[85vh] flex flex-col">
                            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/60">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-blue-400">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">{t("attendance", "manageWorkersTitle", "Mitarbeiter verwalten")}</h2>
                                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{allEmployees.length} {t("attendance", "workersCount", "Mitarbeiter registriert")}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => { setShowManageModal(false); setShowEmployeeModal(true); }}
                                        className="bg-blue-500 hover:bg-blue-400 text-slate-950 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> {t("attendance", "add", "Hinzufügen")}
                                    </button>
                                    <button onClick={() => setShowManageModal(false)} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 py-2">
                                {isManaging ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 border-3 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Laden...</span>
                                    </div>
                                ) : allEmployees.length === 0 ? (
                                    <div className="py-12 text-center text-slate-500 text-xs font-bold uppercase tracking-widest">
                                        {t("attendance", "noWorkersFound", "Keine Mitarbeiter gefunden")}
                                    </div>
                                ) : (
                                    allEmployees.map(emp => (
                                        <EmployeeRow 
                                            key={emp.id} 
                                            emp={emp} 
                                            onUpdate={handleUpdateEmployee} 
                                            onDelete={handleDeleteEmployee} 
                                            onPhotoUpload={handlePhotoUpload} 
                                            isUploading={isUploading}
                                        />
                                    ))
                                )}
                            </div>

                            <div className="pt-4 border-t border-slate-800/60 flex justify-end">
                                <button 
                                    onClick={() => setShowManageModal(false)} 
                                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    {t("common", "close", "Schließen")}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Bulk Edit Modal */}
                {showBulkModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBulkModal(false)} className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-2xl p-6 md:p-10 shadow-2xl">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">BULK EDIT</h2>
                                    <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest">{selectedCells.size} Einträge ausgewählt</p>
                                </div>
                                <button onClick={() => setShowBulkModal(false)} className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("common", "status", "STATUS")}</label>
                                    <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none appearance-none cursor-pointer focus:border-blue-500/50">
                                        <option value="PRESENT" className="bg-slate-900">{t("common", "present", "Anwesend")}</option>
                                        <option value="ABSENT" className="bg-slate-900">{t("common", "absent", "Abwesend")}</option>
                                        <option value="VACATION" className="bg-slate-900">{t("common", "vacation", "Urlaub")}</option>
                                    </select>
                                </div>

                                {editStatus === 'PRESENT' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("common", "start", "VON")}</label>
                                            <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none focus:border-blue-500/50" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("common", "end", "BIS")}</label>
                                            <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none focus:border-blue-500/50" />
                                        </div>
                                    </div>
                                )}

                                {editStatus === 'PRESENT' && (
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t("attendance", "unpaidBreak", "UNBEZAHLTE PAUSE (H)")}</label>
                                        <select value={editBreak} onChange={e => setEditBreak(Number(e.target.value))} className="w-full bg-black/40 border border-slate-700/50 rounded-xl px-5 py-3.5 text-xs font-bold text-white outline-none appearance-none cursor-pointer focus:border-blue-500/50">
                                            {[0, 0.5, 1.0].map(v => <option key={v} value={v} className="bg-slate-900">{v} h</option>)}
                                        </select>
                                    </div>
                                )}

                                <div className="flex gap-4 pt-6 border-t border-slate-800/50">
                                    <button onClick={() => setShowBulkModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                        {t("common", "cancel", "Abbrechen")}
                                    </button>
                                    <button onClick={handleBulkSave} disabled={isSaving} className="flex-1 bg-blue-500 hover:bg-blue-400 text-slate-950 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all">
                                        {isSaving ? "..." : "SPEICHERN"}
                                    </button>
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

function EmployeeRow({
    emp,
    onUpdate,
    onDelete,
    onPhotoUpload,
    isUploading
}: {
    emp: Worker;
    onUpdate: (id: string, name: string, active: boolean) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onPhotoUpload: (id: string, isProfile: boolean, file: File) => Promise<void>;
    isUploading: boolean;
}) {
    const [name, setName] = useState(emp.full_name);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const isActive = emp.is_active !== false;

    const handleSaveName = async () => {
        if (!name.trim() || name.trim() === emp.full_name) {
            setIsEditing(false);
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(emp.id, name.trim(), isActive);
            setIsEditing(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async () => {
        await onUpdate(emp.id, emp.full_name, !isActive);
    };

    return (
        <div className="flex items-center justify-between gap-3 p-3 bg-black/40 border border-slate-800 rounded-xl hover:border-slate-700/80 transition-all">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-10 h-10 rounded-full bg-slate-800 border border-slate-700/60 overflow-hidden cursor-pointer shrink-0 group flex items-center justify-center"
                    title="Foto ändern"
                >
                    {emp.photo_url ? (
                        <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-xs font-black text-slate-300">{emp.full_name?.[0] || "?"}</span>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="w-4 h-4 text-white" />
                    </div>
                </div>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhotoUpload(emp.id, emp.type === 'PROFILE', file);
                    }} 
                />

                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="flex items-center gap-2">
                            <input 
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') { setName(emp.full_name); setIsEditing(false); }
                                }}
                                autoFocus
                                className="w-full bg-slate-900 border border-blue-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none"
                            />
                            <button 
                                onClick={handleSaveName}
                                disabled={isSaving}
                                className="p-1.5 bg-blue-500 text-slate-950 rounded-lg hover:bg-blue-400 transition-colors"
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>
                            <button 
                                onClick={() => { setName(emp.full_name); setIsEditing(false); }}
                                className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group/name">
                            <span className="text-xs font-bold text-white truncate">{emp.full_name}</span>
                            <button 
                                onClick={() => setIsEditing(true)}
                                className="opacity-0 group-hover/name:opacity-100 text-[10px] text-slate-500 hover:text-blue-400 transition-all"
                            >
                                ✏️
                            </button>
                        </div>
                    )}
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        {emp.type === 'PROFILE' ? 'Benutzerkonto' : 'Mitarbeiter'}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={handleToggleActive}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        isActive 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20" 
                            : "bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:bg-slate-800"
                    }`}
                >
                    {isActive ? "Aktiv" : "Inaktiv"}
                </button>

                {emp.type !== 'PROFILE' && (
                    <button
                        onClick={() => onDelete(emp.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all"
                        title="Löschen"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
