"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import L from "leaflet";
import { useLanguage } from "@/contexts/LanguageContext";

export type PlanLayersVisibility = {
  measurements: boolean;
  klappen: boolean;
  photoPins: boolean;
  montageDoku: boolean;
  damage: boolean;
  bma: boolean;
  lighting: boolean;
  notlicht: boolean;
  heating: boolean;
  cables: boolean;
  kabelbahn: boolean;
  kabelauslass: boolean;
  tasks: boolean;
  abdeckung: boolean;
  anderungen: boolean;
};

export const DEFAULT_LAYERS_VISIBILITY: PlanLayersVisibility = {
  measurements: false,
  klappen: false,
  photoPins: false,
  montageDoku: false,
  damage: false,
  bma: false,
  lighting: false,
  notlicht: false,
  heating: false,
  cables: false,
  kabelbahn: false,
  kabelauslass: false,
  tasks: false,
  abdeckung: true,
  anderungen: true,
};

export type LayerCounts = {
  measurements?: number;
  klappen?: number;
  photoPins?: number;
  montageDoku?: number;
  damage?: number;
  bma?: number;
  lighting?: number;
  notlicht?: number;
  heating?: number;
  cables?: number;
  kabelbahn?: number;
  kabelauslass?: number;
  tasks?: number;
  abdeckung?: number;
  anderungen?: number;
};

type Props = {
  visibility: PlanLayersVisibility;
  onChange: (newVisibility: PlanLayersVisibility) => void;
  counts?: LayerCounts;
};

export default function PlanLayersControl({
  visibility,
  onChange,
  counts = {},
}: Props) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click or ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Prevent map drag/click when interacting with dropdown
  useEffect(() => {
    if (!dropdownRef.current) return;
    L.DomEvent.disableClickPropagation(dropdownRef.current);
    L.DomEvent.disableScrollPropagation(dropdownRef.current);
  });

  const toggleLayer = (key: keyof PlanLayersVisibility) => {
    onChange({
      ...visibility,
      [key]: !visibility[key],
    });
  };

  const setAll = (val: boolean) => {
    onChange({
      measurements: val,
      klappen: val,
      photoPins: val,
      montageDoku: val,
      damage: val,
      bma: val,
      lighting: val,
      notlicht: val,
      heating: val,
      cables: val,
      kabelbahn: val,
      kabelauslass: val,
      tasks: val,
      abdeckung: val,
      anderungen: val,
    });
  };

  const activeCount = Object.values(visibility).filter(Boolean).length;

  const layerItems: Array<{
    key: keyof PlanLayersVisibility;
    icon: string;
    label: string;
    desc: string;
    count?: number;
    color: string;
    bgBadge: string;
  }> = [
    {
      key: "anderungen",
      icon: "☁️",
      label: "Änderungen / Revisionen",
      desc: "Chmurki zmian (Revision Clouds) i opisy",
      count: counts.anderungen,
      color: "#dc2626",
      bgBadge: "#fee2e2",
    },
    {
      key: "abdeckung",
      icon: "⬜",
      label: t("planBma", "abdeckungBox", "Abdeckung"),
      desc: "Prostokąty maskujące tło planu",
      count: counts.abdeckung,
      color: "#64748b",
      bgBadge: "#f1f5f9",
    },
    {
      key: "measurements",
      icon: "📏",
      label: t("planLayers", "measurements", "Pomiary / Wymiary"),
      desc: "Linie pomiarowe, wymiary i kalibracja",
      count: counts.measurements,
      color: "#2563eb",
      bgBadge: "#dbeafe",
    },
    {
      key: "klappen",
      icon: "🔲",
      label: t("planLayers", "klappen", "Revisionsklappen"),
      desc: "Klapy rewizyjne z wymiarami",
      count: counts.klappen,
      color: "#d97706",
      bgBadge: "#fef3c7",
    },
    {
      key: "lighting",
      icon: "💡",
      label: t("planLayers", "lighting", "Oświetlenie (Lampy & LED)"),
      desc: "Lampy ogólne i paski LED Stripe",
      count: counts.lighting,
      color: "#eab308",
      bgBadge: "#fef9c3",
    },
    {
      key: "bma",
      icon: "🚨",
      label: t("planLayers", "bma", "BMA (Czujki pożarowe)"),
      desc: "D-Melder, ZWD-Melder, Sygnalizatory",
      count: counts.bma,
      color: "#ef4444",
      bgBadge: "#fee2e2",
    },
    {
      key: "notlicht",
      icon: "🟢",
      label: t("planLayers", "notlicht", "Notbeleuchtung & Pikto"),
      desc: "Oświetlenie awaryjne i piktogramy",
      count: counts.notlicht,
      color: "#16a34a",
      bgBadge: "#dcfce7",
    },
    {
      key: "heating",
      icon: "❄️",
      label: t("planLayers", "heating", "Heizung & Wärmepumpen / Geräte"),
      desc: "Pompy ciepła (Innen/Außen), promienniki i sterowania",
      count: counts.heating,
      color: "#0284c7",
      bgBadge: "#e0f2fe",
    },
    {
      key: "cables",
      icon: "🔌",
      label: t("planLayers", "cables", "Kabel & Verbindungen / Schemas"),
      desc: "Schematy połączeń urządzeń i wolne przewody",
      count: counts.cables,
      color: "#3b82f6",
      bgBadge: "#dbeafe",
    },
    {
      key: "kabelbahn",
      icon: "🪜",
      label: t("planLayers", "kabelbahn", "Kabelbahn (Trasy)"),
      desc: "Trasy kablowe i drabinki",
      count: counts.kabelbahn,
      color: "#059669",
      bgBadge: "#d1fae5",
    },
    {
      key: "kabelauslass",
      icon: "⚡",
      label: t("planLayers", "kabelauslass", "Kabelauslass"),
      desc: "Wypusty kablowe",
      count: counts.kabelauslass,
      color: "#475569",
      bgBadge: "#f1f5f9",
    },
    {
      key: "photoPins",
      icon: "📷",
      label: t("planLayers", "photoPins", "Foto-Pins (Zdjęcia / Lampy)"),
      desc: "Punkty ze zdjęciami lamp i detali",
      count: counts.photoPins,
      color: "#0284c7",
      bgBadge: "#e0f2fe",
    },
    {
      key: "montageDoku",
      icon: "🛠️",
      label: t("planLayers", "montageDoku", "Montage-Doku (Montaż)"),
      desc: "Zdjęcia montażu ze znakiem wodnym (data/godz.)",
      count: counts.montageDoku,
      color: "#8b5cf6",
      bgBadge: "#ede9fe",
    },
    {
      key: "damage",
      icon: "⚠️",
      label: t("planLayers", "damage", "Beschädigung (Uszkodzenia)"),
      desc: "Zdjęcia uszkodzeń i szkód z datą i godziną",
      count: counts.damage,
      color: "#ef4444",
      bgBadge: "#fee2e2",
    },
    {
      key: "tasks",
      icon: "📌",
      label: t("planLayers", "tasks", "Zadania & Pytania"),
      desc: "Punkty usterek i zadań montażowych",
      count: counts.tasks,
      color: "#0284c7",
      bgBadge: "#e0f2fe",
    },
  ];

  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const updateSlot = () => {
      const el =
        document.getElementById("plan-measurement-toolbar-left") ||
        document.getElementById("plan-external-top-toolbar");
      if (el) setToolbarSlot(el);
    };
    updateSlot();
    const timer = setTimeout(updateSlot, 100);
    return () => clearTimeout(timer);
  }, []);

  const updatePopoverPos = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const top = rect.bottom + 6;
      let left = rect.left;
      if (left + 320 > window.innerWidth) {
        left = Math.max(10, window.innerWidth - 330);
      }
      setPopoverPos({ top, left });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePopoverPos();
      window.addEventListener("resize", updatePopoverPos);
      window.addEventListener("scroll", updatePopoverPos, true);
      return () => {
        window.removeEventListener("resize", updatePopoverPos);
        window.removeEventListener("scroll", updatePopoverPos, true);
      };
    }
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const top = rect.bottom + 6;
      let left = rect.left;
      if (left + 320 > window.innerWidth) {
        left = Math.max(10, window.innerWidth - 330);
      }
      setPopoverPos({ top, left });
    }
    setIsOpen((prev) => !prev);
  };

  const buttonElement = (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleOpen}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "5px 10px",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: 700,
        cursor: "pointer",
        border: isOpen || activeCount > 0 ? "1px solid #3b82f6" : "1px solid rgba(0, 0, 0, 0.15)",
        background: isOpen ? "#2563eb" : activeCount > 0 ? "#eff6ff" : "#ffffff",
        color: isOpen ? "#ffffff" : activeCount > 0 ? "#1d4ed8" : "#1f2937",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
        userSelect: "none",
        flexShrink: 0,
        boxShadow: isOpen
          ? "0 0 8px rgba(37, 99, 235, 0.4)"
          : "0 1px 2px rgba(0, 0, 0, 0.05)",
      }}
      title={t("planLayers", "panelTitle", "Warstwy na planie")}
    >
      <span style={{ fontSize: "13px" }}>📑</span>
      <span>{t("planLayers", "layersTitle", "Warstwy")}</span>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 800,
          padding: "1px 5px",
          borderRadius: "10px",
          background: isOpen ? "rgba(255,255,255,0.25)" : activeCount > 0 ? "#3b82f6" : "#e2e8f0",
          color: isOpen ? "#ffffff" : activeCount > 0 ? "#ffffff" : "#475569",
          marginLeft: 2,
        }}
      >
        {activeCount}
      </span>
    </button>
  );

  const popoverElement = isOpen && typeof document !== "undefined" ? (
    ReactDOM.createPortal(
      <>
        {/* Transparent backdrop to catch outside clicks anywhere on screen */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999998,
            background: "transparent",
          }}
          onClick={() => setIsOpen(false)}
        />
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: popoverPos ? `${popoverPos.top}px` : "120px",
            left: popoverPos ? `${popoverPos.left}px` : "20px",
            width: "310px",
            background: "rgba(15, 23, 42, 0.97)",
            backdropFilter: "blur(16px)",
            color: "#f8fafc",
            borderRadius: "14px",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            boxShadow: "0 20px 45px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0,0,0,0.4)",
            padding: "12px",
            zIndex: 9999999,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "13px", color: "#f8fafc", display: "flex", alignItems: "center", gap: 6 }}>
                <span>📑</span>
                <span>{t("planLayers", "panelTitle", "Warstwy na planie")}</span>
              </div>
              <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "1px" }}>
                {t("planLayers", "panelSub", "Włącz lub wyłącz widoczność elementów")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "14px",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Quick Actions */}
          <div style={{ display: "flex", gap: "6px", paddingTop: "2px" }}>
            <button
              type="button"
              onClick={() => setAll(true)}
              style={{
                flex: 1,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                background: "rgba(59, 130, 246, 0.2)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                color: "#60a5fa",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              ✓ {t("planLayers", "showAll", "Pokaż wszystkie")}
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              style={{
                flex: 1,
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                color: "#f87171",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              ✕ {t("planLayers", "hideAll", "Ukryj wszystkie")}
            </button>
          </div>

          {/* Layer List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "360px", overflowY: "auto", paddingRight: "2px" }}>
            {layerItems.map((item) => {
              const isChecked = visibility[item.key];
              return (
                <div
                  key={item.key}
                  onClick={() => toggleLayer(item.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background: isChecked ? "rgba(255, 255, 255, 0.08)" : "transparent",
                    border: isChecked ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid transparent",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isChecked) e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isChecked) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <span style={{ fontSize: "16px", flexShrink: 0 }}>{item.icon}</span>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: isChecked ? "#f8fafc" : "#94a3b8", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ wordBreak: "break-word" }}>{item.label}</span>
                        {typeof item.count === "number" && item.count > 0 && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 800,
                              padding: "0 5px",
                              borderRadius: "6px",
                              background: item.bgBadge,
                              color: item.color,
                              flexShrink: 0,
                            }}
                          >
                            {item.count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div
                    style={{
                      width: "36px",
                      height: "20px",
                      borderRadius: "10px",
                      background: isChecked ? "#22c55e" : "#334155",
                      position: "relative",
                      transition: "background 0.2s ease",
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: "#ffffff",
                        position: "absolute",
                        top: "2px",
                        left: isChecked ? "18px" : "2px",
                        transition: "left 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>,
      document.body
    )
  ) : null;

  if (!toolbarSlot || typeof document === "undefined") {
    return null;
  }

  return (
    <>
      {ReactDOM.createPortal(buttonElement, toolbarSlot)}
      {popoverElement}
    </>
  );
}

