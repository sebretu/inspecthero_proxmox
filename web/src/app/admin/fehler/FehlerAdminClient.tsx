"use client";
import { useState, useEffect, useCallback } from "react";
import { apiGet, getToken } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";
import PhotoLightbox from "@/components/PhotoLightbox";
import { FehlerModal } from "@/components/FehlerModal";
import { motion, AnimatePresence } from "framer-motion";

const PlanSnippet = dynamic(() => import("@/components/PlanSnippet"), { ssr: false });

const STATUS_COLORS: Record<string, string> = {
    OPEN: "#64748b", IN_PROGRESS: "#3b82f6", DONE_WAITING_APPROVAL: "#f59e0b", APPROVED: "#22c55e", REJECTED: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
    OPEN: "OFFEN", IN_PROGRESS: "IN BEARBEITUNG", DONE_WAITING_APPROVAL: "ZUR GENEHMIGUNG", APPROVED: "GENEHMIGT", REJECTED: "ABGELEHNT",
};

type FehlerPhoto = { id: string; url: string; photo_type: string; created_at: string };
type FehlerProfile = { id: string; full_name: string } | null;
type Fehler = {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    plan_id: string | null;
    x_norm: number | null;
    y_norm: number | null;
    priority: string;
    status: string;
    assigned_user_id: string | null;
    created_at: string;
    fehler_photos: FehlerPhoto[];
    profiles?: FehlerProfile;
};

const PRIORITY_COLORS: Record<string, string> = {
    LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444", CRITICAL: "#7c3aed",
};

export default function FehlerAdminClient() {
    const { t } = useLanguage();
    const [fehlerList, setFehlerList] = useState<Fehler[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [filterUser, setFilterUser] = useState("");
    const [filterPriority, setFilterPriority] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [editItem, setEditItem] = useState<Fehler | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const loadFehler = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await apiGet<Fehler[]>("/api/fehler?limit=100");
            setFehlerList(Array.isArray(data) ? data : []);
        } catch (e: any) { setError(e.message || "Failed to load"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadFehler(); }, [loadFehler]);

    useEffect(() => {
        window.addEventListener("fehler-created", loadFehler);
        return () => window.removeEventListener("fehler-created", loadFehler);
    }, [loadFehler]);

    useEffect(() => {
        apiGet<{ id: string }>("/api/me").then((me: any) => setCurrentUserId(me?.id ?? null)).catch(() => { });
    }, []);

    async function handleDelete(id: string) {
        if (!confirm(t("fehler", "deleteConfirm", "Delete this error?"))) return;
        setDeleting(id);
        try {
            const token = await getToken();
            const resp = await fetch(`/api/fehler?id=${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error?.message || "Failed to delete");
            setFehlerList((prev) => prev.filter((f) => f.id !== id));
        } catch (e: any) { alert(e.message); }
        finally { setDeleting(null); }
    }

    const uniqueUsers = Array.from(new Set(fehlerList.filter((f) => f.profiles?.full_name).map((f) => f.profiles!.full_name)));

    const filtered = fehlerList.filter((f) => {
        if (filterUser && f.profiles?.full_name !== filterUser) return false;
        if (filterPriority && f.priority !== filterPriority) return false;
        if (filterStatus && f.status !== filterStatus) return false;
        return true;
    });

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="min-h-screen bg-[#020617] text-slate-200 selection:bg-amber-500/30 overflow-x-hidden pb-20"
        >
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(#94a3b8 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
            </div>

            <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1600px]">
                {/* Header Card */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-10 lg:p-14 rounded-2xl shadow-2xl">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/20">⚠️</div>
                        <div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase leading-none">
                                {t("fehler", "adminTitle", "ERRORMANAGEMENT")}
                            </h1>
                            <p className="text-slate-500 text-xs mt-4 uppercase font-bold tracking-[0.3em]">
                                {t("fehler", "adminSubtitle", "LISTE ALLER GEMELDETEN SYSTEMFEHLER")}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                        <select className="bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white outline-none appearance-none cursor-pointer" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                            <option value="" className="bg-slate-900">{t("home", "filterUser", "ALLE BENUTZER")}</option>
                            {uniqueUsers.map(u => <option key={u} value={u!} className="bg-slate-900">{u!.toUpperCase()}</option>)}
                        </select>
                        <select className="bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white outline-none appearance-none cursor-pointer" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                            <option value="" className="bg-slate-900">{t("home", "filterPriority", "ALLE PRIORITÄTEN")}</option>
                            <option value="LOW" className="bg-slate-900">{t("taskPriority", "LOW", "LOW").toUpperCase()}</option>
                            <option value="MEDIUM" className="bg-slate-900">{t("taskPriority", "MEDIUM", "MEDIUM").toUpperCase()}</option>
                            <option value="HIGH" className="bg-slate-900">{t("taskPriority", "HIGH", "HIGH").toUpperCase()}</option>
                            <option value="CRITICAL" className="bg-slate-900">{t("taskPriority", "CRITICAL", "CRITICAL").toUpperCase()}</option>
                        </select>
                        <select className="bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white outline-none appearance-none cursor-pointer" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <option value="" className="bg-slate-900">{t("taskStatus", "ALL", "ALLE STATUS").toUpperCase()}</option>
                            {Object.entries(STATUS_LABELS).map(([val, label]) => <option key={val} value={val} className="bg-slate-900">{t("taskStatus", val, label).toUpperCase()}</option>)}
                        </select>
                    </div>
                </div>

                {loading && (
                    <div className="py-40 text-center flex flex-col items-center gap-6">
                        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-black uppercase tracking-[0.5em] animate-pulse">{t("common", "loading", "LADEN...")}</p>
                    </div>
                )}

                {error && <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-2xl text-red-400 font-bold mb-12">{error}</div>}

                {/* Grid of Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <AnimatePresence>
                        {filtered.map((f, idx) => (
                            <motion.div 
                                key={f.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group relative bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-8 md:p-10 shadow-xl hover:shadow-2xl hover:border-amber-500/30 transition-all duration-500 flex flex-col gap-8"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-grow">
                                    {/* Media Section: Map Thumbnail */}
                                    <div className="relative aspect-square md:aspect-auto md:h-full min-h-[220px] rounded-2xl overflow-hidden bg-black/40 border border-white/5 shadow-inner">
                                        {f.plan_id ? (
                                            <PlanSnippet planId={f.plan_id} itemId={f.id} x_norm={f.x_norm || 0.5} y_norm={f.y_norm || 0.5} type="FEHLER" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-700">
                                                <span className="text-4xl opacity-20">🗺️</span>
                                                <span className="text-[8px] font-black uppercase tracking-widest">{t("home", "noPlan", "NO PLAN DATA")}</span>
                                            </div>
                                        )}
                                        <div 
                                            className="absolute top-4 left-4 px-4 py-1.5 rounded-full text-slate-950 text-[9px] font-black uppercase tracking-widest z-10 shadow-lg"
                                            style={{ background: PRIORITY_COLORS[f.priority] || "#fff" }}
                                        >
                                            {t("taskPriority", f.priority, f.priority).toUpperCase()}
                                        </div>
                                    </div>

                                    {/* Text Section */}
                                    <div className="flex flex-col gap-6">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[9px] font-black tracking-[0.2em] text-amber-400/80 uppercase">FEHLER #{f.id.slice(0, 8)}</span>
                                                    <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-white border border-white/10" style={{ background: STATUS_COLORS[f.status] || "#6b7280" }}>
                                                        {t("taskStatus", f.status, STATUS_LABELS[f.status] || f.status).toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                            <h3 className="text-2xl font-black leading-tight text-white tracking-tighter group-hover:text-amber-400 transition-colors uppercase">
                                                {f.title}
                                            </h3>
                                            <p className="text-[13px] text-slate-400 leading-relaxed line-clamp-4 font-medium italic">
                                                {f.description || t("home", "noDescription", "No description provided.")}
                                            </p>
                                        </div>

                                        {/* Photos Grid */}
                                        <div className="mt-auto space-y-4 pt-6 border-t border-slate-800/50">
                                            {f.fehler_photos.length > 0 && (
                                                <div className="grid grid-cols-4 gap-2">
                                                    {f.fehler_photos.map(p => (
                                                        <motion.div 
                                                            key={p.id} 
                                                            whileHover={{ scale: 1.05 }}
                                                            className="aspect-square rounded-xl overflow-hidden border border-white/5 hover:border-amber-500/50 transition-all cursor-zoom-in shadow-lg"
                                                            onClick={() => setPreviewUrl(p.url)}
                                                        >
                                                            <img src={p.url} alt="photo" className="w-full h-full object-cover" />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between pt-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] text-slate-500 uppercase tracking-widest font-black opacity-50">{t("taskDrawer", "assignedUser", "SUBMITTER")}</span>
                                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-tight">{f.profiles?.full_name || "UNKNOWN"}</span>
                                                </div>
                                                <div className="text-[9px] text-slate-500 font-black bg-black/40 px-4 py-1.5 rounded-full uppercase tracking-[0.2em]">
                                                    {new Date(f.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={() => { setEditItem(f); setIsModalOpen(true); }}
                                        className="px-6 py-3 rounded-2xl bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-amber-500 hover:text-slate-950 transition-all border border-amber-500/20"
                                    >
                                        {t("common", "edit", "EDIT")}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(f.id)}
                                        disabled={deleting === f.id}
                                        className="px-6 py-3 rounded-2xl bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all border border-red-500/20 disabled:opacity-30"
                                    >
                                        {deleting === f.id ? "..." : t("common", "delete", "DELETE")}
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {!loading && filtered.length === 0 && (
                    <div className="py-40 text-center bg-slate-900/20 rounded-2xl border border-slate-800/50">
                        <p className="text-slate-700 font-black tracking-[0.3em] uppercase text-sm">{t("common", "noData", "NO ERRORS FOUND")}</p>
                    </div>
                )}
            </div>

            <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
            <FehlerModal
                open={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditItem(null); }}
                onSaved={loadFehler}
                editItem={editItem}
                currentUserId={currentUserId}
                currentUserRole="ADMIN"
            />
        </motion.div>
    );
}
