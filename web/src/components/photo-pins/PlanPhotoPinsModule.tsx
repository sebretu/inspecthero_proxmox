"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useLanguage } from "@/contexts/LanguageContext";
import PhotoLightbox from "@/components/PhotoLightbox";
import { getToken, getApiUrl } from "@/lib/apiClient";
import { applyWatermark } from "@/lib/watermark";
import { Capacitor } from "@capacitor/core";
import { CameraService } from "@/lib/native";
import styles from "./PlanPhotoPins.module.css";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

export type PhotoPinRow = {
  id: string;
  plan_id: string;
  x_norm: number;
  y_norm: number;
  image_url?: string | null;
  storage_path?: string | null;
  description?: string | null;
  pin_type?: "photo" | "montage" | string | null;
  created_by?: string | null;
  created_at?: string;
  author_name?: string | null;
};

const CRS = L.CRS.Simple;
const MarkerAny: any = Marker;
const TooltipAny: any = Tooltip;

export default function PlanPhotoPinsModule({
  planId,
  meta,
  currentUserId,
  currentUserRole,
  isPhotoPinsVisible = true,
  isMontageDokuVisible = true,
  isDamageVisible = true,
  onCountsChange,
  onEnsurePhotoPinsVisible,
  onEnsureMontageDokuVisible,
  onEnsureDamageVisible,
}: {
  planId: string;
  meta: Meta;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  isPhotoPinsVisible?: boolean;
  isMontageDokuVisible?: boolean;
  isDamageVisible?: boolean;
  onCountsChange?: (counts: { photoPins: number; montageDoku: number; damage?: number }) => void;
  onEnsurePhotoPinsVisible?: () => void;
  onEnsureMontageDokuVisible?: () => void;
  onEnsureDamageVisible?: () => void;
}) {
  const { t } = useLanguage();
  const map = useMap();

  const [pins, setPins] = useState<PhotoPinRow[]>([]);
  const [placingType, setPlacingType] = useState<"photo" | "montage" | "damage" | null>(null);
  const [modalState, setModalState] = useState<{
    coords: { x_norm: number; y_norm: number };
    pinType: "photo" | "montage" | "damage";
  } | null>(null);

  // Modal form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fullscreen PhotoLightbox state
  const [activeLightboxPin, setActiveLightboxPin] = useState<PhotoPinRow | null>(null);
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  useEffect(() => {
    if (toolbarRef.current) {
      L.DomEvent.disableClickPropagation(toolbarRef.current);
      L.DomEvent.disableScrollPropagation(toolbarRef.current);
    }
  }, []);

  // Sync placement state to map & window so other click listeners (e.g. task creation) are blocked
  useEffect(() => {
    const isPlacing = !!placingType;
    if (map) (map as any)._isPhotoPinActive = isPlacing;
    if (typeof window !== "undefined") (window as any)._isPhotoPinActive = isPlacing;
    return () => {
      if (map) (map as any)._isPhotoPinActive = false;
      if (typeof window !== "undefined") (window as any)._isPhotoPinActive = false;
    };
  }, [map, placingType]);

  // Load photo pins from API on mount and planId change
  const loadPins = useCallback(async () => {
    if (!planId) return;
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers["X-App-Token"] = token;
      }

      const res = await fetch(getApiUrl(`/api/plans/${planId}/photos`), { headers });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setPins(json.data);
      }
    } catch {
      // ignore network errors
    }
  }, [planId]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  const onCountsChangeRef = useRef(onCountsChange);
  onCountsChangeRef.current = onCountsChange;

  useEffect(() => {
    const photoCount = pins.filter((p) => (p.pin_type || "photo") === "photo").length;
    const montageCount = pins.filter((p) => p.pin_type === "montage").length;
    const damageCount = pins.filter((p) => p.pin_type === "damage").length;
    onCountsChangeRef.current?.({ photoPins: photoCount, montageDoku: montageCount, damage: damageCount });
  }, [pins]);

  // ESC key handler to cancel placement, close tooltip/lightbox or close modal/menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenTooltipId(null);
        setActiveLightboxPin(null);
        setMenuOpen(false);
        if (modalState) {
          handleCloseModal();
        } else if (placingType) {
          setPlacingType(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [placingType, modalState]);

  const [currentZoom, setCurrentZoom] = useState<number>(2);
  const [watermarking, setWatermarking] = useState(false);
  const canCreate = !!currentUserId || (currentUserRole || "").toUpperCase() === "ADMIN";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const toggleMenu = () => {
    if (!menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const top = rect.bottom + 6;
      let left = rect.left;
      if (left + 290 > window.innerWidth) {
        left = Math.max(10, window.innerWidth - 300);
      }
      setMenuPos({ top, left });
    }
    setMenuOpen((prev) => !prev);
  };

  useEffect(() => {
    if (menuOpen) {
      const updatePos = () => {
        if (menuButtonRef.current) {
          const rect = menuButtonRef.current.getBoundingClientRect();
          const top = rect.bottom + 6;
          let left = rect.left;
          if (left + 290 > window.innerWidth) {
            left = Math.max(10, window.innerWidth - 300);
          }
          setMenuPos({ top, left });
        }
      };
      window.addEventListener("resize", updatePos);
      window.addEventListener("scroll", updatePos, true);
      return () => {
        window.removeEventListener("resize", updatePos);
        window.removeEventListener("scroll", updatePos, true);
      };
    }
  }, [menuOpen]);

  // Map events for clicking to place a photo pin and zoom tracking
  function MapEventsHandler() {
    const map = useMapEvents({
      zoomend: () => {
        setCurrentZoom(map.getZoom());
      },
      click: (e: any) => {
        if (!placingType || !canCreate) return;

        if (e.originalEvent) {
          (e.originalEvent as any)._photoPinHandled = true;
          e.originalEvent.stopImmediatePropagation?.();
          e.originalEvent.stopPropagation?.();
          e.originalEvent.preventDefault?.();
        }
        (e as any)._photoPinHandled = true;

        const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);
        const x_norm = Math.max(0, Math.min(1, p.x / worldPxW));
        const y_norm = Math.max(0, Math.min(1, p.y / worldPxH));

        setModalState({
          coords: { x_norm, y_norm },
          pinType: placingType,
        });
        setPlacingType(null);
      },
    });

    useEffect(() => {
      if (map) setCurrentZoom(map.getZoom());
    }, [map]);

    return null;
  }

  const handleCloseModal = () => {
    setModalState(null);
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setDescription("");
    setError(null);
    setWatermarking(false);
    setUploading(false);
    setSaving(false);
  };

  const processSelectedFile = async (file: File) => {
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Set selectedFile immediately so the save button is active right away
    setSelectedFile(file);
    try {
      setPreviewUrl(URL.createObjectURL(file));
    } catch {}

    // Apply watermark for Montage-Doku and Beschädigung pins
    if (modalState?.pinType === "montage" || modalState?.pinType === "damage") {
      setWatermarking(true);
      setError(null);
      try {
        const watermarkedFile = await applyWatermark(file, null, "de");
        setSelectedFile(watermarkedFile);
        try {
          setPreviewUrl(URL.createObjectURL(watermarkedFile));
        } catch {}
      } catch (err: any) {
        console.warn("Watermarking fallback:", err);
      } finally {
        setWatermarking(false);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await processSelectedFile(file);

    // Reset input values ONLY after reading the file so Chromium doesn't detach the file descriptor
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleTakePhoto = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        setWatermarking(true);
        setError(null);
        const captured = await CameraService.getPhotoForUpload("camera");
        if (!captured || !captured.blob) {
          setWatermarking(false);
          return;
        }
        const file = new File([captured.blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
        await processSelectedFile(file);
      } catch (err: any) {
        console.error("Capacitor camera error, fallback to HTML file input:", err);
        cameraInputRef.current?.click();
      } finally {
        setWatermarking(false);
      }
    } else {
      cameraInputRef.current?.click();
    }
  };

  const handleSelectGallery = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        setWatermarking(true);
        setError(null);
        const captured = await CameraService.getPhotoForUpload("gallery");
        if (!captured || !captured.blob) {
          setWatermarking(false);
          return;
        }
        const file = new File([captured.blob], `gallery_${Date.now()}.jpg`, { type: "image/jpeg" });
        await processSelectedFile(file);
      } catch (err: any) {
        console.error("Capacitor gallery error, fallback to HTML file input:", err);
        galleryInputRef.current?.click();
      } finally {
        setWatermarking(false);
      }
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handleSavePin = async () => {
    if (!modalState) return;
    if (!selectedFile && !description.trim()) {
      setError(t("planPhotoPins", "photoOrDescriptionRequired", "Wymagane jest zdjęcie lub opis"));
      return;
    }

    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError("Brak aktywnej sesji użytkownika");
        return;
      }

      let imageUrl: string | null = null;
      let storagePath: string | null = null;

      // Step 1: Upload photo if selected
      if (selectedFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);

        const uploadRes = await fetch(getApiUrl("/api/upload"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-App-Token": token,
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          let errMsg = t("planPhotoPins", "uploadFailed", "Nie udało się przesłać zdjęcia");
          try {
            const errJson = await uploadRes.json();
            if (errJson?.error?.message) errMsg = errJson.error.message;
          } catch {}
          throw new Error(errMsg);
        }

        const uploadJson = await uploadRes.json();
        if (!uploadJson.ok || !uploadJson.data?.url) {
          throw new Error(uploadJson.error?.message || t("planPhotoPins", "uploadFailed", "Nie udało się przesłać zdjęcia"));
        }

        imageUrl = uploadJson.data.url;
        storagePath = uploadJson.data.storage_path || null;
        setUploading(false);
      }

      // Step 2: Save photo pin record to DB
      setSaving(true);

      const saveRes = await fetch(getApiUrl(`/api/plans/${planId}/photos`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-App-Token": token,
        },
        body: JSON.stringify({
          x_norm: modalState.coords.x_norm,
          y_norm: modalState.coords.y_norm,
          image_url: imageUrl,
          storage_path: storagePath,
          description: description.trim() || null,
          pin_type: modalState.pinType,
        }),
      });

      if (!saveRes.ok) {
        let errText = "";
        try {
          const errJson = await saveRes.json();
          errText = errJson?.error || errJson?.message;
        } catch {
          errText = await saveRes.text();
        }
        throw new Error(errText || t("planPhotoPins", "saveFailed", "Nie udało się zapisać punktu"));
      }

      const saveJson = await saveRes.json();
      if (saveJson.ok && saveJson.data) {
        setPins((prev) => [...prev, saveJson.data]);
        handleCloseModal();
      } else {
        throw new Error(saveJson.error || t("planPhotoPins", "saveFailed", "Nie udało się zapisać punktu"));
      }
    } catch (err: any) {
      setError(err?.message || "Wystąpił błąd podczas zapisywania");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const handleDeletePin = async (pinId: string) => {
    if (!window.confirm(t("planPhotoPins", "deletePinConfirm", "Czy na pewno chcesz usunąć ten punkt ze zdjęciem?"))) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(getApiUrl(`/api/plans/${planId}/photos?photoId=${encodeURIComponent(pinId)}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-App-Token": token,
        },
      });

      if (res.ok) {
        setPins((prev) => prev.filter((p) => p.id !== pinId));
        if (openTooltipId === pinId) setOpenTooltipId(null);
      }
    } catch {
      // ignore
    }
  };

  let pinSize = 30;
  let emojiSize = 14;

  if (currentZoom <= 0) {
    pinSize = 8;
    emojiSize = 0;
  } else if (currentZoom === 1) {
    pinSize = 12;
    emojiSize = 6;
  } else if (currentZoom === 2) {
    pinSize = 16;
    emojiSize = 8;
  } else if (currentZoom === 3) {
    pinSize = 22;
    emojiSize = 11;
  } else if (currentZoom === 4) {
    pinSize = 26;
    emojiSize = 13;
  } else {
    pinSize = 32;
    emojiSize = 15;
  }

  const iconAnchor = Math.round(pinSize / 2);

  // Icon for generic Foto-Pin (Blue / Classic)
  const getPhotoPinIcon = useCallback((hasImage: boolean) => {
    const emoji = hasImage ? "📷" : "📝";
    const bgGradient = "linear-gradient(135deg, #0284c7, #0369a1)";
    return L.divIcon({
      className: "photo-pin-marker-generic",
      html: `
        <div style="
          width: ${pinSize}px;
          height: ${pinSize}px;
          border-radius: 50%;
          background: ${bgGradient};
          border: ${pinSize <= 10 ? "1px" : "2px"} solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${emojiSize}px;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        ">
          ${emojiSize > 0 ? emoji : ""}
        </div>
      `,
      iconSize: [pinSize, pinSize],
      iconAnchor: [iconAnchor, iconAnchor],
    });
  }, [pinSize, iconAnchor, emojiSize]);

  // Icon for Montage-Doku (Purple / Gold badge with tool icon)
  const getMontagePinIcon = useCallback((montageIndex: number) => {
    const bgGradient = "linear-gradient(135deg, #8b5cf6, #6d28d9)";
    const size = Math.round(pinSize * 1.1);
    const anchor = Math.round(size / 2);
    return L.divIcon({
      className: "photo-pin-marker-montage",
      html: `
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 8px;
          background: ${bgGradient};
          border: 2px solid #fbbf24;
          box-shadow: 0 3px 8px rgba(109, 40, 217, 0.5), 0 1px 3px rgba(0,0,0,0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        ">
          <span style="font-size: ${Math.max(8, emojiSize - 1)}px; line-height: 1;">🛠️</span>
          ${size >= 24 ? `<span style="font-size: 8px; font-weight: 900; color: #fef08a; line-height: 1; margin-top: 1px;">#${montageIndex}</span>` : ""}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
    });
  }, [pinSize, emojiSize]);

  // Icon for Beschädigung (Red / Amber warning badge with hazard icon)
  const getDamagePinIcon = useCallback((damageIndex: number) => {
    const bgGradient = "linear-gradient(135deg, #ef4444, #b91c1c)";
    const size = Math.round(pinSize * 1.1);
    const anchor = Math.round(size / 2);
    return L.divIcon({
      className: "photo-pin-marker-damage",
      html: `
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 8px;
          background: ${bgGradient};
          border: 2px solid #fee2e2;
          box-shadow: 0 3px 8px rgba(220, 38, 38, 0.6), 0 1px 3px rgba(0,0,0,0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        ">
          <span style="font-size: ${Math.max(8, emojiSize - 1)}px; line-height: 1;">⚠️</span>
          ${size >= 24 ? `<span style="font-size: 8px; font-weight: 900; color: #ffffff; line-height: 1; margin-top: 1px;">#${damageIndex}</span>` : ""}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
    });
  }, [pinSize, emojiSize]);

  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updateSlot = () => {
      const el = document.getElementById("plan-measurement-toolbar-left");
      if (el) setToolbarSlot(el);
    };
    updateSlot();
    const timer = setTimeout(updateSlot, 100);
    return () => clearTimeout(timer);
  }, []);

  const montagePins = useMemo(() => {
    return pins.filter((p) => p.pin_type === "montage");
  }, [pins]);

  const damagePins = useMemo(() => {
    return pins.filter((p) => p.pin_type === "damage");
  }, [pins]);

  const photoPins = useMemo(() => {
    return pins.filter((p) => (p.pin_type || "photo") === "photo");
  }, [pins]);

  const toolbarButtons = (
    <div style={{ display: "inline-flex", alignItems: "center", flexWrap: "nowrap", gap: "4px" }}>
      {/* If a placement mode is active, show the active button with quick cancel */}
      {placingType ? (
        <>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnActive}`}
            onClick={() => setPlacingType(null)}
            title={t("planPhotoPins", "cancel", "Anuluj tryb wstawiania")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontWeight: 700,
              background: placingType === "montage" ? "#8b5cf6" : placingType === "damage" ? "#ef4444" : "#0284c7",
              color: "#ffffff",
              borderColor: placingType === "montage" ? "#8b5cf6" : placingType === "damage" ? "#ef4444" : "#0284c7",
              boxShadow: placingType === "montage"
                ? "0 0 8px rgba(139, 92, 246, 0.4)"
                : placingType === "damage"
                ? "0 0 8px rgba(239, 68, 68, 0.4)"
                : "0 0 8px rgba(2, 132, 199, 0.4)",
            }}
          >
            {placingType === "montage" ? "🛠️ " : placingType === "damage" ? "⚠️ " : "📷 "}
            <span>
              {placingType === "montage"
                ? t("planPhotoPins", "btnMontageDoku", "Montage-Doku")
                : placingType === "damage"
                ? t("planPhotoPins", "btnDamage", "Beschädigung")
                : t("planPhotoPins", "btnPhoto", "Foto")}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => setPlacingType(null)}
            title={t("planPhotoPins", "cancel", "Anuluj")}
            style={{ padding: "5px 8px" }}
          >
            ✕
          </button>
        </>
      ) : (
        /* Unified compact button for Photo & Documentation */
        <button
          ref={menuButtonRef}
          type="button"
          className={`${styles.btn} ${menuOpen ? styles.btnActive : ""}`}
          onClick={toggleMenu}
          title={t("planPhotoPins", "menuTitle", "Zdjęcia & Dokumentacja (Foto / Montage / Beschädigung)")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontWeight: 700,
            background: menuOpen ? "#0284c7" : "#ffffff",
            color: menuOpen ? "#ffffff" : "#1f2937",
            borderColor: menuOpen ? "#0284c7" : "rgba(0,0,0,0.15)",
          }}
        >
          📷 <span>{t("planPhotoPins", "btnPhoto", "Foto")}</span>
          <span style={{ fontSize: "9px", marginLeft: "-1px", opacity: 0.7 }}>▾</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <MapEventsHandler />

      {/* Insert buttons inside toolbar */}
      {canCreate && (
        <>
          {toolbarSlot && typeof document !== "undefined" ? (
            ReactDOM.createPortal(toolbarButtons, toolbarSlot)
          ) : (
            <div className={styles.container}>
              <div ref={toolbarRef} className={styles.toolbar}>
                {toolbarButtons}
              </div>
            </div>
          )}

          {/* Dropdown Menu Portal for Photo / Montage-Doku / Beschädigung */}
          {menuOpen && typeof document !== "undefined" && ReactDOM.createPortal(
            <>
              {/* Invisible backdrop for outside click dismiss */}
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999998,
                  background: "transparent",
                }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  position: "fixed",
                  top: menuPos ? `${menuPos.top}px` : "120px",
                  left: menuPos ? `${menuPos.left}px` : "20px",
                  width: "290px",
                  background: "rgba(15, 23, 42, 0.97)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  color: "#f8fafc",
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  boxShadow: "0 20px 45px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0,0,0,0.4)",
                  padding: "10px",
                  zIndex: 9999999,
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: "2px" }}>
                  <div style={{ fontWeight: 800, fontSize: "12px", color: "#f8fafc", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>📷</span>
                    <span>{t("planPhotoPins", "menuHeader", "Fotodokumentation")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: "2px 5px",
                      borderRadius: "4px",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Option 1: Standard Foto */}
                <div
                  onClick={() => {
                    onEnsurePhotoPinsVisible?.();
                    setPlacingType("photo");
                    setMenuOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(2, 132, 199, 0.3)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(2, 132, 199, 0.2)";
                    e.currentTarget.style.borderColor = "#0284c7";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.borderColor = "rgba(2, 132, 199, 0.3)";
                  }}
                >
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#0284c7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    flexShrink: 0,
                  }}>
                    📷
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#f8fafc" }}>
                      {t("planPhotoPins", "btnPhoto", "Foto-Pin")}
                    </div>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      {t("planPhotoPins", "photoSub", "Standard-Foto (Lampen, Zähler, Details)")}
                    </div>
                  </div>
                </div>

                {/* Option 2: Montage-Doku */}
                <div
                  onClick={() => {
                    onEnsureMontageDokuVisible?.();
                    setPlacingType("montage");
                    setMenuOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
                    e.currentTarget.style.borderColor = "#8b5cf6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
                  }}
                >
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#8b5cf6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    flexShrink: 0,
                  }}>
                    🛠️
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#c4b5fd" }}>
                      {t("planPhotoPins", "btnMontageDoku", "Montage-Doku")}
                    </div>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      {t("planPhotoPins", "montageSub", "Montagedoku mit Datum- & Uhrzeit-Wasserzeichen")}
                    </div>
                  </div>
                </div>

                {/* Option 3: Beschädigung */}
                <div
                  onClick={() => {
                    onEnsureDamageVisible?.();
                    setPlacingType("damage");
                    setMenuOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                    e.currentTarget.style.borderColor = "#ef4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                  }}
                >
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    flexShrink: 0,
                  }}>
                    ⚠️
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#fca5a5" }}>
                      {t("planPhotoPins", "btnDamage", "Beschädigung")}
                    </div>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      {t("planPhotoPins", "damageSub", "Schadensdoku mit Datum- & Uhrzeit-Wasserzeichen")}
                    </div>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}

          {/* Hint banner when placement mode is active */}
          {placingType && (
            <div className={styles.container} style={{ top: 62 }}>
              <div className={styles.hintBanner}>
                <span>
                  ℹ️ {placingType === "damage"
                    ? t("planPhotoPins", "clickDamageHint", "Kliknij na planie, aby wstawić punkt uszkodzenia (ESC anuluje)")
                    : placingType === "montage"
                    ? t("planPhotoPins", "clickMontageHint", "Kliknij na planie, aby wstawić punkt Montage-Doku (ESC anuluje)")
                    : t("planPhotoPins", "clickPhotoHint", "Kliknij na planie, aby wstawić zdjęcie / Foto-Pin (ESC anuluje)")}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Render standard Foto-Pins */}
      {(isPhotoPinsVisible !== false || placingType === "photo") &&
        photoPins.map((pin) => {
          const ll = CRS.pointToLatLng(
            L.point(pin.x_norm * worldPxW, pin.y_norm * worldPxH),
            meta.maxZoom
          );

          const canDelete =
            (currentUserRole || "").toUpperCase() === "ADMIN" ||
            (!!currentUserId && pin.created_by === currentUserId);
          const hasImage = !!pin.image_url;

          return (
            <MarkerAny
              key={pin.id}
              position={ll}
              icon={getPhotoPinIcon(hasImage)}
              eventHandlers={{
                click: () => {
                  setOpenTooltipId((prev) => (prev === pin.id ? null : pin.id));
                },
              }}
            >
              {openTooltipId === pin.id && (
                <TooltipAny direction="top" offset={[0, -20]} opacity={1} permanent interactive>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 220,
                      padding: 8,
                      background: "#0f172a",
                      color: "#f8fafc",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.15)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTooltipId(null);
                      }}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#1e293b",
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: "#f8fafc",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                      }}
                    >
                      ✕
                    </button>

                    <div style={{ fontSize: 10, fontWeight: 700, color: "#38bdf8", marginBottom: 4, textTransform: "uppercase" }}>
                      📷 {t("planPhotoPins", "photoPinBadge", "Foto-Pin (Zdjęcie)")}
                    </div>

                    {hasImage && (
                      <div
                        onClick={() => {
                          setOpenTooltipId(null);
                          setActiveLightboxPin(pin);
                        }}
                        style={{
                          cursor: "pointer",
                          position: "relative",
                          borderRadius: 8,
                          overflow: "hidden",
                          aspectRatio: "16 / 9",
                          background: "#000",
                          marginBottom: 8,
                        }}
                      >
                        <img
                          src={pin.image_url!}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 4,
                            right: 4,
                            background: "rgba(0,0,0,0.6)",
                            color: "white",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          🔍
                        </div>
                      </div>
                    )}

                    {pin.description && (
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.35,
                          color: "#e2e8f0",
                          marginBottom: 6,
                          fontWeight: 500,
                          wordBreak: "break-word",
                        }}
                      >
                        {pin.description}
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: 10,
                        color: "#94a3b8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                        paddingTop: 6,
                        marginTop: 4,
                      }}
                    >
                      <span>
                        {pin.author_name ? `👤 ${pin.author_name}` : pin.created_at ? new Date(pin.created_at).toLocaleDateString() : ""}
                      </span>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeletePin(pin.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: "2px 4px",
                          }}
                          title={t("planPhotoPins", "deletePin", "Usuń punkt")}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </TooltipAny>
              )}
            </MarkerAny>
          );
        })}

      {/* Render Montage-Doku Pins */}
      {(isMontageDokuVisible !== false || placingType === "montage") &&
        montagePins.map((pin, idx) => {
          const ll = CRS.pointToLatLng(
            L.point(pin.x_norm * worldPxW, pin.y_norm * worldPxH),
            meta.maxZoom
          );

          const canDelete =
            (currentUserRole || "").toUpperCase() === "ADMIN" ||
            (!!currentUserId && pin.created_by === currentUserId);
          const hasImage = !!pin.image_url;

          return (
            <MarkerAny
              key={pin.id}
              position={ll}
              icon={getMontagePinIcon(idx + 1)}
              eventHandlers={{
                click: () => {
                  setOpenTooltipId((prev) => (prev === pin.id ? null : pin.id));
                },
              }}
            >
              {openTooltipId === pin.id && (
                <TooltipAny direction="top" offset={[0, -22]} opacity={1} permanent interactive>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 230,
                      padding: 8,
                      background: "#1e1b4b",
                      color: "#f8fafc",
                      borderRadius: 12,
                      border: "1px solid rgba(139, 92, 246, 0.4)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTooltipId(null);
                      }}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#312e81",
                        border: "1px solid rgba(255,255,255,0.3)",
                        color: "#f8fafc",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                      }}
                    >
                      ✕
                    </button>

                    <div style={{ fontSize: 10, fontWeight: 800, color: "#c084fc", marginBottom: 4 }}>
                      <span>🛠️ MONTAGE-DOKU #{idx + 1}</span>
                    </div>

                    {hasImage && (
                      <div
                        onClick={() => {
                          setOpenTooltipId(null);
                          setActiveLightboxPin(pin);
                        }}
                        style={{
                          cursor: "pointer",
                          position: "relative",
                          borderRadius: 8,
                          overflow: "hidden",
                          aspectRatio: "16 / 9",
                          background: "#000",
                          marginBottom: 8,
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <img
                          src={pin.image_url!}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 4,
                            right: 4,
                            background: "rgba(0,0,0,0.7)",
                            color: "#fbbf24",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          🔍 HD
                        </div>
                      </div>
                    )}

                    {pin.description && (
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.35,
                          color: "#e2e8f0",
                          marginBottom: 6,
                          fontWeight: 500,
                          wordBreak: "break-word",
                        }}
                      >
                        {pin.description}
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: 10,
                        color: "#a5b4fc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                        paddingTop: 6,
                        marginTop: 4,
                      }}
                    >
                      <span>
                        {pin.author_name ? `👤 ${pin.author_name}` : pin.created_at ? new Date(pin.created_at).toLocaleDateString() : ""}
                      </span>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeletePin(pin.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: "2px 4px",
                          }}
                          title={t("planPhotoPins", "deletePin", "Usuń punkt")}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </TooltipAny>
              )}
            </MarkerAny>
          );
        })}

      {/* Render Beschädigung Pins */}
      {(isDamageVisible !== false || placingType === "damage") &&
        damagePins.map((pin, idx) => {
          const ll = CRS.pointToLatLng(
            L.point(pin.x_norm * worldPxW, pin.y_norm * worldPxH),
            meta.maxZoom
          );

          const canDelete =
            (currentUserRole || "").toUpperCase() === "ADMIN" ||
            (!!currentUserId && pin.created_by === currentUserId);
          const hasImage = !!pin.image_url;

          return (
            <MarkerAny
              key={pin.id}
              position={ll}
              icon={getDamagePinIcon(idx + 1)}
              eventHandlers={{
                click: () => {
                  setOpenTooltipId((prev) => (prev === pin.id ? null : pin.id));
                },
              }}
            >
              {openTooltipId === pin.id && (
                <TooltipAny direction="top" offset={[0, -22]} opacity={1} permanent interactive>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 230,
                      padding: 8,
                      background: "#450a0a",
                      color: "#f8fafc",
                      borderRadius: 12,
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTooltipId(null);
                      }}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#7f1d1d",
                        border: "1px solid rgba(255,255,255,0.3)",
                        color: "#f8fafc",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                      }}
                    >
                      ✕
                    </button>

                    <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171", marginBottom: 4 }}>
                      <span>⚠️ BESCHÄDIGUNG #{idx + 1}</span>
                    </div>

                    {hasImage && (
                      <div
                        onClick={() => {
                          setOpenTooltipId(null);
                          setActiveLightboxPin(pin);
                        }}
                        style={{
                          cursor: "pointer",
                          position: "relative",
                          borderRadius: 8,
                          overflow: "hidden",
                          aspectRatio: "16 / 9",
                          background: "#000",
                          marginBottom: 8,
                        }}
                      >
                        <img
                          src={pin.image_url!}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 4,
                            right: 4,
                            background: "rgba(0,0,0,0.6)",
                            color: "white",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          🔍
                        </div>
                      </div>
                    )}

                    {pin.description && (
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.35,
                          color: "#fef2f2",
                          marginBottom: 6,
                          fontWeight: 500,
                          wordBreak: "break-word",
                        }}
                      >
                        {pin.description}
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: 10,
                        color: "#fca5a5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderTop: "1px solid rgba(255,255,255,0.15)",
                        paddingTop: 6,
                        marginTop: 4,
                      }}
                    >
                      <span>
                        {pin.author_name ? `👤 ${pin.author_name}` : pin.created_at ? new Date(pin.created_at).toLocaleDateString() : ""}
                      </span>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeletePin(pin.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: "2px 4px",
                          }}
                          title={t("planPhotoPins", "deletePin", "Usuń punkt")}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </TooltipAny>
              )}
            </MarkerAny>
          );
        })}

      {/* Modal for adding a new Photo, Montage-Doku or Beschädigung Pin */}
      {modalState &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div className={styles.modalBackdrop} onClick={handleCloseModal}>
            <div
              ref={modalRef}
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>
                  {modalState.pinType === "damage"
                    ? `⚠️ ${t("planPhotoPins", "modalDamageTitle", "Nowe uszkodzenie / Beschädigung")}`
                    : modalState.pinType === "montage"
                    ? `🛠️ ${t("planPhotoPins", "modalMontageTitle", "Nowy wpis Montage-Doku")}`
                    : `📷 ${t("planPhotoPins", "modalPhotoTitle", "Nowe zdjęcie (Foto-Pin)")}`}
                </h3>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={handleCloseModal}
                  disabled={uploading || saving || watermarking}
                >
                  ✕
                </button>
              </div>

              {/* Hidden Camera Input (triggers camera hardware) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              {/* Hidden Gallery Input (allows choosing from gallery / existing files without forcing camera) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              {watermarking ? (
                <div
                  className={styles.uploadZone}
                  style={{ opacity: 0.8, pointerEvents: "none" }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>
                    {t("planPhotoPins", "watermarking", "Nanoszenie znaku wodnego z datą i godziną...")}
                  </div>
                </div>
              ) : previewUrl ? (
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <div
                    className={styles.previewContainer}
                  >
                    <img src={previewUrl} alt="Preview" className={styles.previewImg} />
                  </div>

                  <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap", marginTop: "8px" }}>
                    <button
                      type="button"
                      className={styles.photoSourceBtn}
                      onClick={handleTakePhoto}
                      style={{ padding: "6px 12px", fontSize: "11px" }}
                    >
                      📸 {t("planPhotoPins", "takePhotoCamera", "Aparat (zrób zdjęcie)")}
                    </button>

                    <button
                      type="button"
                      className={styles.photoSourceBtn}
                      onClick={handleSelectGallery}
                      style={{ padding: "6px 12px", fontSize: "11px" }}
                    >
                      🖼️ {t("planPhotoPins", "chooseFromGallery", "Galeria (wybierz z telefonu)")}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        color: "#f87171",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      🗑 {t("planPhotoPins", "removePhoto", "Usuń zdjęcie")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.uploadZone}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>
                    {modalState.pinType === "damage" ? "⚠️" : modalState.pinType === "montage" ? "🛠️" : "📷"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>
                    {modalState.pinType === "damage"
                      ? t("planPhotoPins", "chooseDamagePhoto", "Wybierz lub zrób zdjęcie uszkodzenia")
                      : modalState.pinType === "montage"
                      ? t("planPhotoPins", "chooseMontagePhoto", "Wybierz lub zrób zdjęcie montażu")
                      : t("planPhotoPins", "choosePhoto", "Wybierz zdjęcie (lampa / detal)")}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {t("planPhotoPins", "photoOrTextHint", "Możesz dodać zdjęcie i opcjonalny opis")}
                  </div>

                  {/* Dual buttons for Camera and Gallery */}
                  <div className={styles.photoSourceGrid}>
                    <button
                      type="button"
                      className={`${styles.photoSourceBtn} ${
                        modalState.pinType === "damage"
                          ? styles.photoSourceBtnDamage
                          : modalState.pinType === "montage"
                          ? styles.photoSourceBtnMontage
                          : styles.photoSourceBtnPrimary
                      }`}
                      onClick={handleTakePhoto}
                    >
                      📸 <span>{t("planPhotoPins", "takePhotoCamera", "Aparat (zrób zdjęcie)")}</span>
                    </button>

                    <button
                      type="button"
                      className={styles.photoSourceBtn}
                      onClick={handleSelectGallery}
                    >
                      🖼️ <span>{t("planPhotoPins", "chooseFromGallery", "Galeria (wybierz z telefonu)")}</span>
                    </button>
                  </div>
                </div>
              )}

              <textarea
                className={styles.textarea}
                placeholder={
                  modalState.pinType === "damage"
                    ? t("planPhotoPins", "damageDescPlaceholder", "Opis uszkodzenia (np. uszkodzony kabel, pęknięcie, zniszczona lampa)...")
                    : modalState.pinType === "montage"
                    ? t("planPhotoPins", "montageDescPlaceholder", "Opis montażu (np. Montaż lampy LED, czujki, osprzętu)...")
                    : t("planPhotoPins", "photoDescPlaceholder", "Opis zdjęcia (np. Zdjęcie lampy, model, uwaga)...")
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading || saving || watermarking}
                rows={3}
              />

              {error && <div className={styles.errorText}>⚠️ {error}</div>}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={handleCloseModal}
                  disabled={uploading || saving}
                >
                  {t("planPhotoPins", "cancel", "Anuluj")}
                </button>

                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSavePin}
                  disabled={uploading || saving || (!selectedFile && !description.trim())}
                >
                  {uploading
                    ? `⏳ ${t("planPhotoPins", "uploading", "Wysyłanie zdjęcia...")}`
                    : saving
                    ? `⏳ ${t("planPhotoPins", "saving", "Zapisywanie...")}`
                    : `💾 ${t("planPhotoPins", "save", "Zapisz")}`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Fullscreen PhotoLightbox preview */}
      {activeLightboxPin && activeLightboxPin.image_url && (
        <PhotoLightbox
          url={activeLightboxPin.image_url || null}
          description={activeLightboxPin.description}
          author={activeLightboxPin.author_name}
          createdAt={activeLightboxPin.created_at}
          onClose={() => setActiveLightboxPin(null)}
        />
      )}
    </>
  );
}
