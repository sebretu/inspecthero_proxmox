"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { Polygon, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/apiClient";
import styles from "./PlanRevisionsKlappen.module.css";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

export type RevisionsKlappeRow = {
  id: string;
  plan_id: string;
  x_norm: number;
  y_norm: number;
  w_norm: number;
  h_norm: number;
  width_cm?: number | null;
  height_cm?: number | null;
  label?: string | null;
  description?: string | null;
  created_by?: string | null;
  created_at?: string;
};

const CRS = L.CRS.Simple;
const TooltipAny: any = Tooltip;
const PolygonAny: any = Polygon;

export default function PlanRevisionsKlappenModule({
  planId,
  meta,
  currentUserId,
  currentUserRole,
  isVisible = true,
  onCountChange,
  onEnsureVisible,
}: {
  planId: string;
  meta: Meta;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  isVisible?: boolean;
  onCountChange?: (count: number) => void;
  onEnsureVisible?: () => void;
}) {
  const { t } = useLanguage();
  const map = useMap();

  const [klappen, setKlappen] = useState<RevisionsKlappeRow[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  // Modal creation & editing state
  const [modalData, setModalData] = useState<{
    x_norm: number;
    y_norm: number;
    w_norm: number;
    h_norm: number;
    width_cm: number;
    height_cm: number;
  } | null>(null);

  const [editingKlappe, setEditingKlappe] = useState<RevisionsKlappeRow | null>(null);

  const [widthCmInput, setWidthCmInput] = useState("60");
  const [heightCmInput, setHeightCmInput] = useState("60");
  const [labelInput, setLabelInput] = useState("RK 60x60");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Scale data for calculating real dimensions
  const [pixelsPerMeter, setPixelsPerMeter] = useState<number | null>(null);
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);

  const toolbarRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  const isAdminOrMod = useMemo(() => {
    const role = (currentUserRole || "").toUpperCase();
    return role === "ADMIN";
  }, [currentUserRole]);

  // Load scale from API
  useEffect(() => {
    if (!planId) return;
    let isMounted = true;
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`/api/plans/${planId}/scale`, { headers });
        if (!res.ok) return;
        const json = await res.json();
        if (!isMounted) return;

        if (json.scale && typeof json.scale.pixels_per_meter === "number" && json.scale.pixels_per_meter > 0) {
          setPixelsPerMeter(json.scale.pixels_per_meter);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [planId]);

  // Listen for custom trigger to start drawing Revisionsklappe from symbol menu
  useEffect(() => {
    const handleTriggerDraw = () => {
      onEnsureVisible?.();
      setIsDrawing(true);
      setStartPoint(null);
      setHoverPoint(null);
    };
    window.addEventListener("start-draw-revisionsklappe", handleTriggerDraw);
    return () => {
      window.removeEventListener("start-draw-revisionsklappe", handleTriggerDraw);
    };
  }, [onEnsureVisible]);

  // Load saved klappen from DB on mount
  const loadKlappen = useCallback(async () => {
    if (!planId) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/plans/${planId}/revisionsklappen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.klappen && Array.isArray(json.klappen)) {
        setKlappen(json.klappen);
      }
    } catch {
      // ignore
    }
  }, [planId]);

  useEffect(() => {
    loadKlappen();
  }, [loadKlappen]);

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  useEffect(() => {
    onCountChangeRef.current?.(klappen.length);
  }, [klappen.length]);

  // Block clicks from reaching other handlers when drawing
  useEffect(() => {
    if (map) (map as any)._isKlappenActive = isDrawing;
    if (typeof window !== "undefined") (window as any)._isKlappenActive = isDrawing;
    return () => {
      if (map) (map as any)._isKlappenActive = false;
      if (typeof window !== "undefined") (window as any)._isKlappenActive = false;
    };
  }, [map, isDrawing]);

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenTooltipId(null);
        setEditingKlappe(null);
        setModalData(null);
        if (isDrawing) {
          setIsDrawing(false);
          setStartPoint(null);
          setHoverPoint(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing]);

  // Open edit modal for an existing klappe
  const handleOpenEditKlappe = (k: RevisionsKlappeRow) => {
    setEditingKlappe(k);
    setModalData(null);
    setWidthCmInput(String(k.width_cm ?? "60"));
    setHeightCmInput(String(k.height_cm ?? "60"));
    setLabelInput(k.label || `RK ${k.width_cm ?? 60}x${k.height_cm ?? 60}`);
    setDescriptionInput(k.description || "");
    setOpenTooltipId(null);
  };

  // Helper conversions
  const latLngToPlanPx = useCallback(
    (latlng: any) => {
      const p = CRS.latLngToPoint(latlng, meta.maxZoom);
      return { x: p.x, y: p.y };
    },
    [meta.maxZoom]
  );

  const planPxToLatLng = useCallback(
    (x: number, y: number) => {
      return CRS.pointToLatLng(L.point(x, y), meta.maxZoom);
    },
    [meta.maxZoom]
  );

  // Map events handler for drawing rectangle
  function MapEventsHandler() {
    useMapEvents({
      click: (e: any) => {
        if (!isDrawing || !isAdminOrMod) return;

        if (e.originalEvent) {
          e.originalEvent._klappenHandled = true;
          e.originalEvent.stopImmediatePropagation?.();
          e.originalEvent.stopPropagation?.();
          e.originalEvent.preventDefault?.();
        }
        (e as any)._klappenHandled = true;

        const pt = latLngToPlanPx(e.latlng);

        if (!startPoint) {
          setStartPoint(pt);
          setHoverPoint(pt);
        } else {
          // Finish rectangle
          const xMin = Math.min(startPoint.x, pt.x);
          const yMin = Math.min(startPoint.y, pt.y);
          const xMax = Math.max(startPoint.x, pt.x);
          const yMax = Math.max(startPoint.y, pt.y);

          const wPx = Math.max(10, xMax - xMin);
          const hPx = Math.max(10, yMax - yMin);

          const x_norm = Math.max(0, Math.min(1, xMin / worldPxW));
          const y_norm = Math.max(0, Math.min(1, yMin / worldPxH));
          const w_norm = Math.max(0.001, Math.min(1, wPx / worldPxW));
          const h_norm = Math.max(0.001, Math.min(1, hPx / worldPxH));

          // Real dimensions based on scale
          let wCm = 60;
          let hCm = 60;
          if (pixelsPerMeter && pixelsPerMeter > 0) {
            wCm = Math.round((wPx / pixelsPerMeter) * 100);
            hCm = Math.round((hPx / pixelsPerMeter) * 100);
          }

          setWidthCmInput(String(wCm));
          setHeightCmInput(String(hCm));
          setLabelInput(`RK ${wCm}x${hCm}`);
          setDescriptionInput("");

          setModalData({
            x_norm,
            y_norm,
            w_norm,
            h_norm,
            width_cm: wCm,
            height_cm: hCm,
          });

          setStartPoint(null);
          setHoverPoint(null);
          setIsDrawing(false);
        }
      },

      mousemove: (e: any) => {
        if (!isDrawing || !startPoint) return;
        setHoverPoint(latLngToPlanPx(e.latlng));
      },
    });
    return null;
  }

  // Save new or updated Revisionsklappe
  const handleSaveKlappe = async () => {
    if ((!modalData && !editingKlappe) || saving) return;
    setSaving(true);
    const token = await getToken();
    if (!token) { setSaving(false); return; }

    try {
      const wVal = parseFloat(widthCmInput) || (modalData ? modalData.width_cm : editingKlappe?.width_cm ?? 60);
      const hVal = parseFloat(heightCmInput) || (modalData ? modalData.height_cm : editingKlappe?.height_cm ?? 60);

      if (editingKlappe) {
        const res = await fetch(`/api/plans/${planId}/revisionsklappen?klappeId=${encodeURIComponent(editingKlappe.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            width_cm: wVal,
            height_cm: hVal,
            label: labelInput.trim() || `RK ${wVal}x${hVal}`,
            description: descriptionInput.trim() || null,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (json.klappe) {
          setKlappen((prev) => prev.map((item) => (item.id === json.klappe.id ? json.klappe : item)));
        }
        setEditingKlappe(null);
      } else if (modalData) {
        const res = await fetch(`/api/plans/${planId}/revisionsklappen`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            x_norm: modalData.x_norm,
            y_norm: modalData.y_norm,
            w_norm: modalData.w_norm,
            h_norm: modalData.h_norm,
            width_cm: wVal,
            height_cm: hVal,
            label: labelInput.trim() || `RK ${wVal}x${hVal}`,
            description: descriptionInput.trim() || null,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (json.klappe) {
          setKlappen((prev) => [...prev, json.klappe]);
        }
        setModalData(null);
      }
    } catch (err) {
      console.error("Failed to save revisionsklappe", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete Revisionsklappe
  const handleDeleteKlappe = async (id: string) => {
    setKlappen((prev) => prev.filter((k) => k.id !== id));
    setOpenTooltipId(null);
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`/api/plans/${planId}/revisionsklappen?klappeId=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  };

  // Preset button click
  const handleApplyPreset = (w: number, h: number) => {
    setWidthCmInput(String(w));
    setHeightCmInput(String(h));
    setLabelInput(`RK ${w}x${h}`);
  };

  const toolbarSlot = typeof document !== "undefined"
    ? document.getElementById("plan-measurement-toolbar-left") || document.getElementById("plan-external-top-toolbar")
    : null;

  const buttonContent = (
    <button
      ref={toolbarRef}
      type="button"
      className={`${styles.btn} ${isDrawing ? styles.btnActive : ""}`}
      onClick={() => {
        onEnsureVisible?.();
        setIsDrawing((prev) => !prev);
        setStartPoint(null);
        setHoverPoint(null);
      }}
      title="Revisionsklappe zeichnen (Rechteck auf dem Plan)"
    >
      🔲 {isDrawing ? t("planKlappen", "drawingActive", "Klappe: Zeichnen...") : t("planKlappen", "toolbarBtn", "Revisionsklappe")}
    </button>
  );

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <MapEventsHandler />

      {/* Toolbar Portal - Only for Admin / Moderator */}
      {isAdminOrMod && (
        toolbarSlot && typeof document !== "undefined" ? (
          ReactDOM.createPortal(buttonContent, toolbarSlot)
        ) : (
          <div className={styles.container}>
            <div className={styles.toolbar}>
              {buttonContent}
            </div>
          </div>
        )
      )}

      {/* Drawing instruction hint banner */}
      {isAdminOrMod && isDrawing && (
        <div className={styles.container} style={{ top: 70, right: 16 }}>
          <div className={styles.hintBanner}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {!startPoint
                ? `📍 ${t("planKlappen", "drawStep1Hint", "1. Ecke auf dem Plan anklicken (ESC zum Abbrechen)")}`
                : `🎯 ${t("planKlappen", "drawStep2Hint", "2. Ecke anklicken (Rechteck fertigstellen)")}`}
            </span>
            <button
              type="button"
              className={styles.hintCancelBtn}
              onClick={() => {
                setIsDrawing(false);
                setStartPoint(null);
                setHoverPoint(null);
              }}
            >
              ✕ {t("planKlappen", "cancel", "Abbrechen")}
            </button>
          </div>
        </div>
      )}

      {/* Drawing Preview Rectangle */}
      {isDrawing && startPoint && hoverPoint && (() => {
        const xMin = Math.min(startPoint.x, hoverPoint.x);
        const yMin = Math.min(startPoint.y, hoverPoint.y);
        const xMax = Math.max(startPoint.x, hoverPoint.x);
        const yMax = Math.max(startPoint.y, hoverPoint.y);

        const pTopLeft = planPxToLatLng(xMin, yMin);
        const pTopRight = planPxToLatLng(xMax, yMin);
        const pBottomRight = planPxToLatLng(xMax, yMax);
        const pBottomLeft = planPxToLatLng(xMin, yMax);

        return (
          <>
            <PolygonAny
              positions={[pTopLeft, pTopRight, pBottomRight, pBottomLeft]}
              pathOptions={{
                color: "#f59e0b",
                weight: 2,
                dashArray: "6, 6",
                fillColor: "#f59e0b",
                fillOpacity: 0.25,
              }}
            />
            {/* Diagonal preview cross */}
            <Polyline
              positions={[pTopLeft, pBottomRight]}
              pathOptions={{ color: "#d97706", weight: 1.5, dashArray: "4, 4" }}
            />
            <Polyline
              positions={[pTopRight, pBottomLeft]}
              pathOptions={{ color: "#d97706", weight: 1.5, dashArray: "4, 4" }}
            />
          </>
        );
      })()}

      {/* Render saved Revisionsklappen */}
      {klappen.map((k) => {
        const xMin = k.x_norm * worldPxW;
        const yMin = k.y_norm * worldPxH;
        const xMax = (k.x_norm + k.w_norm) * worldPxW;
        const yMax = (k.y_norm + k.h_norm) * worldPxH;

        const pTopLeft = planPxToLatLng(xMin, yMin);
        const pTopRight = planPxToLatLng(xMax, yMin);
        const pBottomRight = planPxToLatLng(xMax, yMax);
        const pBottomLeft = planPxToLatLng(xMin, yMax);

        return (
          <React.Fragment key={k.id}>
            {/* Outer Box */}
            <PolygonAny
              positions={[pTopLeft, pTopRight, pBottomRight, pBottomLeft]}
              pathOptions={{
                color: "#d97706",
                weight: 2,
                fillColor: "#f59e0b",
                fillOpacity: 0.2,
              }}
              eventHandlers={{
                click: (e: any) => {
                  if (e?.originalEvent) e.originalEvent.stopPropagation();
                  setOpenTooltipId((prev) => (prev === k.id ? null : k.id));
                },
              }}
            >
              {openTooltipId === k.id && (
                <TooltipAny direction="top" permanent interactive>
                  <div style={{ padding: 6, minWidth: 160, color: "#1f2937" }} onClick={(e: any) => e.stopPropagation()}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#b45309", marginBottom: 2 }}>
                      🔲 {k.label || t("planKlappen", "hatchTitle", "Revisionsklappe")}
                    </div>
                    {(k.width_cm || k.height_cm) && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", marginBottom: 4 }}>
                        {t("planKlappen", "dimensions", "Maße")}: {k.width_cm ?? "?"} × {k.height_cm ?? "?"} cm
                      </div>
                    )}
                    {k.description && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                        {k.description}
                      </div>
                    )}
                    {isAdminOrMod && (
                      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditKlappe(k)}
                          style={{
                            flex: 1,
                            background: "rgba(217, 119, 6, 0.2)",
                            border: "1px solid rgba(217, 119, 6, 0.5)",
                            color: "#d97706",
                            borderRadius: 4,
                            padding: "4px 6px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                          }}
                        >
                          ✏️ {t("planKlappen", "edit", "Bearbeiten")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKlappe(k.id)}
                          style={{
                            flex: 1,
                            background: "#ef4444",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 4,
                            padding: "4px 6px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                          }}
                        >
                          🗑 {t("planKlappen", "delete", "Klappe löschen")}
                        </button>
                      </div>
                    )}
                  </div>
                </TooltipAny>
              )}
            </PolygonAny>

            {/* Inner Diagonal X Cross */}
            <Polyline
              positions={[pTopLeft, pBottomRight]}
              pathOptions={{ color: "#d97706", weight: 1.5, opacity: 0.7 }}
            />
            <Polyline
              positions={[pTopRight, pBottomLeft]}
              pathOptions={{ color: "#d97706", weight: 1.5, opacity: 0.7 }}
            />
          </React.Fragment>
        );
      })}

      {/* Modal for creating or editing a Revisionsklappe */}
      {(modalData || editingKlappe) &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className={styles.modalBackdrop}
            onClick={() => {
              setModalData(null);
              setEditingKlappe(null);
            }}
          >
            <div
              ref={modalRef}
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>
                  🔲 {editingKlappe
                    ? t("planKlappen", "editModalTitle", "Revisionsklappe bearbeiten")
                    : t("planKlappen", "modalTitle", "Neue Revisionsklappe")}
                </h3>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => {
                    setModalData(null);
                    setEditingKlappe(null);
                  }}
                  disabled={saving}
                >
                  ✕
                </button>
              </div>

              {/* Quick Presets */}
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t("planKlappen", "quickPreset", "Schnellwahl Größe (cm)")}</label>
                <div className={styles.presetGrid}>
                  {[
                    [30, 30],
                    [40, 40],
                    [50, 50],
                    [60, 60],
                    [60, 80],
                    [80, 80],
                    [100, 100],
                    [120, 60],
                  ].map(([w, h]) => (
                    <button
                      key={`${w}x${h}`}
                      type="button"
                      className={styles.presetBtn}
                      onClick={() => handleApplyPreset(w, h)}
                    >
                      {w}×{h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Dimensions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>{t("planKlappen", "width", "Breite (cm)")}</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={widthCmInput}
                    onChange={(e) => {
                      setWidthCmInput(e.target.value);
                      setLabelInput(`RK ${e.target.value}x${heightCmInput}`);
                    }}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>{t("planKlappen", "height", "Höhe (cm)")}</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={heightCmInput}
                    onChange={(e) => {
                      setHeightCmInput(e.target.value);
                      setLabelInput(`RK ${widthCmInput}x${e.target.value}`);
                    }}
                  />
                </div>
              </div>

              {/* Label */}
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t("planKlappen", "label", "Bezeichnung / Etikett")}</label>
                <input
                  type="text"
                  className={styles.input}
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="z.B. RK 60x60"
                />
              </div>

              {/* Description */}
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t("planKlappen", "description", "Beschreibung / Anmerkungen (optional)")}</label>
                <input
                  type="text"
                  className={styles.input}
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="z.B. Zugang zum Ventil / Decke"
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => {
                    setModalData(null);
                    setEditingKlappe(null);
                  }}
                  disabled={saving}
                >
                  {t("planKlappen", "cancel", "Abbrechen")}
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSaveKlappe}
                  disabled={saving}
                >
                  {saving
                    ? `⏳ ${t("planKlappen", "saving", "Speichern...")}`
                    : editingKlappe
                    ? `✓ ${t("planKlappen", "saveChanges", "Änderungen speichern")}`
                    : `💾 ${t("planKlappen", "save", "Speichern")}`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
