"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Camera,
  Trash2,
  Clock,
  RefreshCw,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Building,
  MapPin,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { getToken } from "@/lib/apiClient";
import { MangelStatus, MaengelanzeigeItem } from "@/types/maengelanzeige";

interface AddMangelModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  projectId: string;
  nextItemNumber: string;
  onCreated: (newItem: MaengelanzeigeItem) => void;
  isAdmin?: boolean;
}

const STATUS_OPTIONS: Array<{ value: MangelStatus; label: string; activeBg: string; icon: any }> = [
  { value: "OPEN", label: "Offen", activeBg: "bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/60 font-bold", icon: Clock },
  { value: "IN_PROGRESS", label: "In Bearbeitung", activeBg: "bg-blue-500/20 text-blue-300 ring-2 ring-blue-500/60 font-bold", icon: RefreshCw },
  { value: "ZU_KLAEREN", label: "Zu klären", activeBg: "bg-purple-500/20 text-purple-300 ring-2 ring-purple-500/60 font-bold", icon: HelpCircle },
  { value: "DONE", label: "Erledigt", activeBg: "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/60 font-bold", icon: CheckCircle2 },
  { value: "NOT_RELEVANT", label: "Nicht relevant", activeBg: "bg-slate-500/20 text-slate-300 ring-2 ring-slate-500/60 font-bold", icon: AlertCircle },
];

const COMMON_TRADES = [
  "Elektro",
  "Trockenbau",
  "Lüftung / Klima",
  "Sanitär / Heizung",
  "Brandschutz",
  "Maler",
  "Bodenbelag",
  "Rohbau",
  "Schreiner / Türen",
];

interface PendingPhoto {
  id: string;
  dataUrl: string;
  fileName: string;
  caption: string;
}

export function AddMangelModal({
  isOpen,
  onClose,
  documentId,
  projectId,
  nextItemNumber,
  onCreated,
  isAdmin = true,
}: AddMangelModalProps) {
  const [itemNumber, setItemNumber] = useState<string>(nextItemNumber || "1");
  const [originalText, setOriginalText] = useState<string>("");
  const [tradeOrCompany, setTradeOrCompany] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [status, setStatus] = useState<MangelStatus>("OPEN");
  const [ourDocumentation, setOurDocumentation] = useState<string>("");

  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Compress & resize image to max 1200px for responsive upload
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setPendingPhotos((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}-${Math.random()}`,
            dataUrl: compressed,
            fileName: file.name,
            caption: "",
          },
        ]);
      } catch (err) {
        console.error("Error compressing image:", err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemovePendingPhoto = (id: string) => {
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdatePhotoCaption = (id: string, caption: string) => {
    setPendingPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, caption } : p))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalText.trim()) {
      setError("Bitte geben Sie eine Beschreibung für den Mangel ein.");
      return;
    }
    if (!itemNumber.trim()) {
      setError("Bitte geben Sie eine Punkt-Nummer ein.");
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgressText("Erstelle Mangel...");

    try {
      const token = await getToken();

      // 1. Create Mangel Item in DB
      const itemRes = await fetch("/api/maengelanzeige/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_id: documentId,
          project_id: projectId,
          item_number: itemNumber.trim(),
          original_text: originalText.trim(),
          trade_or_company: tradeOrCompany.trim() || null,
          location: location.trim() || null,
          status,
          our_documentation: ourDocumentation.trim() || null,
          is_selected: true,
        }),
      });

      const itemJson = await itemRes.json();
      if (!itemRes.ok || !itemJson.ok) {
        throw new Error(itemJson.error?.message || "Fehler beim Erstellen des Mangels");
      }

      const createdItem = itemJson.data;
      const uploadedPhotos: any[] = [];

      // 2. Upload attached Vorher-Fotos
      if (pendingPhotos.length > 0) {
        for (let i = 0; i < pendingPhotos.length; i++) {
          const photo = pendingPhotos[i];
          setUploadProgressText(`Lade Foto ${i + 1} von ${pendingPhotos.length} hoch...`);

          const photoRes = await fetch("/api/maengelanzeige/photos", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              itemId: createdItem.id,
              imageBase64: photo.dataUrl,
              fileName: photo.fileName,
              caption: photo.caption || undefined,
              photoType: "BEFORE",
            }),
          });

          const photoJson = await photoRes.json();
          if (photoRes.ok && photoJson.ok) {
            uploadedPhotos.push(photoJson.data);
          }
        }
      }

      const finalItem: MaengelanzeigeItem = {
        ...createdItem,
        photos: uploadedPhotos,
      };

      onCreated(finalItem);
      onClose();
    } catch (err: any) {
      setError(err.message || "Fehler beim Speichern");
    } finally {
      setLoading(false);
      setUploadProgressText("");
    }
  };

  const statusOptionsToDisplay = STATUS_OPTIONS.filter(
    (opt) => isAdmin || opt.value !== "NOT_RELEVANT"
  );

  return (
    <div className="fixed inset-0 z-[100020] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-ui-card border border-ui-border rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ui-accent/20 border border-ui-accent/40 flex items-center justify-center text-ui-accent">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-ui-text uppercase tracking-wide">
                Neuen Mangel hinzufügen
              </h2>
              <p className="text-xs text-ui-muted font-medium">
                Punkt manuell zur Liste hinzufügen inklusive Vorher-Fotos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-ui-muted hover:text-ui-text hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-grow">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-bold text-red-400">
              {error}
            </div>
          )}

          {/* Top Row: Item Number & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ui-text flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-ui-accent" />
                <span>Punkt-Nummer *</span>
              </label>
              <input
                type="text"
                required
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                placeholder="z.B. 1, 2.1..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm font-black text-ui-text focus:outline-none focus:border-ui-accent transition-colors"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-ui-text block">
                Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {statusOptionsToDisplay.map((opt) => {
                  const Icon = opt.icon;
                  const active = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                        active
                          ? `${opt.activeBg} shadow-sm`
                          : "bg-ui-bg border-ui-border text-ui-muted hover:text-ui-text hover:bg-white/5"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Description Text */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-ui-text flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-ui-accent" />
              <span>Mangelbeschreibung / Text *</span>
            </label>
            <textarea
              required
              rows={3}
              autoFocus
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              placeholder="Genaue Beschreibung des Mangels / der festgestellten Abweichung..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Meta: Gewerk / Firma & Ort */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ui-text flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-ui-accent" />
                <span>Gewerk / Firma</span>
              </label>
              <input
                type="text"
                value={tradeOrCompany}
                onChange={(e) => setTradeOrCompany(e.target.value)}
                placeholder="z.B. Elektro, Trockenbau..."
                className="w-full px-3.5 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs font-bold text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent transition-colors"
              />
              {/* Quick Suggestion Chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                {COMMON_TRADES.slice(0, 4).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTradeOrCompany(t)}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-ui-muted hover:text-ui-text border border-ui-border/60 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ui-text flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-ui-accent" />
                <span>Ort / Raum / Geschoss</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="z.B. EG - Technikraum 0.12..."
                className="w-full px-3.5 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs font-bold text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent transition-colors"
              />
            </div>
          </div>

          {/* Bauleitung Documentation */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Bauleitung / Admin Kommentar (optional)</span>
            </label>
            <textarea
              rows={2}
              value={ourDocumentation}
              onChange={(e) => setOurDocumentation(e.target.value)}
              placeholder="Frist, Anweisung oder Vorgabe für den Nachunternehmer..."
              className="w-full px-3.5 py-2 rounded-xl bg-amber-500/[0.04] border border-amber-500/30 text-xs text-amber-200 placeholder:text-amber-500/40 focus:outline-none focus:border-amber-400 transition-colors resize-none"
            />
          </div>

          {/* Vorher-Fotos Upload */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-ui-border space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-ui-text flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-400" />
                <span>📸 Vorher-Fotos (Foto vor der Mängelbeseitigung)</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-xs transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Fotos auswählen</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFilesSelected}
            />

            {pendingPhotos.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-2xl border-2 border-dashed border-ui-border/80 hover:border-blue-500/60 bg-ui-bg/50 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors group"
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-ui-text">
                    Klicken zum Hochladen von Vorher-Fotos
                  </p>
                  <p className="text-[10px] text-ui-muted">
                    Mehrere Fotos oder Kamera-Aufnahmen möglich
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                {pendingPhotos.map((p, idx) => (
                  <div
                    key={p.id}
                    className="relative rounded-2xl border border-ui-border bg-ui-bg overflow-hidden flex flex-col shadow-sm group"
                  >
                    <div className="relative h-28 bg-black/60 flex items-center justify-center overflow-hidden">
                      <img
                        src={p.dataUrl}
                        alt="Foto Vorschau"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase text-white bg-blue-600 shadow">
                        Vorher #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePendingPhoto(p.id)}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/80 hover:bg-red-600 text-white transition-colors"
                        title="Foto entfernen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-2 bg-ui-card border-t border-ui-border">
                      <input
                        type="text"
                        placeholder="Bildunterschrift (optional)..."
                        value={p.caption}
                        onChange={(e) => handleUpdatePhotoCaption(p.id, e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-ui-bg border border-ui-border text-[11px] text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-ui-accent"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-ui-border flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading || !originalText.trim() || !itemNumber.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs tracking-wide transition-all shadow-lg shadow-ui-accent/20 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadProgressText || "Wird gespeichert..."}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Mangel hinzufügen</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddMangelModal;
