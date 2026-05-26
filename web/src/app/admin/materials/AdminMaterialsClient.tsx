"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken, apiDelete, apiPut } from "@/lib/apiClient";
import { motion, AnimatePresence } from "framer-motion";

const LAST_CATEGORY_KEY = "adminMaterials_lastCategory";

interface Material {
    id: string;
    name: string;
    display_name?: string | null;
    unit: string;
    category?: string | null;
    article_number?: string | null;
    is_favorite?: boolean;
}

interface MaterialCategory {
    id: string;
    name: string;
}

export default function AdminMaterialsClient() {
    const router = useRouter();
    const { t } = useLanguage();

    const [materials, setMaterials] = useState<Material[]>([]);
    const [categories, setCategories] = useState<MaterialCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const itemsPerPage = 200;

    // Form state
    const [name, setName] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [unit, setUnit] = useState("st.");
    const [category, setCategory] = useState("");
    const [articleNumber, setArticleNumber] = useState("");
    const [newCategoryName, setNewCategoryName] = useState("");
    const categoryInitialized = useRef(false);

    // Edit state (materials)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editDisplayName, setEditDisplayName] = useState("");
    const [editUnit, setEditUnit] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editArticleNumber, setEditArticleNumber] = useState("");

    // Edit state (categories)
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState("");

    useEffect(() => { setCurrentPage(1); }, [searchTerm]);

    useEffect(() => {
        const timer = setTimeout(() => { loadMaterials(searchTerm, currentPage); }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, currentPage]);

    useEffect(() => {
        if (!categoryInitialized.current && categories.length > 0) {
            categoryInitialized.current = true;
            const saved = localStorage.getItem(LAST_CATEGORY_KEY) ?? "";
            setCategory(saved);
        }
    }, [categories]);

    async function loadMaterials(search?: string, page: number = 1) {
        try {
            if (search !== undefined) setIsSearching(true);
            const token = await getToken();
            if (!token) { router.replace("/auth/login"); return; }
            let url = `/api/materials?page=${page}&limit=${itemsPerPage}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            const response = (await apiGet(url, token)) as any;
            if (response && typeof response === 'object' && 'items' in response) {
                setMaterials(response.items as Material[]);
                setTotalResults(response.total !== undefined ? response.total : (response.items as any[]).length);
            } else {
                const mats = Array.isArray(response) ? response : (response?.data || []);
                setMaterials(mats as Material[]);
                setTotalResults(mats.length);
            }
            const cats: MaterialCategory[] = await apiGet("/api/material-categories", token);
            setCategories(cats);
        } catch (err: any) {
            setError("Błąd ładowania: " + err.message);
        } finally { setIsLoading(false); setIsSearching(false); }
    }

    const totalPages = Math.ceil(totalResults / itemsPerPage);

    async function handleAddMaterial(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !unit.trim()) { setError(t("common", "error", "Błąd") + ": Nazwa i jednostka są wymagane"); return; }
        setIsSubmitting(true); setError(null); setSuccess(null);
        try {
            const token = await getToken();
            const newMaterialData = await apiPost("/api/materials", {
                name: name.trim(), display_name: displayName.trim() || undefined,
                unit: unit.trim(), category: category.trim() || undefined, article_number: articleNumber.trim() || undefined
            }, token!);
            setMaterials(prev => [...prev, newMaterialData as Material].sort((a, b) => a.name.localeCompare(b.name)));
            setSuccess(t("adminMaterials", "addSuccess", "Dodano materiał pomyślnie."));
            setName(""); setDisplayName(""); setArticleNumber("");
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { setError(t("adminMaterials", "addError", "Błąd dodawania") + ": " + err.message); }
        finally { setIsSubmitting(false); }
    }

    async function handleDeleteMaterial(id: string) {
        if (!confirm(t("adminMaterials", "deleteConfirm", "Czy na pewno chcesz usunąć ten materiał?"))) return;
        setError(null); setSuccess(null);
        try {
            const token = await getToken();
            await apiDelete(`/api/materials?id=${id}`, token!);
            setMaterials(prev => prev.filter(m => m.id !== id));
            setSuccess(t("adminMaterials", "deleteSuccess", "Usunięto materiał pomyślnie."));
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { setError(t("adminMaterials", "deleteError", "Błąd usuwania") + ": " + err.message); }
    }

    async function toggleFavorite(m: Material) {
        try {
            const token = await getToken();
            await apiPut(`/api/materials`, {
                id: m.id, name: m.name, display_name: m.display_name, unit: m.unit, category: m.category, article_number: m.article_number, is_favorite: !m.is_favorite
            }, token!);
            setMaterials(prev => prev.map(mat => mat.id === m.id ? { ...mat, is_favorite: !m.is_favorite } : mat));
        } catch (err: any) { setError(t("adminMaterials", "editError", "Błąd aktualizacji") + ": " + err.message); }
    }

    function startEditing(m: Material) {
        setEditingId(m.id); setEditName(m.name); setEditDisplayName(m.display_name || "");
        setEditUnit(m.unit); setEditCategory(m.category || ""); setEditArticleNumber(m.article_number || "");
    }

    async function handleUpdateMaterial(id: string) {
        if (!editName.trim() || !editUnit.trim()) { setError(t("common", "error", "Błąd") + ": Nazwa i jednostka są wymagane"); return; }
        setError(null); setSuccess(null);
        try {
            const token = await getToken();
            const updatedMaterial = await apiPut(`/api/materials`, {
                id, name: editName.trim(), display_name: editDisplayName.trim() || null,
                unit: editUnit.trim(), category: editCategory.trim() || null, article_number: editArticleNumber.trim() || null,
                is_favorite: materials.find(m => m.id === id)?.is_favorite
            }, token!);
            setMaterials(prev => prev.map(m => m.id === id ? updatedMaterial as Material : m).sort((a, b) => a.name.localeCompare(b.name)));
            setSuccess(t("adminMaterials", "editSuccess", "Zaktualizowano materiał pomyślnie."));
            setEditingId(null); setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { setError(t("adminMaterials", "editError", "Błąd aktualizacji") + ": " + err.message); }
    }

    async function handleAddCategory(e: React.FormEvent) {
        e.preventDefault(); if (!newCategoryName.trim()) return;
        setIsSubmittingCategory(true); setError(null); setSuccess(null);
        try {
            const token = await getToken();
            const newCat = await apiPost("/api/material-categories", { name: newCategoryName.trim() }, token!);
            setCategories(prev => [...prev, newCat as MaterialCategory].sort((a, b) => a.name.localeCompare(b.name)));
            setSuccess(t("adminMaterials", "categoryAddSuccess", "Dodano kategorię pomyślnie."));
            setNewCategoryName(""); setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { setError(t("adminMaterials", "categoryAddError", "Błąd dodawania kategorii") + ": " + err.message); }
        finally { setIsSubmittingCategory(false); }
    }

    async function handleDeleteCategory(id: string) {
        if (!confirm(t("adminMaterials", "categoryDeleteConfirm", "Czy na pewno chcesz usunąć tę kategorię?"))) return;
        setError(null); setSuccess(null);
        try {
            const token = await getToken();
            await apiDelete(`/api/material-categories?id=${id}`, token!);
            setCategories(prev => prev.filter(c => c.id !== id));
            setCategory(""); localStorage.setItem(LAST_CATEGORY_KEY, "");
            setSuccess(t("adminMaterials", "deleteSuccess", "Usunięto pomyślnie."));
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { setError(t("adminMaterials", "categoryDeleteError", "Błąd usuwania") + ": " + err.message); }
    }

    async function handleRenameCategory(id: string) {
        const trimmed = editingCategoryName.trim(); if (!trimmed) return;
        setError(null); setSuccess(null);
        try {
            const token = await getToken();
            const updated = await apiPut("/api/material-categories", { id, name: trimmed }, token!);
            const updatedCat = updated as MaterialCategory;
            const oldCat = categories.find(c => c.id === id);
            const oldName = oldCat?.name ?? "";
            setCategories(prev => prev.map(c => c.id === id ? updatedCat : c).sort((a, b) => a.name.localeCompare(b.name)));
            setMaterials(prev => prev.map(m => m.category === oldName ? { ...m, category: updatedCat.name } : m));
            if (category === oldName) { setCategory(updatedCat.name); localStorage.setItem(LAST_CATEGORY_KEY, updatedCat.name); }
            setEditingCategoryId(null); setSuccess(t("adminMaterials", "categoryRenameSuccess", "Zmieniono nazwę kategorii pomyślnie."));
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) { setError(t("adminMaterials", "categoryRenameError", "Błąd zmiany nazwy kategorii") + ": " + err.message); }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#020617] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    const groupMaterials = (mats: Material[]) => {
        const grouped: Record<string, Material[]> = {};
        mats.forEach(m => {
            const cat = m.category || "Inne";
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(m);
        });
        return grouped;
    };

    const grouped = groupMaterials(materials);
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        if (a === "Inne") return 1;
        if (b === "Inne") return -1;
        return a.localeCompare(b);
    });

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

            <div className="relative z-10 container mx-auto px-6 py-12 max-w-[1600px]">
                {/* Header Card */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-10 lg:p-14 rounded-2xl shadow-2xl shadow-black/50">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase leading-none">
                            {t("adminMaterials", "title", "MATERIALMANAGEMENT")}
                        </h1>
                        <p className="text-slate-500 text-xs mt-4 uppercase font-bold tracking-[0.3em]">
                            {t("adminMaterials", "subtitle", "Dodawaj jednostki i nazwy materiałów do bazy")}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                        <div className="relative flex-1 sm:w-80">
                            <input
                                type="text"
                                placeholder={t("adminMaterials", "searchPlaceholder", "Material suchen...")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-12 py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                            />
                            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl text-red-400 text-xs font-bold uppercase tracking-widest mb-8 flex items-center gap-4 animate-pulse">
                        <span>⚠️</span> {error}
                    </div>
                )}
                {success && (
                    <div className="bg-green-500/10 border border-green-500/30 p-6 rounded-2xl text-green-400 text-xs font-bold uppercase tracking-widest mb-8 flex items-center gap-4">
                        <span>✅</span> {success}
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    {/* Left Sidebar: Controls & Add Form */}
                    <div className="xl:col-span-4 space-y-8">
                        
                        {/* Add Material Form */}
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-10 space-y-8 shadow-2xl"
                        >
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/80 mb-2">{t("adminMaterials", "addMaterialTitle", "MATERIAL HINZUFÜGEN")}</h2>
                            
                            <form onSubmit={handleAddMaterial} className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("adminMaterials", "materialNameLabel", "NAZWA HURTOWA *")}</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder={t("adminMaterials", "materialNamePlaceholder", "Np. Płyta GK")}
                                        className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                                        required
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("adminMaterials", "displayNameLabel", "NAZWA DLA PRACOWNIKA")}</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={e => setDisplayName(e.target.value)}
                                        placeholder={t("adminMaterials", "displayNamePlaceholder", "Np. Płyta")}
                                        className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("adminMaterials", "unitLabel", "EINHEIT *")}</label>
                                        <input
                                            type="text"
                                            value={unit}
                                            onChange={e => setUnit(e.target.value)}
                                            placeholder="st."
                                            className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("adminMaterials", "articleNumberLabel", "ART. NR")}</label>
                                        <input
                                            type="text"
                                            value={articleNumber}
                                            onChange={e => setArticleNumber(e.target.value)}
                                            placeholder="123456"
                                            className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{t("adminMaterials", "categoryLabel", "KATEGORIE")}</label>
                                    <div className="relative">
                                        <select
                                            value={category}
                                            onChange={e => { setCategory(e.target.value); localStorage.setItem(LAST_CATEGORY_KEY, e.target.value); }}
                                            className="w-full bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none appearance-none cursor-pointer focus:border-blue-500/50 transition-all"
                                        >
                                            <option value="" className="bg-slate-900">
                                                {t("adminMaterials", "noCategory", "-- KEINE KATEGORIE --")}
                                            </option>
                                            {categories.map(c => <option key={c.id} value={c.name} className="bg-slate-900">{c.name}</option>)}
                                        </select>
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-blue-500 text-slate-950 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? "..." : t("adminMaterials", "addBtn", "MATERIAL HINZUFÜGEN")}
                                </button>
                            </form>
                        </motion.div>

                        {/* Category Manager */}
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl p-10 space-y-8 shadow-2xl"
                        >
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500/80 mb-2">{t("adminMaterials", "manageCategories", "KATEGORIEN VERWALTEN")}</h2>
                            
                            <form onSubmit={handleAddCategory} className="flex gap-4">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    placeholder={t("adminMaterials", "newCategoryPlaceholder", "Neue Kategorie...")}
                                    className="flex-1 bg-black/40 border border-slate-700/50 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-cyan-500/50 transition-all"
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={isSubmittingCategory}
                                    className="bg-cyan-500 text-slate-950 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.05] transition-all disabled:opacity-50"
                                >
                                    {isSubmittingCategory ? "..." : "＋"}
                                </button>
                            </form>

                            <div className="flex flex-wrap gap-3">
                                <AnimatePresence>
                                    {categories.map(c => (
                                        <motion.div 
                                            key={c.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className="group flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 px-5 py-3 rounded-2xl hover:border-cyan-500/30 transition-all shadow-lg"
                                        >
                                            {editingCategoryId === c.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        autoFocus
                                                        value={editingCategoryName}
                                                        onChange={e => setEditingCategoryName(e.target.value)}
                                                        className="bg-transparent border-none text-[10px] font-black text-white outline-none w-24"
                                                    />
                                                    <button onClick={() => handleRenameCategory(c.id)} className="text-green-500 hover:scale-110 transition-transform">✓</button>
                                                    <button onClick={() => setEditingCategoryId(null)} className="text-slate-500 hover:scale-110 transition-transform">✕</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-tight">{c.name}</span>
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); }} className="text-blue-500/70 hover:text-blue-400">✏️</button>
                                                        <button onClick={() => handleDeleteCategory(c.id)} className="text-red-500/70 hover:text-red-400">🗑️</button>
                                                    </div>
                                                </>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Side: Materials List */}
                    <div className="xl:col-span-8 space-y-10">
                        {sortedCategories.map(cat => (
                            <motion.div 
                                key={cat}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 rounded-2xl overflow-hidden shadow-2xl"
                            >
                                <div className="px-10 py-8 bg-white/[0.02] border-b border-slate-800/50 flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-8 bg-blue-500 rounded-full" />
                                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">{cat}</h2>
                                    </div>
                                    <span className="px-4 py-1 rounded-full bg-slate-800 text-slate-500 text-[10px] font-black">{grouped[cat].length}</span>
                                </div>

                                <div className="overflow-x-auto no-scrollbar">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-black/20 text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                                <th className="px-10 py-6">{t("adminMaterials", "colDisplayName", "NAZWA WŁASNA")}</th>
                                                <th className="px-10 py-6">{t("adminMaterials", "colName", "NAZWA HURTOWA")}</th>
                                                <th className="px-10 py-6 text-center">{t("adminMaterials", "colArticleNumber", "ART. NR")}</th>
                                                <th className="px-10 py-6 text-center">{t("adminMaterials", "colUnit", "EINHEIT")}</th>
                                                <th className="px-10 py-6 text-center">FAV</th>
                                                <th className="px-10 py-6 text-right">AKTION</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/30">
                                            {grouped[cat].map(m => (
                                                <motion.tr 
                                                    key={m.id} 
                                                    layout
                                                    className="group hover:bg-white/[0.01] transition-colors"
                                                >
                                                    {editingId === m.id ? (
                                                        <td colSpan={6} className="px-10 py-8 bg-blue-500/5">
                                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                                                                <div className="space-y-2">
                                                                    <label className="text-[8px] font-black text-slate-500 uppercase">EIGENER NAME</label>
                                                                    <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} className="w-full bg-black/60 border border-blue-500/30 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none" />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <label className="text-[8px] font-black text-slate-500 uppercase">GROSSHANDEL (READONLY)</label>
                                                                    <input value={editName} readOnly className="w-full bg-black/20 border border-slate-800 rounded-xl px-4 py-3 text-[11px] font-bold text-slate-500 outline-none cursor-not-allowed" />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <label className="text-[8px] font-black text-slate-500 uppercase">ART. NR</label>
                                                                    <input value={editArticleNumber} onChange={e => setEditArticleNumber(e.target.value)} className="w-full bg-black/60 border border-blue-500/30 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none" />
                                                                </div>
                                                                <div className="flex gap-2 h-[46px]">
                                                                    <button onClick={() => handleUpdateMaterial(m.id)} className="flex-1 bg-green-500 text-slate-950 rounded-xl font-black text-[10px] uppercase">SAVE</button>
                                                                    <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-800 text-slate-400 rounded-xl font-black text-[10px] uppercase">✕</button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    ) : (
                                                        <>
                                                            <td className="px-10 py-6">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-white uppercase tracking-tight">{m.display_name || "—"}</span>
                                                                    <button onClick={() => startEditing(m)} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500/60 hover:text-blue-400 text-xs">✏️</button>
                                                                </div>
                                                            </td>
                                                            <td className="px-10 py-6">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{m.name}</span>
                                                            </td>
                                                            <td className="px-10 py-6 text-center">
                                                                {m.article_number ? (
                                                                    <span className="px-3 py-1 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-mono font-bold border border-red-500/20">{m.article_number}</span>
                                                                ) : <span className="text-slate-800">—</span>}
                                                            </td>
                                                            <td className="px-10 py-6 text-center font-black text-[10px] text-slate-400">{m.unit}</td>
                                                            <td className="px-10 py-6 text-center">
                                                                <button onClick={() => toggleFavorite(m)} className={`text-xl transition-all ${m.is_favorite ? "text-amber-500 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" : "text-slate-800 hover:text-slate-600"}`}>
                                                                    {m.is_favorite ? "★" : "☆"}
                                                                </button>
                                                            </td>
                                                            <td className="px-10 py-6 text-right">
                                                                <button onClick={() => handleDeleteMaterial(m.id)} className="p-3 bg-red-500/10 text-red-500/70 rounded-xl hover:bg-red-500 hover:text-white border border-red-500/20 transition-all opacity-0 group-hover:opacity-100">
                                                                    🗑️
                                                                </button>
                                                            </td>
                                                        </>
                                                    )}
                                                </motion.tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        ))}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-3 mt-12 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/30 p-6 rounded-2xl w-fit mx-auto shadow-2xl">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-4 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    ◀
                                </button>
                                <div className="flex gap-2">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages).map((p, idx, arr) => (
                                        <div key={p} className="flex items-center gap-2">
                                            {idx > 0 && arr[idx-1] !== p-1 && <span className="text-slate-700 font-black">...</span>}
                                            <button
                                                onClick={() => setCurrentPage(p)}
                                                className={`w-12 h-12 rounded-xl text-[10px] font-black transition-all ${
                                                    p === currentPage 
                                                    ? "bg-blue-500 text-slate-950 shadow-lg shadow-blue-500/30" 
                                                    : "bg-slate-800/50 text-slate-500 hover:text-white"
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-4 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    ▶
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Custom Scrollbar Styling */}
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </motion.div>
    );
}
