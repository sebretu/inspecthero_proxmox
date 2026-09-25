"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  BookOpen,
  Plus,
  Upload,
  Search,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FolderPlus,
  FileUp,
  Download,
  Copy,
  ArrowLeftRight,
  ShieldCheck,
  Zap,
  Info,
  X,
  History,
  Tag,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  Sparkles,
  FileText
} from "lucide-react";

interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
}

interface PrototypeSymbol {
  id: string;
  category: string;
  filename: string;
  storage_path: string;
  public_url: string;
  embedding?: number[] | null;
  embedding_version: string;
  embedding_status: "generated" | "pending" | "failed";
  image_size: number;
  dimensions: string;
  resolution: string;
  version: number;
  parent_id?: string | null;
  active: boolean;
  notes?: string | null;
  checksum?: string | null;
  created_at: string;
  updated_at: string;
  has_embedding?: boolean;
}

export default function PrototypeLibraryClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [prototypes, setPrototypes] = useState<PrototypeSymbol[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, { total: number; active: number }>>({});
  
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPrototype, setSelectedPrototype] = useState<PrototypeSymbol | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("all");
  
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Modal states
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);

  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceNotes, setReplaceNotes] = useState("");

  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Load Prototypes and Categories
  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("category", selectedCategory);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      if (filterActive !== "all") params.append("active", filterActive);

      const res = await fetch(`/api/admin/prototypes?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setCategories(data.categories || []);
        setPrototypes(data.prototypes || []);
        setCategoryCounts(data.category_counts || {});

        // Keep inspector selected prototype updated
        if (selectedPrototype) {
          const match = (data.prototypes || []).find((p: PrototypeSymbol) => p.id === selectedPrototype.id);
          if (match) setSelectedPrototype(match);
        } else if (data.prototypes && data.prototypes.length > 0) {
          setSelectedPrototype(data.prototypes[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch prototype library:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [selectedCategory, searchQuery, filterActive]);

  // Handle Bulk / Single File Upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setWarnings([]);

    const formData = new FormData();
    formData.append("category", selectedCategory === "all" ? "socket" : selectedCategory);
    
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/admin/prototypes/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        if (data.warnings && data.warnings.length > 0) {
          setWarnings(data.warnings);
        }
        await fetchLibrary();
      } else {
        alert(`Błąd wgrywania: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Wystąpił błąd: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Add Category
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await fetch("/api/admin/prototypes/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName, description: newCatDesc })
      });
      const data = await res.json();
      if (data.ok) {
        setNewCatName("");
        setNewCatDesc("");
        setIsAddCategoryOpen(false);
        await fetchLibrary();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Toggle Active Status
  const handleToggleActive = async (proto: PrototypeSymbol) => {
    try {
      const res = await fetch(`/api/admin/prototypes/${proto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !proto.active })
      });
      const data = await res.json();
      if (data.ok) {
        fetchLibrary();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete Prototype
  const handleDeletePrototype = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten prototyp z biblioteki wzorców?")) return;
    try {
      const res = await fetch(`/api/admin/prototypes/${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.ok) {
        if (selectedPrototype?.id === id) setSelectedPrototype(null);
        fetchLibrary();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Regenerate Embedding
  const handleRegenerateEmbedding = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/prototypes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_embedding" })
      });
      const data = await res.json();
      if (data.ok) {
        alert("Embedding został pomyślnie przeformułowany (generateImageEmbedding v1)!");
        fetchLibrary();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Replace Image (Version N+1)
  const handleReplaceImage = async () => {
    if (!replaceFile || !selectedPrototype) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", replaceFile);
    formData.append("notes", replaceNotes);

    try {
      const res = await fetch(`/api/admin/prototypes/${selectedPrototype.id}`, {
        method: "PUT",
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        setIsReplaceModalOpen(false);
        setReplaceFile(null);
        setReplaceNotes("");
        fetchLibrary();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Duplicate Prototype
  const handleDuplicate = async (proto: PrototypeSymbol) => {
    try {
      const res = await fetch(`/api/admin/prototypes/${proto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate" })
      });
      const data = await res.json();
      if (data.ok) {
        fetchLibrary();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Export Library JSON
  const handleExportLibrary = () => {
    window.open("/api/admin/prototypes/import-export", "_blank");
  };

  // Import Library JSON
  const handleImportLibrary = async () => {
    if (!importJson.trim()) return;
    try {
      const parsed = JSON.parse(importJson);
      const res = await fetch("/api/admin/prototypes/import-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Pomyślnie zaimportowano ${data.imported_count} wzorców!`);
        setIsImportExportOpen(false);
        setImportJson("");
        fetchLibrary();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(`Błąd formatu JSON: ${err.message}`);
    }
  };

  // Default default categories fallback
  const defaultCategoriesList = [
    { slug: "socket", name: "Socket" },
    { slug: "edv", name: "EDV" },
    { slug: "light", name: "Light" },
    { slug: "cee", name: "CEE" },
    { slug: "special", name: "Special" },
    { slug: "sym_socket", name: "Sym Socket" },
    { slug: "sym_cee16", name: "Sym CEE16" },
    { slug: "sym_cee32", name: "Sym CEE32" },
    { slug: "text", name: "Text" }
  ];

  const activeCategories = categories.length > 0 ? categories : defaultCategoriesList;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* ─── TOP HEADER ──────────────────────────────────────────────────────── */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Prototype Library Manager</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Manual Single Source of Truth
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Weryfikowana ręcznie baza wzorców symboli CAD. Produkcja porównuje rysunki wyłącznie z tymi prototypami.
              </p>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1 md:flex-none px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 transition-all"
            >
              <Upload className="h-4 w-4" />
              <span>{uploading ? "Wgrywanie..." : "+ Upload Prototype"}</span>
            </button>

            <button
              onClick={() => setIsImportExportOpen(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center space-x-1.5 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Import / Export</span>
            </button>

            <Link
              href="/admin/symbol-crops"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-lg border border-slate-800 flex items-center space-x-1.5 transition-all"
            >
              <History className="h-3.5 w-3.5" />
              <span>Cropy Historyczne (Legacy)</span>
            </Link>
          </div>
        </div>

        {/* Global Warnings Bar */}
        {warnings.length > 0 && (
          <div className="max-w-7xl mx-auto mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col space-y-1">
            <div className="font-semibold flex items-center space-x-1.5">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <span>Ostrzeżenia dotyczące wgrywanych plików:</span>
            </div>
            {warnings.map((w, idx) => (
              <div key={idx} className="pl-5">• {w}</div>
            ))}
          </div>
        )}
      </header>

      {/* ─── MAIN TRIPLE-PANEL LAYOUT ───────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ─── LEFT PANEL: CATEGORIES SIDEBAR (3 cols) ────────────────────── */}
        <aside className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-4 backdrop-blur-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <span>Kategorie Wzorców</span>
            </h2>
            <button
              onClick={() => setIsAddCategoryOpen(true)}
              className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Dodaj nową kategorię"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-250px)]">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                selectedCategory === "all"
                  ? "bg-gradient-to-r from-blue-600/30 to-cyan-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span>Wszystkieategorie</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px]">
                {prototypes.length}
              </span>
            </button>

            {activeCategories.map((cat) => {
              const counts = categoryCounts[cat.slug] || { total: 0, active: 0 };
              const isSelected = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.slug}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-blue-600/30 to-cyan-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Tag className={`h-3.5 w-3.5 ${isSelected ? "text-cyan-400" : "text-slate-500"}`} />
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center space-x-1 font-mono text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {counts.active}
                    </span>
                    <span className="text-slate-600">/</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {counts.total}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ─── CENTER PANEL: PROTOTYPES GRID & SEARCH (6 cols) ─────────────── */}
        <main className="lg:col-span-6 flex flex-col space-y-4">
          {/* Search and Filters Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 backdrop-blur-sm">
            <div className="relative w-full sm:w-64">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Szukaj wzorca / pliku..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Wszystkie statusy</option>
                <option value="true">Tylko aktywne (Retrieval)</option>
                <option value="false">Tylko nieaktywne</option>
              </select>

              <button
                onClick={() => fetchLibrary()}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Odśwież bibliotekę"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
              </button>
            </div>
          </div>

          {/* Drag & Drop Dropzone for Bulk Upload */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-cyan-500/50 bg-slate-900/30 hover:bg-slate-900/60 rounded-2xl p-4 text-center cursor-pointer transition-all flex items-center justify-center space-x-3 group"
          >
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileUp className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-200">
                Przeciągnij i upuść pliki wzorców (PNG, JPEG, WEBP, SVG)
              </p>
              <p className="text-[11px] text-slate-400">
                Pliki zostaną przypisane do kategorii: <strong className="text-cyan-400 uppercase">{selectedCategory}</strong>
              </p>
            </div>
          </div>

          {/* Prototypes Cards Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-2">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-500" />
              <p className="text-xs">Ładowanie prototypów z bazy...</p>
            </div>
          ) : prototypes.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl py-16 px-4 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
              <BookOpen className="h-10 w-10 text-slate-600" />
              <p className="text-sm font-semibold">Brak prototypów w tej kategorii</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Wgraj czysty wzorzec symbolu ręcznie za pomocą przycisku "+ Upload Prototype".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {prototypes.map((proto) => {
                const isSelected = selectedPrototype?.id === proto.id;
                return (
                  <div
                    key={proto.id}
                    onClick={() => setSelectedPrototype(proto)}
                    className={`bg-slate-900/80 border rounded-2xl p-3 flex flex-col justify-between cursor-pointer transition-all group relative overflow-hidden ${
                      isSelected
                        ? "border-cyan-500 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-500/10"
                        : "border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    {/* Status Badges Header */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 truncate">
                        {proto.category}
                      </span>
                      <div className="flex items-center space-x-1">
                        {proto.active ? (
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" title="Aktywny w retrieval" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-600" title="Wyłączony" />
                        )}
                        <span className="text-[10px] font-mono text-slate-400">v{proto.version}</span>
                      </div>
                    </div>

                    {/* Image Preview Box */}
                    <div className="h-28 w-full bg-slate-950/80 rounded-xl p-2 flex items-center justify-center relative overflow-hidden border border-slate-800/80 group-hover:border-slate-700">
                      {proto.public_url ? (
                        <img
                          src={proto.public_url}
                          alt={proto.filename}
                          className="max-h-full max-w-full object-contain filter drop-shadow-md group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <FileText className="h-8 w-8 text-slate-700" />
                      )}
                      
                      {/* Zoom Overlay Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPrototype(proto);
                          setIsPreviewModalOpen(true);
                        }}
                        className="absolute right-1.5 bottom-1.5 p-1 rounded-lg bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Powiększ wzorzec"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Metadata Footer */}
                    <div className="mt-2.5 space-y-1">
                      <p className="text-xs font-semibold text-slate-200 truncate" title={proto.filename}>
                        {proto.filename}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>{proto.dimensions || "256x256"}</span>
                        <span>{Math.round((proto.image_size || 0) / 1024)} KB</span>
                      </div>

                      {/* Embedding Status Badge */}
                      <div className="pt-1.5 flex items-center justify-between">
                        {proto.embedding_status === "generated" ? (
                          <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>768D Vector OK</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 flex items-center space-x-1">
                            <AlertCircle className="h-3 w-3" />
                            <span>Embedding Błąd</span>
                          </span>
                        )}

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActive(proto);
                            }}
                            className={`p-1 rounded text-[10px] ${proto.active ? "text-emerald-400 hover:bg-emerald-500/10" : "text-slate-500 hover:bg-slate-800"}`}
                            title={proto.active ? "Wyłącz z wyszukiwania" : "Włącz do wyszukiwania"}
                          >
                            <Zap className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePrototype(proto.id);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Usuń prototyp"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* ─── RIGHT PANEL: PROTOTYPE INSPECTOR & METADATA (3 cols) ──────────── */}
        <aside className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-4 backdrop-blur-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Info className="h-4 w-4 text-cyan-400" />
              <span>Inspektor Wzorca</span>
            </h2>
            {selectedPrototype && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-400">
                v{selectedPrototype.version}
              </span>
            )}
          </div>

          {selectedPrototype ? (
            <div className="space-y-4 text-xs">
              {/* Large Preview in Inspector */}
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 flex flex-col items-center justify-center relative group">
                {selectedPrototype.public_url ? (
                  <img
                    src={selectedPrototype.public_url}
                    alt={selectedPrototype.filename}
                    className="max-h-36 object-contain"
                  />
                ) : (
                  <FileText className="h-12 w-12 text-slate-700" />
                )}
                <button
                  onClick={() => setIsPreviewModalOpen(true)}
                  className="mt-2 text-[10px] text-cyan-400 hover:underline flex items-center space-x-1"
                >
                  <Eye className="h-3 w-3" />
                  <span>Powiększ i podgląd wektora</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIsReplaceModalOpen(true)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center space-x-1 transition-all"
                  title="Zastąp plik tworząc nową wersję N+1"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Nowa wersja</span>
                </button>

                <button
                  onClick={() => handleDuplicate(selectedPrototype)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center space-x-1 transition-all"
                  title="Duplikuj prototyp"
                >
                  <Copy className="h-3.5 w-3.5 text-blue-400" />
                  <span>Duplikuj</span>
                </button>
              </div>

              {/* Detailed Metadata Fields */}
              <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Kategoria:</span>
                  <span className="font-semibold text-cyan-300 uppercase">{selectedPrototype.category}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Nazwa pliku:</span>
                  <span className="font-semibold text-slate-200 truncate max-w-[140px]" title={selectedPrototype.filename}>
                    {selectedPrototype.filename}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Prototype ID:</span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                    {selectedPrototype.id}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Wymiary / Rozmiar:</span>
                  <span className="font-mono text-slate-200">
                    {selectedPrototype.dimensions} ({Math.round(selectedPrototype.image_size / 1024)} KB)
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Rozdzielczość:</span>
                  <span className="font-mono text-slate-300">{selectedPrototype.resolution}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Wersja embeddingu:</span>
                  <span className="font-mono text-emerald-400">{selectedPrototype.embedding_version} (768D)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Status w wyszukiwaniu:</span>
                  <button
                    onClick={() => handleToggleActive(selectedPrototype)}
                    className={`font-semibold ${selectedPrototype.active ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {selectedPrototype.active ? "AKTYWNY (Używany)" : "NIEAKTYWNY"}
                  </button>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Wgrano:</span>
                  <span className="text-slate-300">{new Date(selectedPrototype.created_at).toLocaleDateString()}</span>
                </div>
                {selectedPrototype.checksum && (
                  <div className="py-1">
                    <span className="text-slate-400 block mb-0.5">Checksum SHA-256:</span>
                    <span className="font-mono text-[9px] text-slate-500 break-all block bg-slate-900 p-1 rounded">
                      {selectedPrototype.checksum}
                    </span>
                  </div>
                )}
              </div>

              {/* Embedding Re-calculation */}
              <button
                onClick={() => handleRegenerateEmbedding(selectedPrototype.id)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 flex items-center justify-center space-x-1.5 transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
                <span>Przelicz Embedding (generateImageEmbedding)</span>
              </button>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <Info className="h-8 w-8 mx-auto text-slate-700" />
              <p className="text-xs">Wybierz wzorzec z listy, aby zobaczyć szczegóły.</p>
            </div>
          )}
        </aside>

      </div>

      {/* ─── MODAL 1: LARGE INTERACTIVE PREVIEW MODAL ───────────────────────── */}
      {isPreviewModalOpen && selectedPrototype && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedPrototype.filename}</h3>
                  <p className="text-[11px] text-slate-400">Kategoria: {selectedPrototype.category} | Version {selectedPrototype.version}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image Preview Canvas */}
              <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800 flex flex-col items-center justify-center relative overflow-hidden min-h-[300px]">
                <div
                  className="transition-transform duration-200 flex items-center justify-center"
                  style={{ transform: `scale(${previewZoom})` }}
                >
                  <img
                    src={selectedPrototype.public_url}
                    alt={selectedPrototype.filename}
                    className="max-h-72 object-contain"
                  />
                </div>

                {/* Zoom Controls */}
                <div className="absolute bottom-3 right-3 bg-slate-900/90 border border-slate-800 rounded-xl p-1 flex items-center space-x-1">
                  <button onClick={() => setPreviewZoom(Math.max(0.5, previewZoom - 0.25))} className="p-1 text-slate-300 hover:text-white">
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="text-[10px] font-mono text-cyan-400 px-1">{Math.round(previewZoom * 100)}%</span>
                  <button onClick={() => setPreviewZoom(Math.min(4, previewZoom + 0.25))} className="p-1 text-slate-300 hover:text-white">
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Vector & Technical Metadata Info */}
              <div className="space-y-3 text-xs">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5 font-mono text-[11px]">
                  <p className="text-cyan-400 font-bold">Wektor Wzorca 768D L2 Normalized:</p>
                  <p className="text-slate-400">Model: generateImageEmbedding() v1</p>
                  <p className="text-slate-400">Checksum: {selectedPrototype.checksum || "SHA-256 Computed"}</p>
                </div>

                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-slate-200">Zastosowanie w Systemie:</h4>
                  <p className="text-slate-400 text-[11px]">
                    Symbol ten jest wzorcem odniesienia. Podczas automatycznej detekcji na planach CAD,
                    wycięty crop zostaje bezpośrednio porównany z tym wektorem.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: ADD CATEGORY MODAL ────────────────────────────────────── */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <FolderPlus className="h-4 w-4 text-cyan-400" />
                <span>Dodaj Nową Kategorię Wzorców</span>
              </h3>
              <button onClick={() => setIsAddCategoryOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nazwa Kategorii (np. Socket, EDV):</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="np. Gniazdo_Specjalne"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Opis opcjonalny:</label>
                <textarea
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Opis symboli w tej kategorii..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsAddCategoryOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700"
              >
                Anuluj
              </button>
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20"
              >
                Zapisz Kategorię
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: REPLACE IMAGE (VERSION N+1) MODAL ─────────────────────── */}
      {isReplaceModalOpen && selectedPrototype && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <ArrowLeftRight className="h-4 w-4 text-cyan-400" />
                <span>Utwórz Nową Wersję Wzorca (v{selectedPrototype.version + 1})</span>
              </h3>
              <button onClick={() => setIsReplaceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-400">
                Wgranie nowego pliku utworzy nową wersję symbolu ({selectedPrototype.filename}). Poprzednia wersja zostanie zachowana w historii.
              </p>

              <div>
                <label className="block text-slate-400 mb-1">Wybierz nowy plik symbolu:</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notatka zmian:</label>
                <input
                  type="text"
                  value={replaceNotes}
                  onChange={(e) => setReplaceNotes(e.target.value)}
                  placeholder="np. Wyostrzone krawędzie symbolu"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsReplaceModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700"
              >
                Anuluj
              </button>
              <button
                onClick={handleReplaceImage}
                disabled={!replaceFile || uploading}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-50"
              >
                {uploading ? "Zapisywanie..." : "Zapisz Nową Wersję"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: IMPORT / EXPORT LIBRARY MODAL ─────────────────────────── */}
      {isImportExportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Download className="h-4 w-4 text-cyan-400" />
                <span>Import / Export Biblioteki Wzorców</span>
              </h3>
              <button onClick={() => setIsImportExportOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Download className="h-4 w-4 text-cyan-400" />
                  <span>Eksportuj Całą Bibliotekę</span>
                </h4>
                <p className="text-slate-400 text-[11px]">
                  Pobierz pełny pakiet JSON zawierający metadane oraz 768-wymiarowe wektory embeddingowe wszystkich zarejestrowanych wzorców.
                </p>
                <button
                  onClick={handleExportLibrary}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs flex items-center space-x-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Pobierz plik JSON (Export)</span>
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Upload className="h-4 w-4 text-blue-400" />
                  <span>Importuj Pakiet Wzorców</span>
                </h4>
                <p className="text-slate-400 text-[11px]">
                  Wklej zawartość pliku JSON z zapisaną biblioteką wzorców.
                </p>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder='Wklej kod JSON importu tutaj...'
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-[10px] text-slate-300"
                />
                <button
                  onClick={handleImportLibrary}
                  disabled={!importJson.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs flex items-center space-x-2 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Rozpocznij Import</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
