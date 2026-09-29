"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Search,
  Star,
  Check,
  Package,
  RotateCcw,
  Languages,
  Globe,
  Tag,
  Hash,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, getToken, getApiUrl } from "@/lib/apiClient";
import {
  PlanCatalogItem,
  PLAN_MATERIAL_CATEGORIES,
  DEFAULT_PLAN_MATERIALS_CATALOG,
  getLocalizedMaterialName,
  getLocalizedCategoryName,
  getLocalizedUnit,
} from "@/lib/planMaterialCatalog";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onMaterialUpdated?: () => void;
};

export default function MaterialCatalogModal({ isOpen, onClose, onMaterialUpdated }: Props) {
  const { t, language } = useLanguage();

  const [materials, setMaterials] = useState<PlanCatalogItem[]>(DEFAULT_PLAN_MATERIALS_CATALOG);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Edit / Create Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formCategory, setFormCategory] = useState("sockets");
  const [formNamePl, setFormNamePl] = useState("");
  const [formNameDe, setFormNameDe] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formNameSk, setFormNameSk] = useState("");
  const [formUnit, setFormUnit] = useState("szt");
  const [formArticleNumber, setFormArticleNumber] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIsFavorite, setFormIsFavorite] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch materials
  const loadMaterials = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<any>("/api/plan-materials/catalog");
      const items = Array.isArray(res) ? res : res?.items || res?.data || [];
      if (Array.isArray(items) && items.length > 0) {
        setMaterials(items);
      }
    } catch (e: any) {
      setError(e?.message || "Błąd pobierania katalogu materiałów");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMaterials();
      setIsFormOpen(false);
      setEditingId(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const openCreateForm = () => {
    setEditingId(null);
    setFormCategory(selectedCategory !== "ALL" ? selectedCategory : "sockets");
    setFormNamePl("");
    setFormNameDe("");
    setFormNameEn("");
    setFormNameSk("");
    setFormUnit("szt");
    setFormArticleNumber("");
    setFormNotes("");
    setFormIsFavorite(false);
    setError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (item: PlanCatalogItem) => {
    setEditingId(item.id);
    setFormCategory(item.category || "sockets");
    setFormNamePl(item.name_pl || "");
    setFormNameDe(item.name_de || "");
    setFormNameEn(item.name_en || "");
    setFormNameSk(item.name_sk || "");
    setFormUnit(item.unit || "szt");
    setFormArticleNumber(item.article_number || "");
    setFormNotes(item.notes || "");
    setFormIsFavorite(!!item.is_favorite);
    setError(null);
    setIsFormOpen(true);
  };

  const handleAutoFillLanguages = () => {
    const primary = formNamePl || formNameDe || formNameEn || formNameSk;
    if (!primary) return;
    if (!formNamePl) setFormNamePl(primary);
    if (!formNameDe) setFormNameDe(primary);
    if (!formNameEn) setFormNameEn(primary);
    if (!formNameSk) setFormNameSk(primary);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNamePl.trim() && !formNameDe.trim() && !formNameEn.trim() && !formNameSk.trim()) {
      setError("Wprowadź nazwę materiału w przynajmniej jednym języku.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const payload = {
        id: editingId || undefined,
        category: formCategory,
        name_pl: formNamePl.trim() || formNameDe.trim() || formNameEn.trim() || formNameSk.trim(),
        name_de: formNameDe.trim() || formNamePl.trim() || formNameEn.trim() || formNameSk.trim(),
        name_en: formNameEn.trim() || formNamePl.trim() || formNameDe.trim() || formNameSk.trim(),
        name_sk: formNameSk.trim() || formNamePl.trim() || formNameDe.trim() || formNameEn.trim(),
        unit: formUnit,
        article_number: formArticleNumber.trim() || undefined,
        notes: formNotes.trim() || undefined,
        is_favorite: formIsFavorite,
      };

      const url = getApiUrl("/api/plan-materials/catalog");
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Błąd zapisu materiału");
      }

      const json = await res.json();
      if (json.items) {
        setMaterials(json.items);
      } else {
        await loadMaterials();
      }

      setIsFormOpen(false);
      setSuccessMsg(editingId ? "Pozycja została zaktualizowana." : "Dodano nowy materiał do katalogu.");
      setTimeout(() => setSuccessMsg(null), 3000);
      if (onMaterialUpdated) onMaterialUpdated();
    } catch (err: any) {
      setError(err.message || "Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć "${name}" z katalogu materiałów planu?`)) {
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const url = getApiUrl(`/api/plan-materials/catalog?id=${encodeURIComponent(id)}`);
      const res = await fetch(url, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Błąd usuwania");
      }

      const json = await res.json();
      if (json.items) {
        setMaterials(json.items);
      } else {
        await loadMaterials();
      }
      setSuccessMsg("Materiał został usunięty.");
      setTimeout(() => setSuccessMsg(null), 3000);
      if (onMaterialUpdated) onMaterialUpdated();
    } catch (err: any) {
      alert(err.message || "Nie udało się usunąć pozycji");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (item: PlanCatalogItem) => {
    try {
      const token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const url = getApiUrl("/api/plan-materials/catalog");
      const res = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: item.id, is_favorite: !item.is_favorite }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.items) setMaterials(json.items);
        else await loadMaterials();
        if (onMaterialUpdated) onMaterialUpdated();
      }
    } catch {}
  };

  const handleResetCatalog = async () => {
    if (
      !confirm(
        "Czy na pewno chcesz przywrócić domyślny katalog materiałów (gniazda, ramki, oświetlenie, kable, puszki) we wszystkich językach?"
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const url = getApiUrl("/api/plan-materials/catalog?action=reset");
      const res = await fetch(url, { method: "POST", headers });
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.items || json.data || DEFAULT_PLAN_MATERIALS_CATALOG;
        setMaterials(items);
        setSuccessMsg("Przywrócono domyślny katalog materiałów.");
        setTimeout(() => setSuccessMsg(null), 3000);
        if (onMaterialUpdated) onMaterialUpdated();
      }
    } catch (err: any) {
      alert(err.message || "Błąd resetowania katalogu");
    } finally {
      setLoading(false);
    }
  };

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase().trim();
    return materials
      .filter((m) => {
        const matchesCategory = selectedCategory === "ALL" || m.category === selectedCategory;
        if (!matchesCategory) return false;
        if (!q) return true;

        const locName = getLocalizedMaterialName(m, language).toLowerCase();
        const pl = (m.name_pl || "").toLowerCase();
        const de = (m.name_de || "").toLowerCase();
        const en = (m.name_en || "").toLowerCase();
        const sk = (m.name_sk || "").toLowerCase();
        const art = (m.article_number || "").toLowerCase();
        const cat = (m.category || "").toLowerCase();

        return (
          locName.includes(q) ||
          pl.includes(q) ||
          de.includes(q) ||
          en.includes(q) ||
          sk.includes(q) ||
          art.includes(q) ||
          cat.includes(q)
        );
      })
      .sort((a, b) => {
        // Favorites first
        if (a.is_favorite && !b.is_favorite) return -1;
        if (!a.is_favorite && b.is_favorite) return 1;
        return (a.order_index || 999) - (b.order_index || 999);
      });
  }, [materials, search, selectedCategory, language]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "960px",
          maxHeight: "90vh",
          backgroundColor: "#1e293b",
          borderRadius: "16px",
          border: "1px solid #334155",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#f8fafc",
          fontFamily: "inherit",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #334155",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
              }}
            >
              <Package size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
                {t("planMaterials", "catalogTitle", "Katalog Materiałów Planu")}
              </h2>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                {t(
                  "planMaterials",
                  "catalogSubtitle",
                  "Dedykowany katalog materiałów instalacyjnych (gniazda, ramki, lampy, wyłączniki, kable) w 4 językach"
                )}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleResetCatalog}
              title="Przywróć domyślne materiały"
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                backgroundColor: "#334155",
                color: "#cbd5e1",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8rem",
                fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              <RotateCcw size={14} />
              <span>{t("planMaterials", "resetCatalog", "Przywróć domyślne")}</span>
            </button>

            <button
              onClick={openCreateForm}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
              }}
            >
              <Plus size={16} />
              <span>{t("planMaterials", "addMaterial", "Dodaj materiał")}</span>
            </button>

            <button
              onClick={onClose}
              style={{
                padding: "8px",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "#94a3b8",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Success / Error Alerts */}
        {successMsg && (
          <div
            style={{
              padding: "10px 24px",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              borderBottom: "1px solid #10b981",
              color: "#34d399",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "10px 24px",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              borderBottom: "1px solid #ef4444",
              color: "#f87171",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Main List Section */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRight: isFormOpen ? "1px solid #334155" : "none",
              overflow: "hidden",
            }}
          >
            {/* Search & Category Filter Bar */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #334155", backgroundColor: "#0f172a" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "#1e293b",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #334155",
                  }}
                >
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("planMaterials", "searchPlaceholder", "Szukaj materiału (nazwa, kategoria, nr art)...")}
                    style={{
                      flex: 1,
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#fff",
                      fontSize: "0.85rem",
                      outline: "none",
                    }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0 }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Pills */}
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  paddingBottom: "4px",
                  scrollbarWidth: "none",
                }}
              >
                <button
                  onClick={() => setSelectedCategory("ALL")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "none",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: selectedCategory === "ALL" ? "#3b82f6" : "#1e293b",
                    color: selectedCategory === "ALL" ? "#fff" : "#94a3b8",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                >
                  {t("planMaterials", "allCategories", "Wszystkie")} ({materials.length})
                </button>
                {PLAN_MATERIAL_CATEGORIES.map((cat) => {
                  const isSel = selectedCategory === cat.id;
                  const count = materials.filter((m) => m.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: "none",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        backgroundColor: isSel ? "#3b82f6" : "#1e293b",
                        color: isSel ? "#fff" : "#94a3b8",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s",
                      }}
                    >
                      <span>{cat.icon}</span>
                      <span>{getLocalizedCategoryName(cat.id, language)}</span>
                      <span style={{ opacity: 0.6, fontSize: "0.7rem" }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Materials Table/List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
              {loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  <Package size={32} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
                  <div>Ładowanie katalogu...</div>
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    backgroundColor: "#0f172a",
                    borderRadius: "12px",
                    border: "1px dashed #334155",
                    margin: "20px 0",
                  }}
                >
                  <Package size={40} color="#64748b" style={{ marginBottom: "12px" }} />
                  <div style={{ fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>
                    Brak materiałów w wybranej kategorii
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "16px" }}>
                    {search ? "Spróbuj zmienić zapytanie" : "Dodaj pierwszy materiał lub przywróć domyślny katalog"}
                  </div>
                  <button
                    onClick={openCreateForm}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      backgroundColor: "#3b82f6",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    + Dodaj materiał
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {filteredMaterials.map((item) => {
                    const activeName = getLocalizedMaterialName(item, language);
                    const categoryObj = PLAN_MATERIAL_CATEGORIES.find((c) => c.id === item.category);

                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          backgroundColor: "#0f172a",
                          border: item.is_favorite ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid #334155",
                          transition: "all 0.15s",
                        }}
                      >
                        {/* Left Side: Fav, Category Icon, Names */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                          <button
                            onClick={() => handleToggleFavorite(item)}
                            title={item.is_favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "4px",
                              color: item.is_favorite ? "#f59e0b" : "#475569",
                              display: "flex",
                            }}
                          >
                            <Star size={18} fill={item.is_favorite ? "#f59e0b" : "none"} />
                          </button>

                          <span style={{ fontSize: "1.2rem" }}>{categoryObj?.icon || "📦"}</span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#f8fafc" }}>
                                {activeName}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  backgroundColor: "#1e293b",
                                  color: "#94a3b8",
                                  border: "1px solid #334155",
                                }}
                              >
                                {getLocalizedUnit(item.unit, language)}
                              </span>
                              {item.article_number && (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "#64748b",
                                    backgroundColor: "rgba(100, 116, 139, 0.15)",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  Art: {item.article_number}
                                </span>
                              )}
                            </div>

                            {/* Multi-language Preview */}
                            <div
                              style={{
                                display: "flex",
                                gap: "10px",
                                fontSize: "0.72rem",
                                color: "#64748b",
                                marginTop: "3px",
                              }}
                            >
                              {item.name_pl && <span>🇵🇱 {item.name_pl}</span>}
                              {item.name_de && <span>🇩🇪 {item.name_de}</span>}
                              {item.name_en && <span>🇬🇧 {item.name_en}</span>}
                              {item.name_sk && <span>🇸🇰 {item.name_sk}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "12px" }}>
                          <button
                            onClick={() => openEditForm(item)}
                            title="Edytuj pozycję"
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              backgroundColor: "#1e293b",
                              color: "#38bdf8",
                              border: "1px solid #334155",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                            }}
                          >
                            <Edit2 size={13} />
                            <span>Edytuj</span>
                          </button>

                          <button
                            onClick={() => handleDelete(item.id, activeName)}
                            title="Usuń pozycję"
                            style={{
                              padding: "6px 8px",
                              borderRadius: "6px",
                              backgroundColor: "#1e293b",
                              color: "#ef4444",
                              border: "1px solid #334155",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Side Drawer: Create / Edit Form */}
          {isFormOpen && (
            <div
              style={{
                width: "380px",
                backgroundColor: "#0f172a",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #334155",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
                  {editingId ? "Edytuj materiał" : "Nowy materiał"}
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Category */}
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                    Kategoria
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      color: "#fff",
                      fontSize: "0.85rem",
                    }}
                  >
                    {PLAN_MATERIAL_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {getLocalizedCategoryName(cat.id, language)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Multilingual Names Header */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Globe size={13} />
                      Nazwa w językach serwisu
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoFillLanguages}
                      title="Skopiuj wprowadzoną nazwę do pozostałych języków"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#38bdf8",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Kopiuj do reszty
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#cbd5e1" }}>🇵🇱 Polski (PL):</span>
                      <input
                        type="text"
                        value={formNamePl}
                        onChange={(e) => setFormNamePl(e.target.value)}
                        placeholder="np. Gniazdo podwójne 230V"
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          color: "#fff",
                          fontSize: "0.8rem",
                          marginTop: "2px",
                        }}
                      />
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#cbd5e1" }}>🇩🇪 Niemiecki (DE):</span>
                      <input
                        type="text"
                        value={formNameDe}
                        onChange={(e) => setFormNameDe(e.target.value)}
                        placeholder="z.B. Schukosteckdose 2-fach"
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          color: "#fff",
                          fontSize: "0.8rem",
                          marginTop: "2px",
                        }}
                      />
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#cbd5e1" }}>🇬🇧 Angielski (EN):</span>
                      <input
                        type="text"
                        value={formNameEn}
                        onChange={(e) => setFormNameEn(e.target.value)}
                        placeholder="e.g. Double 230V Socket"
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          color: "#fff",
                          fontSize: "0.8rem",
                          marginTop: "2px",
                        }}
                      />
                    </div>

                    <div>
                      <span style={{ fontSize: "0.7rem", color: "#cbd5e1" }}>🇸🇰 Słowacki (SK):</span>
                      <input
                        type="text"
                        value={formNameSk}
                        onChange={(e) => setFormNameSk(e.target.value)}
                        placeholder="napr. Zásuvka 230V dvojitá"
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          color: "#fff",
                          fontSize: "0.8rem",
                          marginTop: "2px",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Unit & Article Number */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" }}>
                      Jednostka
                    </label>
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        color: "#fff",
                        fontSize: "0.8rem",
                      }}
                    >
                      <option value="szt">szt / Stk / pcs / ks</option>
                      <option value="m">m (metry)</option>
                      <option value="op">op. / Pck (opakowanie)</option>
                      <option value="kpl">kpl / Set (komplet)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" }}>
                      Nr artykułu / Kod
                    </label>
                    <input
                      type="text"
                      value={formArticleNumber}
                      onChange={(e) => setFormArticleNumber(e.target.value)}
                      placeholder="np. GIRA-018803"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        color: "#fff",
                        fontSize: "0.8rem",
                      }}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" }}>
                    Uwagi / Opis (opcjonalnie)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="np. Kolor biały mat"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      color: "#fff",
                      fontSize: "0.8rem",
                    }}
                  />
                </div>

                {/* Favorite Checkbox */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    fontSize: "0.8rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formIsFavorite}
                    onChange={(e) => setFormIsFavorite(e.target.checked)}
                    style={{ accentColor: "#f59e0b" }}
                  />
                  <Star size={16} color="#f59e0b" fill={formIsFavorite ? "#f59e0b" : "none"} />
                  <span>Wyróżnij na początku listy (Ulubione)</span>
                </label>

                {/* Buttons */}
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: "8px",
                      backgroundColor: "#334155",
                      color: "#cbd5e1",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                    }}
                  >
                    Anuluj
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? "Zapisywanie..." : editingId ? "Zapisz zmiany" : "Dodaj do katalogu"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
