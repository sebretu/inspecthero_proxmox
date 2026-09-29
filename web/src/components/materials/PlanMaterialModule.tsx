"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken, getApiUrl, apiGet } from "@/lib/apiClient";
import { Plus, Trash2, Camera, Check, X, Package, ShoppingCart, Settings, Star } from "lucide-react";
import MaterialOrderSummaryModal from "./MaterialOrderSummaryModal";
import MaterialCatalogModal from "./MaterialCatalogModal";
import styles from "./PlanMaterial.module.css";
import { MaterialPin, MaterialItem } from "@/pages/api/plans/[id]/materials";
import {
  PlanCatalogItem,
  PLAN_MATERIAL_CATEGORIES,
  DEFAULT_PLAN_MATERIALS_CATALOG,
  getLocalizedMaterialName,
  getLocalizedCategoryName,
  getLocalizedUnit,
} from "@/lib/planMaterialCatalog";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

const CRS = L.CRS.Simple;
const MarkerAny: any = Marker;
const TooltipAny: any = Tooltip;

export default function PlanMaterialModule({
  planId,
  meta,
  currentUserId,
  currentUserRole,
  isVisible = true,
  onCountsChange,
  onEnsureVisible,
  projectName,
  planTitle,
}: {
  planId: string;
  meta: Meta;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  isVisible?: boolean;
  onCountsChange?: (counts: { material: number; materialItems: number }) => void;
  onEnsureVisible?: () => void;
  projectName?: string;
  planTitle?: string;
}) {
  const { t, language } = useLanguage();
  const map = useMap();

  const [pins, setPins] = useState<MaterialPin[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);

  // Modal editor state (for creating or editing a pin)
  const [editingPin, setEditingPin] = useState<{
    id?: string;
    coords: { x_norm: number; y_norm: number };
    title: string;
    notes: string;
    status: string;
    photo_url?: string | null;
    items: MaterialItem[];
  } | null>(null);

  // Catalog search / dropdown state (initialized with built-in default catalog)
  const [catalogMaterials, setCatalogMaterials] = useState<PlanCatalogItem[]>(DEFAULT_PLAN_MATERIALS_CATALOG);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [dropdownCategoryFilter, setDropdownCategoryFilter] = useState<string>("ALL");
  const [activeItemIndexForCatalog, setActiveItemIndexForCatalog] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUploadTargetItemIdx, setCurrentUploadTargetItemIdx] = useState<number | null>(null);

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  // Sync placement state
  useEffect(() => {
    if (map) (map as any)._isMaterialPinActive = isPlacing;
    if (typeof window !== "undefined") (window as any)._isMaterialPinActive = isPlacing;
    return () => {
      if (map) (map as any)._isMaterialPinActive = false;
      if (typeof window !== "undefined") (window as any)._isMaterialPinActive = false;
    };
  }, [map, isPlacing]);

  // Load catalog materials from dedicated plan catalog endpoint
  const loadCatalogMaterials = useCallback(() => {
    apiGet<any>("/api/plan-materials/catalog")
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items || res?.data || [];
        if (Array.isArray(items) && items.length > 0) {
          setCatalogMaterials(items);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCatalogMaterials();
  }, [loadCatalogMaterials]);

  // Load material pins for this plan
  const loadPins = useCallback(async () => {
    if (!planId) return;
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(getApiUrl(`/api/plans/${planId}/materials`), { headers });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setPins(json.data);
      }
    } catch {}
  }, [planId]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  // Notify parent of counts
  useEffect(() => {
    const totalItems = pins.reduce((acc, p) => acc + (p.items?.length || 0), 0);
    onCountsChange?.({ material: pins.length, materialItems: totalItems });
  }, [pins, onCountsChange]);

  // Disable map zoom/drag when modal or dropdown is open so mouse wheel scrolls the modal/dropdown
  useEffect(() => {
    if (!map) return;
    if (editingPin || isCatalogModalOpen || isSummaryOpen || activeItemIndexForCatalog !== null) {
      map.dragging?.disable();
      map.scrollWheelZoom?.disable();
      map.doubleClickZoom?.disable();
      map.touchZoom?.disable();
      map.boxZoom?.disable();
      map.keyboard?.disable();
    } else {
      map.dragging?.enable();
      map.scrollWheelZoom?.enable();
      map.doubleClickZoom?.enable();
      map.touchZoom?.enable();
      map.boxZoom?.enable();
      map.keyboard?.enable();
    }
  }, [editingPin, isCatalogModalOpen, isSummaryOpen, activeItemIndexForCatalog, map]);

  // Handle map click for placement with exact Leaflet Simple CRS precision
  useMapEvents({
    click(e: any) {
      if (!isPlacing) return;
      if (e.originalEvent) {
        e.originalEvent.stopImmediatePropagation?.();
        e.originalEvent.stopPropagation?.();
        e.originalEvent.preventDefault?.();
      }

      const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
      const x_norm = Math.max(0, Math.min(1, p.x / worldPxW));
      const y_norm = Math.max(0, Math.min(1, p.y / worldPxH));

      // Open creation modal
      setEditingPin({
        coords: { x_norm, y_norm },
        title: "",
        notes: "",
        status: "PENDING",
        items: [
          {
            id: `item-${Date.now()}`,
            name: "",
            quantity: 1,
            unit: "St",
            category: "Gniazda",
          },
        ],
      });

      setIsPlacing(false);
      onEnsureVisible?.();
    },
  });

  // Photo upload handler
  const handlePhotoUpload = async (file: File, itemIndex: number) => {
    try {
      setUploadingIndex(itemIndex);
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(getApiUrl("/api/upload"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      const photoUrl = json.data?.publicUrl || json.data?.url || json.url;

      if (photoUrl && editingPin) {
        const updatedItems = [...editingPin.items];
        if (updatedItems[itemIndex]) {
          updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            photo_url: photoUrl,
          };
          setEditingPin({ ...editingPin, items: updatedItems });
        }
      }
    } catch (err: any) {
      alert("Błąd wgrywania zdjęcia: " + err.message);
    } finally {
      setUploadingIndex(null);
    }
  };

  // Save pin handler
  const handleSavePin = async () => {
    if (!editingPin) return;
    const validItems = (editingPin.items || []).filter((it) => it.name && it.name.trim().length > 0);

    if (validItems.length === 0) {
      alert(t("planMaterials", "materialNameLabel", "Wybierz lub wpisz przynajmniej jeden materiał!"));
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const isEdit = !!editingPin.id;
      const method = isEdit ? "PATCH" : "POST";

      const payload = {
        id: editingPin.id,
        plan_id: planId,
        x_norm: editingPin.coords.x_norm,
        y_norm: editingPin.coords.y_norm,
        title: editingPin.title || validItems[0]?.name || "Materiał",
        notes: editingPin.notes,
        status: editingPin.status,
        photo_url: validItems.find((it) => it.photo_url)?.photo_url || editingPin.photo_url || null,
        items: validItems,
      };

      const res = await fetch(getApiUrl(`/api/plans/${planId}/materials`), {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Błąd zapisu");
      }

      await loadPins();
      setEditingPin(null);
    } catch (err: any) {
      alert("Błąd podczas zapisywania materiałów: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete pin handler
  const handleDeletePin = async (pinId: string) => {
    const msg = t("planMaterials", "confirmDeletePin", "Czy na pewno chcesz usunąć ten punkt materiałów?");
    if (!confirm(msg)) return;
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch(getApiUrl(`/api/plans/${planId}/materials?pinId=${pinId}`), {
        method: "DELETE",
        headers,
      });

      await loadPins();
      if (editingPin?.id === pinId) setEditingPin(null);
    } catch {}
  };

  // Drag marker end handler
  const handleMarkerDragEnd = async (pinId: string, e: any) => {
    const p = CRS.latLngToPoint(e.target.getLatLng(), meta.maxZoom);
    const x_norm = Math.max(0, Math.min(1, p.x / worldPxW));
    const y_norm = Math.max(0, Math.min(1, p.y / worldPxH));

    try {
      const token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch(getApiUrl(`/api/plans/${planId}/materials`), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: pinId, x_norm, y_norm }),
      });

      setPins((prev) => prev.map((pPin) => (pPin.id === pinId ? { ...pPin, x_norm, y_norm } : pPin)));
    } catch {}
  };

  // Leaflet custom div icon - VERY SMALL and precise
  const createMaterialIcon = (pin: MaterialPin) => {
    const count = pin.items?.length || 1;
    const totalQty = (pin.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
    const statusBg =
      pin.status === "DELIVERED"
        ? "linear-gradient(135deg, #10b981, #059669)"
        : pin.status === "ORDERED"
        ? "linear-gradient(135deg, #3b82f6, #1d4ed8)"
        : "linear-gradient(135deg, #f59e0b, #d97706)";

    const html = `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${statusBg};
        border: 1.5px solid #ffffff;
        box-shadow: 0 2px 5px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        cursor: pointer;
        position: relative;
        transition: transform 0.15s ease;
        user-select: none;
      ">
        <span style="line-height: 1;">📦</span>
        ${count > 1 ? `
          <div style="
            position: absolute;
            top: -4px;
            right: -5px;
            background: #0f172a;
            color: #fbbf24;
            border: 1px solid #ffffff;
            border-radius: 9999px;
            font-size: 7.5px;
            font-weight: 900;
            padding: 0 2.5px;
            min-width: 11px;
            height: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
          ">${count}</div>
        ` : ""}
      </div>
    `;

    return L.divIcon({
      html,
      className: "custom-material-pin-icon-compact",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -11],
    });
  };

  // Filter catalog items
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.toLowerCase().trim();
    const list = (catalogMaterials || []).map((it) => ({
      ...it,
      displayName: getLocalizedMaterialName(it, (language as string) || "pl"),
      displayCategory: getLocalizedCategoryName(it.category || "other", (language as string) || "pl"),
      displayUnit: getLocalizedUnit(it.unit || "szt", (language as string) || "pl"),
    }));

    return list
      .filter((m) => {
        const matchCat = dropdownCategoryFilter === "ALL" || m.category === dropdownCategoryFilter;
        if (!matchCat) return false;
        if (!query) return true;
        return (
          m.displayName.toLowerCase().includes(query) ||
          (m.name_pl || "").toLowerCase().includes(query) ||
          (m.name_de || "").toLowerCase().includes(query) ||
          (m.name_en || "").toLowerCase().includes(query) ||
          (m.name_sk || "").toLowerCase().includes(query) ||
          m.displayCategory.toLowerCase().includes(query) ||
          (m.article_number || "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (a.is_favorite && !b.is_favorite) return -1;
        if (!a.is_favorite && b.is_favorite) return 1;
        return (a.order_index || 999) - (b.order_index || 999);
      })
      .slice(0, 40);
  }, [catalogSearch, catalogMaterials, language, dropdownCategoryFilter]);

  // External toolbar portal target
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const updateSlot = () => {
      const el =
        document.getElementById("plan-measurement-toolbar-left") ||
        document.getElementById("plan-external-top-toolbar");
      if (el) setToolbarSlot(el);
    };
    updateSlot();
    const timer = setTimeout(updateSlot, 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Hidden file input for photo uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && currentUploadTargetItemIdx !== null) {
            handlePhotoUpload(file, currentUploadTargetItemIdx);
          }
          e.target.value = "";
        }}
      />

      {/* Top Toolbar Action Buttons (Portal) */}
      {toolbarSlot &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => {
                setIsPlacing((prev) => {
                  const next = !prev;
                  if (next) onEnsureVisible?.();
                  return next;
                });
              }}
              className={`${styles.toolbarButton} ${
                isPlacing ? styles.toolbarButtonActive : styles.toolbarButtonPrimary
              }`}
              title={t("planMaterials", "addPinBtn", "+ Materiał")}
            >
              <Package className="w-3.5 h-3.5" />
              <span>
                {isPlacing
                  ? t("planMaterials", "addPinActive", "Kliknij na planie...")
                  : t("planMaterials", "addPinBtn", "+ Materiał")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsSummaryOpen(true)}
              className={`${styles.toolbarButton} ${styles.toolbarButtonSecondary}`}
              title={t("planMaterials", "orderSummaryBtn", "Zamówienie")}
            >
              <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {t("planMaterials", "orderSummaryBtn", "Zamówienie")} {pins.length > 0 ? `(${pins.length})` : ""}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsCatalogModalOpen(true)}
              className={`${styles.toolbarButton} ${styles.toolbarButtonSecondary}`}
              title={t("planMaterials", "manageCatalogBtn", "Katalog materiałów")}
            >
              <Settings className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">
                {t("planMaterials", "manageCatalogBtn", "Katalog")}
              </span>
            </button>
          </div>,
          toolbarSlot
        )}

      {/* Markers rendered on the map with pixel-perfect Leaflet Simple CRS projection */}
      {isVisible &&
        pins.map((pin) => {
          const latlng = CRS.pointToLatLng(
            L.point(pin.x_norm * worldPxW, pin.y_norm * worldPxH),
            meta.maxZoom
          );

          return (
            <MarkerAny
              key={pin.id}
              position={latlng}
              icon={createMaterialIcon(pin)}
              draggable={true}
              eventHandlers={{
                click: () => {
                  setEditingPin({
                    id: pin.id,
                    coords: { x_norm: pin.x_norm, y_norm: pin.y_norm },
                    title: pin.title || "",
                    notes: pin.notes || "",
                    status: pin.status || "PENDING",
                    photo_url: pin.photo_url,
                    items:
                      pin.items && pin.items.length > 0
                        ? [...pin.items]
                        : [{ id: `item-${Date.now()}`, name: "", quantity: 1, unit: "St" }],
                  });
                },
                dragend: (e: any) => handleMarkerDragEnd(pin.id, e),
              }}
            >
              <TooltipAny direction="top" offset={[0, -12]} opacity={0.95}>
                <div style={{ padding: "4px 6px", minWidth: "140px" }}>
                  <div style={{ fontWeight: 800, fontSize: "12px", color: "#0f172a", marginBottom: "4px" }}>
                    {pin.title || t("planMaterials", "layerTitle", "Materiały")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "11px" }}>
                    {(pin.items || []).map((it, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ color: "#334155" }}>{it.name}</span>
                        <strong style={{ color: "#d97706" }}>
                          {it.quantity} {it.unit}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "9px", color: "#64748b" }}>
                    {t("planMaterials", "clickToEditPin", "Kliknij, aby edytować lub dodać materiały")}
                  </div>
                </div>
              </TooltipAny>
            </MarkerAny>
          );
        })}

      {/* Material Pin Editor Modal */}
      {editingPin && typeof document !== "undefined" && ReactDOM.createPortal(
        <div
          className={styles.modalOverlay}
          onClick={() => setEditingPin(null)}
          onWheel={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                  }}
                >
                  📦
                </div>
                <div>
                  <h3 style={{ fontSize: "15px", fontWeight: 800, margin: 0 }}>
                    {editingPin.id
                      ? t("planMaterials", "editPinTitle", "Edycja punktu materiałów")
                      : t("planMaterials", "newPinTitle", "Nowy punkt materiałów")}
                  </h3>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                    {t("planMaterials", "position", "Pozycja")}: ({Math.round(editingPin.coords.x_norm * 100)}%,{" "}
                    {Math.round(editingPin.coords.y_norm * 100)}%)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPin(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className={styles.modalBody}>
              {/* Optional Title & Status */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: "10px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#cbd5e1",
                      marginBottom: "4px",
                    }}
                  >
                    {t("planMaterials", "titleLocationLabel", "Nazwa / Pomieszczenie (opcjonalnie)")}
                  </label>
                  <input
                    type="text"
                    value={editingPin.title}
                    onChange={(e) => setEditingPin({ ...editingPin, title: e.target.value })}
                    placeholder={t(
                      "planMaterials",
                      "titleLocationPlaceholder",
                      "np. Salon ściana TV, Kuchnia, Biuro 101"
                    )}
                    style={{
                      width: "100%",
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      color: "#fff",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#cbd5e1",
                      marginBottom: "4px",
                    }}
                  >
                    {t("planMaterials", "statusLabel", "Status")}
                  </label>
                  <select
                    value={editingPin.status}
                    onChange={(e) => setEditingPin({ ...editingPin, status: e.target.value })}
                    style={{
                      width: "100%",
                      background: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color:
                        editingPin.status === "DELIVERED"
                          ? "#34d399"
                          : editingPin.status === "ORDERED"
                          ? "#60a5fa"
                          : "#fbbf24",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="PENDING">{t("planMaterials", "statusPending", "🟡 Do zamówienia")}</option>
                    <option value="ORDERED">{t("planMaterials", "statusOrdered", "🔵 Zamówione")}</option>
                    <option value="DELIVERED">{t("planMaterials", "statusDelivered", "🟢 Dostarczone")}</option>
                  </select>
                </div>
              </div>

              {/* Items Section Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "#fbbf24" }}>
                  {t("planMaterials", "materialsListTitle", "Materiały do zamówienia")} ({editingPin.items.length})
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setIsCatalogModalOpen(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#cbd5e1",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "4px 8px",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                    title="Zarządzaj katalogiem materiałów"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{t("planMaterials", "manageCatalogBtn", "Katalog")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingPin({
                        ...editingPin,
                        items: [
                          ...editingPin.items,
                          {
                            id: `item-${Date.now()}-${editingPin.items.length}`,
                            name: "",
                            quantity: 1,
                            unit: "St",
                            category: "Gniazda",
                          },
                        ],
                      });
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "rgba(245, 158, 11, 0.15)",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      color: "#fbbf24",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "4px 8px",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> {t("planMaterials", "addAnotherItem", "+ Dodaj kolejny")}
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {editingPin.items.map((item, index) => (
                  <div key={item.id || index} className={styles.itemCard}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      {/* Name with searchable catalog popup */}
                      <div style={{ flex: 1, position: "relative" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#94a3b8",
                            marginBottom: "2px",
                          }}
                        >
                          {t("planMaterials", "materialNameLabel", "Nazwa materiału (wybierz z listy lub wpisz)")}
                        </label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...editingPin.items];
                            newItems[index] = { ...newItems[index], name: e.target.value };
                            setEditingPin({ ...editingPin, items: newItems });
                            setCatalogSearch(e.target.value);
                            setActiveItemIndexForCatalog(index);
                          }}
                          onFocus={() => {
                            setActiveItemIndexForCatalog(index);
                            setCatalogSearch(item.name || "");
                          }}
                          placeholder={t(
                            "planMaterials",
                            "materialNamePlaceholder",
                            "np. Gniazdo, Abdeckrahmen, Lampa LED..."
                          )}
                          style={{
                            width: "100%",
                            background: "#0f172a",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontSize: "13px",
                            color: "#fff",
                            outline: "none",
                          }}
                        />

                        {/* Catalog Suggestions Dropdown */}
                        {activeItemIndexForCatalog === index && (
                          <div
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              zIndex: 100,
                              background: "#0f172a",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: "10px",
                              marginTop: "4px",
                              maxHeight: "260px",
                              overflowY: "auto",
                              boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                            }}
                          >
                            <div
                              style={{
                                padding: "6px 10px",
                                fontSize: "10px",
                                fontWeight: 800,
                                color: "#94a3b8",
                                textTransform: "uppercase",
                                borderBottom: "1px solid rgba(255,255,255,0.08)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <span>{t("planMaterials", "popularAndCatalog", "Katalog materiałów")}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveItemIndexForCatalog(null);
                                  setIsCatalogModalOpen(true);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#fbbf24",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {t("planMaterials", "manageCatalog", "⚙️ Zarządzaj katalogiem...")}
                              </button>
                            </div>

                            {/* Category Filter Chips inside Dropdown */}
                            <div
                              style={{
                                display: "flex",
                                gap: "4px",
                                overflowX: "auto",
                                padding: "6px 8px",
                                borderBottom: "1px solid rgba(255,255,255,0.08)",
                                backgroundColor: "#0b1120",
                                scrollbarWidth: "none",
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDropdownCategoryFilter("ALL");
                                }}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  border: "none",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  backgroundColor: dropdownCategoryFilter === "ALL" ? "#3b82f6" : "rgba(255,255,255,0.08)",
                                  color: dropdownCategoryFilter === "ALL" ? "#fff" : "#94a3b8",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Wszystkie ({catalogMaterials.length})
                              </button>
                              {PLAN_MATERIAL_CATEGORIES.map((cat) => {
                                const isSel = dropdownCategoryFilter === cat.id;
                                const count = catalogMaterials.filter((m) => m.category === cat.id).length;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDropdownCategoryFilter(cat.id);
                                    }}
                                    style={{
                                      padding: "3px 8px",
                                      borderRadius: "12px",
                                      border: "none",
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      backgroundColor: isSel ? "#3b82f6" : "rgba(255,255,255,0.08)",
                                      color: isSel ? "#fff" : "#94a3b8",
                                      whiteSpace: "nowrap",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "3px",
                                    }}
                                  >
                                    <span>{cat.icon}</span>
                                    <span>{getLocalizedCategoryName(cat.id, (language as string) || "pl")}</span>
                                    {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}
                                  </button>
                                );
                              })}
                            </div>

                            {filteredCatalog.map((catItem, cIdx) => (
                              <div
                                key={catItem.id || cIdx}
                                onClick={() => {
                                  const newItems = [...editingPin.items];
                                  newItems[index] = {
                                    ...newItems[index],
                                    name: catItem.displayName || catItem.name_pl || "",
                                    unit: catItem.unit || "szt",
                                    category: catItem.category || newItems[index].category,
                                    article_number: catItem.article_number || newItems[index].article_number,
                                  };
                                  setEditingPin({ ...editingPin, items: newItems });
                                  setActiveItemIndexForCatalog(null);
                                }}
                                style={{
                                  padding: "8px 10px",
                                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  color: "#e2e8f0",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.15)")
                                }
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span>{catItem.displayName}</span>
                                  {catItem.is_favorite && (
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  )}
                                </div>
                                <span style={{ fontSize: "10px", color: "#fbbf24", fontWeight: 700 }}>
                                  {catItem.displayCategory} ({catItem.displayUnit})
                                </span>
                              </div>
                            ))}

                            <div
                              onClick={() => setActiveItemIndexForCatalog(null)}
                              style={{
                                padding: "6px",
                                textAlign: "center",
                                fontSize: "11px",
                                color: "#64748b",
                                cursor: "pointer",
                                borderTop: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              {t("planMaterials", "closeList", "Zamknij listę")}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quantity & Unit */}
                      <div style={{ width: "80px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#94a3b8",
                            marginBottom: "2px",
                          }}
                        >
                          {t("planMaterials", "quantityLabel", "Ilość")}
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...editingPin.items];
                            newItems[index] = { ...newItems[index], quantity: Number(e.target.value) || 1 };
                            setEditingPin({ ...editingPin, items: newItems });
                          }}
                          style={{
                            width: "100%",
                            background: "#0f172a",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "8px",
                            padding: "8px 6px",
                            fontSize: "13px",
                            fontWeight: 800,
                            color: "#fbbf24",
                            textAlign: "center",
                            outline: "none",
                          }}
                        />
                      </div>

                      <div style={{ width: "70px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#94a3b8",
                            marginBottom: "2px",
                          }}
                        >
                          {t("planMaterials", "unitLabel", "Jedn.")}
                        </label>
                        <select
                          value={item.unit || "St"}
                          onChange={(e) => {
                            const newItems = [...editingPin.items];
                            newItems[index] = { ...newItems[index], unit: e.target.value };
                            setEditingPin({ ...editingPin, items: newItems });
                          }}
                          style={{
                            width: "100%",
                            background: "#0f172a",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "8px",
                            padding: "8px 4px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#fff",
                            outline: "none",
                            cursor: "pointer",
                          }}
                        >
                          <option value="St">{t("planMaterials", "unitSt", "St (szt)")}</option>
                          <option value="m">{t("planMaterials", "unitM", "m")}</option>
                          <option value="Pkg">{t("planMaterials", "unitPkg", "Pkg")}</option>
                          <option value="Rolle">{t("planMaterials", "unitRolle", "Rolle")}</option>
                          <option value="Set">{t("planMaterials", "unitSet", "Set")}</option>
                        </select>
                      </div>

                      {/* Remove item button */}
                      {editingPin.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = editingPin.items.filter((_, i) => i !== index);
                            setEditingPin({ ...editingPin, items: newItems });
                          }}
                          style={{
                            marginTop: "18px",
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#ef4444",
                            borderRadius: "8px",
                            padding: "6px",
                            cursor: "pointer",
                          }}
                          title={t("planMaterials", "deleteItem", "Usuń pozycję")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Photo & Notes for this item */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        marginTop: "4px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {item.photo_url ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <img
                              src={item.photo_url}
                              alt="Foto"
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "6px",
                                objectFit: "cover",
                                border: "1px solid #fbbf24",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = [...editingPin.items];
                                newItems[index] = { ...newItems[index], photo_url: null };
                                setEditingPin({ ...editingPin, items: newItems });
                              }}
                              style={{
                                fontSize: "10px",
                                color: "#ef4444",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              {t("planMaterials", "deletePhoto", "Usuń foto")}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentUploadTargetItemIdx(index);
                              fileInputRef.current?.click();
                            }}
                            disabled={uploadingIndex === index}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              color: "#94a3b8",
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              cursor: "pointer",
                            }}
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              {uploadingIndex === index
                                ? t("planMaterials", "uploadingPhoto", "Wgrywanie...")
                                : t("planMaterials", "addPhoto", "+ Dodaj zdjęcie")}
                            </span>
                          </button>
                        )}
                      </div>

                      {item.article_number && (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          {t("planMaterials", "articleNumber", "Art.-Nr.")}: {item.article_number}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* General Notes */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    marginBottom: "4px",
                  }}
                >
                  {t("planMaterials", "notesLabel", "Uwagi / Szczegóły montażowe (opcjonalnie)")}
                </label>
                <textarea
                  value={editingPin.notes}
                  onChange={(e) => setEditingPin({ ...editingPin, notes: e.target.value })}
                  rows={2}
                  placeholder={t(
                    "planMaterials",
                    "notesPlaceholder",
                    "np. ramki w kolorze antracyt, montaż na wysokości 1.2m"
                  )}
                  style={{
                    width: "100%",
                    background: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    color: "#fff",
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className={styles.modalFooter}>
              {editingPin.id && (
                <button
                  type="button"
                  onClick={() => handleDeletePin(editingPin.id!)}
                  style={{
                    marginRight: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#ef4444",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 className="w-4 h-4" /> {t("planMaterials", "deletePin", "Usuń punkt")}
                </button>
              )}

              <button
                type="button"
                onClick={() => setEditingPin(null)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#cbd5e1",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "8px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                {t("planMaterials", "cancel", "Anuluj")}
              </button>

              <button
                type="button"
                onClick={handleSavePin}
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  border: "none",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 800,
                  padding: "9px 18px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(245, 158, 11, 0.4)",
                }}
              >
                <Check className="w-4 h-4" />
                <span>
                  {saving
                    ? t("planMaterials", "saving", "Zapisywanie...")
                    : t("planMaterials", "saveOnPlan", "Zapisz na planie")}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Material Order Summary Generator Modal */}
      <MaterialOrderSummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        pins={pins}
        planTitle={planTitle || `Plan ${planId.slice(0, 6)}`}
        projectName={projectName || "Baustelle"}
      />

      {/* Material Catalog Management Modal */}
      <MaterialCatalogModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onMaterialUpdated={() => loadCatalogMaterials()}
      />
    </>
  );
}
