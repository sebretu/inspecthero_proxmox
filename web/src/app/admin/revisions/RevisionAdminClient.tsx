"use client";
import { useState, useEffect, useCallback } from "react";
import { apiDelete, apiGet, getToken } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";
import PhotoLightbox from "@/components/PhotoLightbox";
import { RevisionModal } from "@/components/RevisionModal";
import { motion, AnimatePresence } from "framer-motion";

const PlanSnippet = dynamic(() => import("@/components/PlanSnippet"), { ssr: false });

type RevisionPhoto = {
    id: string;
    url: string;
    created_at: string;
};

type Revision = {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    plan_id: string | null;
    x_norm: number | null;
    y_norm: number | null;
    created_at: string;
    revision_photos: RevisionPhoto[];
};

export default function RevisionAdminClient() {
    const { t } = useLanguage();
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [editItem, setEditItem] = useState<Revision | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const loadRevisions = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await apiGet<Revision[]>("/api/revisions?limit=100");
            setRevisions(Array.isArray(data) ? data : []);
        } catch (e: any) { setError(e.message || "Failed to load revisions"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadRevisions(); }, [loadRevisions]);

    useEffect(() => {
        window.addEventListener("revision-created", loadRevisions);
        return () => window.removeEventListener("revision-created", loadRevisions);
    }, [loadRevisions]);

    async function handleDelete(id: string) {
        if (!confirm(t("revision", "deleteConfirm", "Delete this revision?"))) return;
        setDeleting(id);
        try {
            await apiDelete(`/api/revisions?id=${id}`);
            setRevisions((prev) => prev.filter((r) => r.id !== id));
        } catch (e: any) { alert(e.message); }
        finally { setDeleting(null); }
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="min-h-screen bg-[#020617] text-slate-200 selection:bg-purple-500/30 overflow-x-hidden pb-20"
        >
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(#94a3b8 1px, transparent 0)", backgroundSize: "40px 40px" }}></div>
            </div>

            <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1600px]">
                {/* Header Card */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-10 lg:p-14 rounded-2xl shadow-2xl">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-3xl shadow-lg shadow-indigo-500/20">📋</div>
                        <div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase leading-none">
                                {t("revision", "adminTitle", "REVISIONS")}
                            </h1>
                            <p className="text-slate-500 text-xs mt-4 uppercase font-bold tracking-[0.3em]">
                                {t("revision", "adminSubtitle", "LISTE ALLER GEMELDETEN POPRAWKI")}
                            </p>
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="py-40 text-center flex flex-col items-center gap-6">
                        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-black uppercase tracking-[0.5em] animate-pulse">{t("common", "loading", "LADEN...")}</p>
                    </div>
                )}

                {error && <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-2xl text-red-400 font-bold mb-12">{error}</div>}

                {/* Grid of Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <AnimatePresence>
                        {revisions.map((r, idx) => (
                            <motion.div 
                                key={r.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group relative bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-8 md:p-10 shadow-xl hover:shadow-2xl hover:border-purple-500/30 transition-all duration-500 flex flex-col gap-8"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-grow">
                                    {/* Media Section: Map Thumbnail */}
                                    <div className="relative aspect-square md:aspect-auto md:h-full min-h-[220px] rounded-2xl overflow-hidden bg-black/40 border border-white/5 shadow-inner">
                                        {r.plan_id ? (
                                            <PlanSnippet planId={r.plan_id} itemId={r.id} x_norm={r.x_norm || 0.5} y_norm={r.y_norm || 0.5} type="REVISION" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-700">
                                                <span className="text-4xl opacity-20">🗺️</span>
                                                <span className="text-[8px] font-black uppercase tracking-widest">{t("home", "noPlan", "NO PLAN DATA")}</span>
                                            </div>
                                        )}
                                        <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-purple-500 text-slate-950 text-[9px] font-black uppercase tracking-widest z-10 shadow-lg">
                                            REVISION
                                        </div>
                                    </div>

                                    {/* Text Section */}
                                    <div className="flex flex-col gap-6">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-black tracking-[0.2em] text-purple-400/80 uppercase">ID: {r.id.slice(0, 8)}</span>
                                            </div>
                                            <h3 className="text-2xl font-black leading-tight text-white tracking-tighter group-hover:text-purple-400 transition-colors uppercase">
                                                {r.title}
                                            </h3>
                                            <p className="text-[13px] text-slate-400 leading-relaxed line-clamp-4 font-medium italic">
                                                {r.description || t("home", "noDescription", "No description provided.")}
                                            </p>
                                        </div>

                                        {/* Photos Grid */}
                                        <div className="mt-auto space-y-4 pt-6 border-t border-slate-800/50">
                                            {r.revision_photos.length > 0 && (
                                                <div className="grid grid-cols-4 gap-2">
                                                    {r.revision_photos.map(p => (
                                                        <motion.div 
                                                            key={p.id} 
                                                            whileHover={{ scale: 1.05 }}
                                                            className="aspect-square rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 transition-all cursor-zoom-in shadow-lg"
                                                            onClick={() => setPreviewUrl(p.url)}
                                                        >
                                                            <img src={p.url} alt="photo" className="w-full h-full object-cover" />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between pt-2">
                                                <div className="text-[9px] text-slate-500 font-black bg-black/40 px-4 py-1.5 rounded-full uppercase tracking-[0.2em]">
                                                    {new Date(r.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={() => { setEditItem(r); setIsModalOpen(true); }}
                                        className="px-6 py-3 rounded-2xl bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-purple-500 hover:text-slate-950 transition-all border border-purple-500/20"
                                    >
                                        {t("common", "edit", "EDIT")}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(r.id)}
                                        disabled={deleting === r.id}
                                        className="px-6 py-3 rounded-2xl bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all border border-red-500/20 disabled:opacity-30"
                                    >
                                        {deleting === r.id ? "..." : t("common", "delete", "DELETE")}
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {!loading && revisions.length === 0 && (
                    <div className="py-40 text-center bg-slate-900/20 rounded-2xl border border-slate-800/50">
                        <p className="text-slate-700 font-black tracking-[0.3em] uppercase text-sm">{t("common", "noData", "NO REVISIONS FOUND")}</p>
                    </div>
                )}
            </div>

            <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
            <RevisionModal open={isModalOpen} onClose={() => { setIsModalOpen(false); setEditItem(null); }} onSaved={loadRevisions} editItem={editItem} />
        </motion.div>
    );
}
