"use client";

import React, { useState, useMemo } from "react";
import { Copy, Check, MessageSquare, Mail, Download, X, Image as ImageIcon, Eye, FileText } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { MaterialPin, MaterialItem } from "@/pages/api/plans/[id]/materials";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pins: MaterialPin[];
  planTitle?: string;
  projectName?: string;
};

export default function MaterialOrderSummaryModal({
  isOpen,
  onClose,
  pins,
  planTitle = "Plan",
  projectName = "Baustelle",
}: Props) {
  const { t } = useLanguage();

  const [includePhotos, setIncludePhotos] = useState<boolean>(false);
  const [selectedMuster, setSelectedMuster] = useState<"standard" | "project" | "whatsapp" | "custom">("standard");
  const [customText, setCustomText] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"text" | "items" | "photos">("text");

  // Clean names (remove duplicate "Plan" or "Plan: " prefixes)
  const cleanProject = useMemo(() => {
    let p = (projectName || "").trim();
    if (!p || p === "Baustelle" || p === "Projekt?") {
      if (typeof window !== "undefined") {
        p = localStorage.getItem("et4u_active_project_name") || "";
      }
    }
    return p ? p.replace(/^Projekt\s*:\s*/i, "").trim() : "";
  }, [projectName]);

  const cleanPlan = useMemo(() => {
    let pt = (planTitle || "").trim();
    pt = pt.replace(/^Plan\s*:\s*/i, "").replace(/^Plan\s+/i, "").trim();
    return pt;
  }, [planTitle]);

  // Collect all items across all pins
  const allItems = useMemo(() => {
    const list: Array<MaterialItem & { pinTitle?: string; pinId: string; pinPhoto?: string | null }> = [];
    pins.forEach((p) => {
      (p.items || []).forEach((it) => {
        list.push({
          ...it,
          pinTitle: p.title || `Punkt (${Math.round(p.x_norm * 100)}%, ${Math.round(p.y_norm * 100)}%)`,
          pinId: p.id,
          pinPhoto: it.photo_url || p.photo_url || null,
        });
      });
    });
    return list;
  }, [pins]);

  // Aggregate items by name & unit
  const aggregatedItems = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        quantity: number;
        unit: string;
        article_number?: string | null;
        photos: string[];
        locations: string[];
      }
    >();

    allItems.forEach((it) => {
      const key = `${it.name.trim().toLowerCase()}__${(it.unit || "St").trim().toLowerCase()}`;
      const existing = map.get(key);
      const photo = it.photo_url || it.pinPhoto;

      if (existing) {
        existing.quantity += Number(it.quantity) || 0;
        if (photo && !existing.photos.includes(photo)) {
          existing.photos.push(photo);
        }
        if (it.pinTitle && !existing.locations.includes(it.pinTitle)) {
          existing.locations.push(it.pinTitle);
        }
      } else {
        map.set(key, {
          name: it.name.trim(),
          quantity: Number(it.quantity) || 0,
          unit: it.unit || "St",
          article_number: it.article_number || null,
          photos: photo ? [photo] : [],
          locations: it.pinTitle ? [it.pinTitle] : [],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  // Generate template text
  const generatedText = useMemo(() => {
    if (selectedMuster === "custom" && customText) {
      return customText;
    }

    const itemsFormatted =
      aggregatedItems.length > 0
        ? aggregatedItems
            .map((it) => {
              const art = it.article_number ? ` (Art.-Nr.: ${it.article_number})` : "";
              const photosStr =
                includePhotos && it.photos.length > 0 ? `\n  ↳ Foto: ${it.photos[0]}` : "";
              return `-  ${it.quantity} ${it.unit} ${it.name}${art}${photosStr}`;
            })
            .join("\n")
        : `-  (${t("planMaterials", "noMaterialsOnPlan", "Keine Materialien auf dem Plan / Brak materiałów na planie")})`;

    const allPhotosList = includePhotos
      ? Array.from(new Set(allItems.map((it) => it.photo_url || it.pinPhoto).filter(Boolean)))
      : [];

    const photosSection =
      includePhotos && allPhotosList.length > 0
        ? `\n\nFotos / Zdjęcia (${allPhotosList.length}):\n` +
          allPhotosList.map((url, idx) => `[Foto ${idx + 1}]: ${url}`).join("\n")
        : "";

    if (selectedMuster === "whatsapp") {
      const waTitle = cleanProject || cleanPlan || "Baustelle";
      return `📦 *Materialbestellung - ${waTitle}*\n\n${itemsFormatted}${photosSection}\n\nFalls etwas nicht vorrätig ist, bitte um kurze Rückmeldung.\nMit freundlichen Grüßen,\net4u Baustellen-Team`;
    }

    if (selectedMuster === "project") {
      const projStr = cleanProject ? `"${cleanProject}"` : "die Baustelle";
      const planStr = cleanPlan ? ` (${cleanPlan})` : "";
      return `Guten Tag,\nhiermit möchte ich folgendes Material für das Projekt ${projStr}${planStr} bestellen:\n\n${itemsFormatted}${photosSection}\n\nFalls etwas nicht vorrätig ist, bitte ich um Rückmeldung.\nBei Rückfragen stehe ich Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen,\net4u Baustellen-Team`;
    }

    // Default Muster 1 (clean Baustelle name without duplicate "Plan: Plan")
    const headerLine = cleanProject
      ? `Guten Tag,\nhiermit möchte ich folgendes Material für die Baustelle "${cleanProject}" bestellen:`
      : `Guten Tag,\nhiermit möchte ich folgendes Material für die Baustelle bestellen:`;

    return `${headerLine}\n\n${itemsFormatted}${photosSection}\n\nFalls etwas nicht vorrätig ist, bitte ich um Rückmeldung.\nBei Rückfragen stehe ich Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen,\net4u Baustellen-Team`;
  }, [selectedMuster, customText, aggregatedItems, includePhotos, allItems, cleanProject, cleanPlan, t]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = generatedText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(generatedText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(
      `Materialbestellung - ${cleanProject || "Baustelle"}${cleanPlan ? ` (${cleanPlan})` : ""}`
    );
    const body = encodeURIComponent(generatedText);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleDownload = () => {
    const blob = new Blob([generatedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Materialbestellung_${(cleanProject || "Baustelle").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#1e293b",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "720px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7)",
          color: "#f8fafc",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(15, 23, 42, 0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                boxShadow: "0 2px 8px rgba(245, 158, 11, 0.4)",
              }}
            >
              📦
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
                {t("planMaterials", "orderSummaryModalTitle", "Generowanie listy zamówienia (Materialbestellung)")}
              </h2>
              <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
                {cleanProject || "Baustelle"}{cleanPlan ? ` • ${cleanPlan}` : ""} • {aggregatedItems.length} {t("planMaterials", "totalMaterialsCount", "pozycji")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px",
              borderRadius: "8px",
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "10px 20px 0 20px",
            background: "rgba(15, 23, 42, 0.4)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("text")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "12px",
              fontWeight: 700,
              border: "none",
              borderBottom: activeTab === "text" ? "2px solid #f59e0b" : "2px solid transparent",
              background: "transparent",
              color: activeTab === "text" ? "#fbbf24" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            <FileText className="w-4 h-4" /> {t("planMaterials", "tabReadyMessage", "Gotowa wiadomość (Text)")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("items")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "12px",
              fontWeight: 700,
              border: "none",
              borderBottom: activeTab === "items" ? "2px solid #f59e0b" : "2px solid transparent",
              background: "transparent",
              color: activeTab === "items" ? "#fbbf24" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            <Eye className="w-4 h-4" /> {t("planMaterials", "tabTableItems", "Tabelarycznie")} ({aggregatedItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("photos")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "12px",
              fontWeight: 700,
              border: "none",
              borderBottom: activeTab === "photos" ? "2px solid #f59e0b" : "2px solid transparent",
              background: "transparent",
              color: activeTab === "photos" ? "#fbbf24" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            <ImageIcon className="w-4 h-4" /> {t("planMaterials", "tabPhotos", "Zdjęcia materiałów")} (
            {allItems.filter((it) => it.photo_url || it.pinPhoto).length})
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
          {activeTab === "text" && (
            <>
              {/* Template selection & Options bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "#94a3b8" }}>
                    {t("planMaterials", "musterLabel", "Muster:")}
                  </span>
                  <select
                    value={selectedMuster}
                    onChange={(e: any) => setSelectedMuster(e.target.value)}
                    style={{
                      background: "#0f172a",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      color: "#f8fafc",
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "5px 10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="standard">{t("planMaterials", "musterStandard", "Standard (Guten Tag, hiermit möchte ich...)")}</option>
                    <option value="project">{t("planMaterials", "musterProject", "Mit Projekt & Plan Details")}</option>
                    <option value="whatsapp">{t("planMaterials", "musterWhatsApp", "WhatsApp Kompakt")}</option>
                    <option value="custom">{t("planMaterials", "musterCustom", "Własny tekst (Edycja ręczna)")}</option>
                  </select>
                </div>

                {/* Include Photos Toggle */}
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: includePhotos ? "#fbbf24" : "#cbd5e1",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includePhotos}
                    onChange={(e) => setIncludePhotos(e.target.checked)}
                    style={{ accentColor: "#f59e0b", width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span>{t("planMaterials", "includePhotosCheckbox", "Dołącz zdjęcia (mit Fotos)")}</span>
                </label>
              </div>

              {/* Message Preview Box */}
              <div style={{ position: "relative" }}>
                <textarea
                  value={selectedMuster === "custom" ? customText : generatedText}
                  onChange={(e) => {
                    setSelectedMuster("custom");
                    setCustomText(e.target.value);
                  }}
                  rows={12}
                  style={{
                    width: "100%",
                    background: "#0f172a",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "12px",
                    padding: "14px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: "12.5px",
                    lineHeight: "1.55",
                    color: "#f1f5f9",
                    resize: "vertical",
                    outline: "none",
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
                  }}
                  placeholder="Wpisz lub dostosuj treść wiadomości..."
                />
              </div>
            </>
          )}

          {activeTab === "items" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 140px",
                  padding: "8px 12px",
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "#94a3b8",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <span>{t("planMaterials", "materialNameLabel", "Nazwa materiału")}</span>
                <span style={{ textAlign: "right" }}>{t("planMaterials", "quantityLabel", "Ilość")}</span>
                <span style={{ textAlign: "right" }}>{t("planMaterials", "position", "Lokalizacja")}</span>
              </div>
              {aggregatedItems.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 140px",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 700, color: "#f8fafc" }}>{it.name}</span>
                    {it.article_number && (
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>Art.-Nr.: {it.article_number}</span>
                    )}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 800, color: "#fbbf24" }}>
                    {it.quantity} {it.unit}
                  </div>
                  <div style={{ textAlign: "right", fontSize: "11px", color: "#cbd5e1" }}>
                    {it.locations.length > 0 ? it.locations.join(", ") : "Plan"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "photos" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
              {allItems
                .filter((it) => it.photo_url || it.pinPhoto)
                .map((it, idx) => {
                  const photo = it.photo_url || it.pinPhoto;
                  return (
                    <div
                      key={idx}
                      style={{
                        borderRadius: "12px",
                        overflow: "hidden",
                        background: "rgba(15, 23, 42, 0.7)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <img
                        src={photo!}
                        alt={it.name}
                        style={{ width: "100%", height: "120px", objectFit: "cover" }}
                      />
                      <div style={{ padding: "8px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#f8fafc" }}>{it.name}</div>
                        <div style={{ fontSize: "11px", color: "#fbbf24", fontWeight: 800 }}>
                          {it.quantity} {it.unit}
                        </div>
                      </div>
                    </div>
                  );
                })}
              {allItems.filter((it) => it.photo_url || it.pinPhoto).length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  {t("planMaterials", "noMaterialsOnPlan", "Brak dołączonych zdjęć materiałów w tych punktach.")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            background: "rgba(15, 23, 42, 0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handleWhatsApp}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                background: "#25D366",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(37, 211, 102, 0.3)",
              }}
              title="WhatsApp"
            >
              <MessageSquare className="w-4 h-4" /> {t("planMaterials", "whatsAppBtn", "WhatsApp")}
            </button>
            <button
              type="button"
              onClick={handleEmail}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                background: "#0284c7",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.3)",
              }}
              title="E-Mail"
            >
              <Mail className="w-4 h-4" /> {t("planMaterials", "emailBtn", "E-Mail")}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.08)",
                color: "#cbd5e1",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid rgba(255,255,255,0.12)",
                cursor: "pointer",
              }}
              title="Pobierz .txt"
            >
              <Download className="w-4 h-4" /> {t("planMaterials", "downloadTxtBtn", "Plik .txt")}
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 18px",
              borderRadius: "10px",
              background: copied ? "#10b981" : "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "13px",
              border: "none",
              cursor: "pointer",
              boxShadow: copied ? "0 0 14px rgba(16, 185, 129, 0.5)" : "0 2px 10px rgba(245, 158, 11, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> {t("planMaterials", "copiedToast", "Skopiowano do schowka!")}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> {t("planMaterials", "copyMessageBtn", "Kopiuj jako wiadomość")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
