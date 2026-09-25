"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Camera,
  Trash2,
  Check,
  Edit2,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  MapPin,
  ShieldCheck,
  UserCheck,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
} from "lucide-react";
import { MaengelanzeigeItem, MaengelanzeigePhoto, MangelStatus, PhotoType } from "@/types/maengelanzeige";
import { getToken } from "@/lib/apiClient";
import PhotoLightbox from "@/components/PhotoLightbox";

interface MangelEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MaengelanzeigeItem | null;
  onSave: (updatedItem: MaengelanzeigeItem) => void;
  onDelete?: (itemId: string) => void;
  isAdmin?: boolean;
  currentUserId?: string | null;
}

const STATUS_OPTIONS: Array<{ value: MangelStatus; label: string; color: string; activeBg: string; icon: any }> = [
  { value: "OPEN", label: "Offen", color: "text-amber-400 border-amber-500/40", activeBg: "bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/60 font-bold", icon: Clock },
  { value: "IN_PROGRESS", label: "In Bearbeitung", color: "text-blue-400 border-blue-500/40", activeBg: "bg-blue-500/20 text-blue-300 ring-2 ring-blue-500/60 font-bold", icon: RefreshCw },
  { value: "ZU_KLAEREN", label: "Zu klären", color: "text-purple-400 border-purple-500/40", activeBg: "bg-purple-500/20 text-purple-300 ring-2 ring-purple-500/60 font-bold", icon: HelpCircle },
  { value: "DONE", label: "Erledigt", color: "text-emerald-400 border-emerald-500/40", activeBg: "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/60 font-bold", icon: CheckCircle2 },
  { value: "NOT_RELEVANT", label: "Nicht relevant", color: "text-slate-400 border-slate-500/40", activeBg: "bg-slate-500/20 text-slate-300 ring-2 ring-slate-500/60 font-bold", icon: AlertCircle },
];

export function MangelEditModal({
  isOpen,
  onClose,
  item,
  onSave,
  onDelete,
  isAdmin = true,
  currentUserId,
}: MangelEditModalProps) {
  if (!isOpen || !item) return null;

  const [deletingMangel, setDeletingMangel] = useState(false);

  // 1. Status
  const [status, setStatus] = useState<MangelStatus>(item.status || "OPEN");

  // 2. Metadata / Information
  const [tradeOrCompany, setTradeOrCompany] = useState(item.trade_or_company || "");
  const [location, setLocation] = useState(item.location || "");

  // 3. Documentation (Bauleitung vs Mitarbeiter)
  const [ourDocumentation, setOurDocumentation] = useState(item.our_documentation || "");
  const [userDocumentation, setUserDocumentation] = useState(item.user_documentation || "");

  // 4. Photos
  const [photos, setPhotos] = useState<MaengelanzeigePhoto[]>(item.photos || []);
  const [showPhotoChoice, setShowPhotoChoice] = useState(false);
  const [uploadPhotoType, setUploadPhotoType] = useState<PhotoType>("BEFORE");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // 5. Advanced / Export Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exportIncludeBeforePhotos, setExportIncludeBeforePhotos] = useState<boolean>(
    item.export_include_before_photos ?? true
  );
  const [exportIncludeAfterPhotos, setExportIncludeAfterPhotos] = useState<boolean>(
    item.export_include_after_photos ?? true
  );
  const [exportIncludeAdminDoc, setExportIncludeAdminDoc] = useState<boolean>(
    item.export_include_admin_doc ?? true
  );
  const [exportIncludeUserDoc, setExportIncludeUserDoc] = useState<boolean>(
    item.export_include_user_doc ?? true
  );
  const [isSelected, setIsSelected] = useState<boolean>(item.is_selected ?? true);

  // AI & Lightbox state
  const [saving, setSaving] = useState(false);
  const [analyzingPhotoId, setAnalyzingPhotoId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({});
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [tempCaption, setTempCaption] = useState("");
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string | null;
    description?: string | null;
    author?: string | null;
    createdAt?: string | null;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUploadTypeRef = useRef<PhotoType>("BEFORE");

  useEffect(() => {
    if (item) {
      setStatus(item.status || "OPEN");
      setTradeOrCompany(item.trade_or_company || "");
      setLocation(item.location || "");
      setOurDocumentation(item.our_documentation || "");
      setUserDocumentation(item.user_documentation || "");
      setPhotos(item.photos || []);
      setExportIncludeBeforePhotos(item.export_include_before_photos ?? true);
      setExportIncludeAfterPhotos(item.export_include_after_photos ?? true);
      setExportIncludeAdminDoc(item.export_include_admin_doc ?? true);
      setExportIncludeUserDoc(item.export_include_user_doc ?? true);
      setIsSelected(item.is_selected ?? true);
      setShowPhotoChoice(false);
      setAiSuggestions({});
      setEditingCaptionId(null);
    }
  }, [item]);

  // Save all changes
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const payload: Record<string, any> = {
        id: item.id,
        user_documentation: userDocumentation,
      };

      if (isAdmin) {
        payload.status = status;
        payload.trade_or_company = tradeOrCompany;
        payload.location = location;
        payload.our_documentation = ourDocumentation;
        payload.export_include_before_photos = exportIncludeBeforePhotos;
        payload.export_include_after_photos = exportIncludeAfterPhotos;
        payload.export_include_admin_doc = exportIncludeAdminDoc;
        payload.export_include_user_doc = exportIncludeUserDoc;
        payload.is_selected = isSelected;
      }

      const res = await fetch("/api/maengelanzeige/items", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.ok && json.data) {
        onSave({
          ...json.data,
          photos,
          export_include_before_photos: exportIncludeBeforePhotos,
          export_include_after_photos: exportIncludeAfterPhotos,
          export_include_admin_doc: exportIncludeAdminDoc,
          export_include_user_doc: exportIncludeUserDoc,
          is_selected: isSelected,
        });
        onClose();
      } else {
        alert(json.error?.message || "Fehler beim Speichern");
      }
    } catch (err: any) {
      alert(err.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  // Delete entire Mangel item
  const handleDeleteMangel = async () => {
    if (!isAdmin) {
      alert("Nur Admins können Mängel löschen.");
      return;
    }

    if (!confirm(`Möchten Sie Mangel ${item.item_number} und alle zugehörigen Fotos wirklich unwiderruflich löschen?`)) {
      return;
    }

    setDeletingMangel(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/maengelanzeige/items?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || "Fehler beim Löschen");
      }

      if (onDelete) {
        onDelete(item.id);
      }
      onClose();
    } catch (err: any) {
      alert("Fehler beim Löschen des Mangels: " + (err.message || String(err)));
    } finally {
      setDeletingMangel(false);
    }
  };

  // Upload trigger with specific type
  const triggerUpload = (type: PhotoType) => {
    currentUploadTypeRef.current = type;
    setUploadPhotoType(type);
    setShowPhotoChoice(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    try {
      const token = await getToken();
      let currentPhotos = [...photos];
      const activeType = currentUploadTypeRef.current || uploadPhotoType || "BEFORE";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();

        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });

        reader.readAsDataURL(file);
        const base64 = await base64Promise;

        const res = await fetch("/api/maengelanzeige/photos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            itemId: item.id,
            imageBase64: base64,
            fileName: file.name,
            photoType: activeType,
          }),
        });

        const json = await res.json();
        if (json.ok && json.data) {
          currentPhotos = [...currentPhotos, json.data];
          setPhotos(currentPhotos);
          onSave({ ...item, is_selected: true, photos: currentPhotos });
        }
      }
    } catch (err: any) {
      alert("Fehler beim Hochladen der Fotos: " + err.message);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Set photo type (Vorher <-> Nachher)
  const handleSetPhotoType = async (photo: MaengelanzeigePhoto, newType: PhotoType) => {
    try {
      const token = await getToken();
      await fetch("/api/maengelanzeige/photos", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: photo.id,
          photo_type: newType,
        }),
      });

      const updated = photos.map((p) => (p.id === photo.id ? { ...p, photo_type: newType } : p));
      setPhotos(updated);
      onSave({ ...item, photos: updated });
    } catch (err: any) {
      alert("Fehler beim Ändern des Fototyps: " + err.message);
    }
  };

  // Delete photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Möchten Sie dieses Foto wirklich löschen?")) return;

    try {
      const token = await getToken();
      const res = await fetch(`/api/maengelanzeige/photos?id=${encodeURIComponent(photoId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (json.ok) {
        const updated = photos.filter((p) => p.id !== photoId);
        setPhotos(updated);
        onSave({ ...item, photos: updated });
      } else {
        alert(json.error?.message || "Fehler beim Löschen des Fotos");
      }
    } catch (err: any) {
      alert("Fehler beim Löschen des Fotos: " + err.message);
    }
  };

  // AI Description Generator
  const handleAnalyzePhoto = async (photo: MaengelanzeigePhoto) => {
    setAnalyzingPhotoId(photo.id);
    try {
      const token = await getToken();
      const res = await fetch("/api/maengelanzeige/analyze-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          photoUrl: photo.url,
          originalMangelText: item.original_text,
          itemNumber: item.item_number,
        }),
      });

      const json = await res.json();
      if (json.ok && json.data?.caption) {
        setAiSuggestions((prev) => ({
          ...prev,
          [photo.id]: json.data.caption,
        }));
      } else {
        alert(json.error?.message || "Keine Bildanalyse möglich.");
      }
    } catch (err: any) {
      alert("Fehler bei AI Analyse: " + err.message);
    } finally {
      setAnalyzingPhotoId(null);
    }
  };

  const handleAcceptAiSuggestion = async (photoId: string) => {
    const suggestion = aiSuggestions[photoId];
    if (!suggestion) return;

    try {
      const token = await getToken();
      await fetch("/api/maengelanzeige/photos", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: photoId,
          caption: suggestion,
        }),
      });

      const updatedPhotos = photos.map((p) => (p.id === photoId ? { ...p, caption: suggestion } : p));
      setPhotos(updatedPhotos);
      onSave({ ...item, photos: updatedPhotos });

      setAiSuggestions((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
    } catch (err: any) {
      alert("Fehler beim Übernehmen des Vorschlags: " + err.message);
    }
  };

  const handleSaveCaption = async (photoId: string) => {
    try {
      const token = await getToken();
      await fetch("/api/maengelanzeige/photos", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: photoId,
          caption: tempCaption,
        }),
      });

      const updatedPhotos = photos.map((p) => (p.id === photoId ? { ...p, caption: tempCaption } : p));
      setPhotos(updatedPhotos);
      onSave({ ...item, photos: updatedPhotos });
      setEditingCaptionId(null);
      setTempCaption("");
    } catch (err: any) {
      alert("Fehler beim Speichern der Bildunterschrift: " + err.message);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100010] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-ui-card border border-ui-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-ui-border flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ui-accent/20 border border-ui-accent/40 flex items-center justify-center text-ui-accent font-black text-base">
                {item.item_number}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-ui-text tracking-wide flex items-center gap-2">
                  Mangel {item.item_number}
                  <span className="text-xs text-ui-muted font-normal">
                    (Seite {item.page_number})
                  </span>
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {isAdmin ? (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                      Bauleitung / Admin
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                      Mitarbeiter
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-ui-muted hover:text-ui-text hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body: 4 Clean Sections */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-grow">
            {/* ─────────────────────────────────────────────────────────────
                SEKTION 1: STATUS
            ────────────────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-ui-muted flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-ui-accent" />
                  1. Status
                </label>
                {!isAdmin && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                    🔒 Status wird von der Bauleitung / vom Admin festgelegt
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                        active
                          ? `${opt.activeBg} shadow-md`
                          : "bg-white/[0.02] border-ui-border text-ui-muted hover:text-ui-text hover:bg-white/5 cursor-pointer"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                SEKTION 2: INFORMATIONEN
            ────────────────────────────────────────────────────────────── */}
            <div className="space-y-3 p-4 rounded-2xl bg-white/[0.02] border border-ui-border">
              <label className="text-xs font-black uppercase tracking-wider text-ui-muted flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-ui-accent" />
                2. Informationen
              </label>

              {/* Original defect text */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-ui-muted uppercase">
                  Originaler Mangel:
                </span>
                <div className="p-3 rounded-xl bg-ui-bg border border-ui-border text-xs sm:text-sm text-ui-text font-medium leading-relaxed select-text">
                  {item.original_text || "–"}
                </div>
              </div>

              {/* Gewerk & Ort inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-ui-muted uppercase flex items-center gap-1.5 mb-1">
                    <Building2 className="w-3 h-3 text-ui-accent" />
                    Gewerk / Firma
                  </label>
                  {isAdmin ? (
                    <input
                      type="text"
                      value={tradeOrCompany}
                      onChange={(e) => setTradeOrCompany(e.target.value)}
                      placeholder="z.B. Elektro / Fa. Müller"
                      className="w-full px-3 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs font-bold text-ui-text focus:outline-none focus:border-ui-accent transition-colors"
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs font-bold text-ui-text">
                      {tradeOrCompany || "–"}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-ui-muted uppercase flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3 h-3 text-ui-accent" />
                    Ort / Raum
                  </label>
                  {isAdmin ? (
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="z.B. 1. OG Flur Nord"
                      className="w-full px-3 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs font-bold text-ui-text focus:outline-none focus:border-ui-accent transition-colors"
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-ui-bg border border-ui-border text-xs font-bold text-ui-text">
                      {location || "–"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                SEKTION 3: DOKUMENTATION
            ────────────────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-wider text-ui-muted flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                3. Dokumentation
              </label>

              {/* Bauleitung / Admin (Yellow) */}
              <div className="p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    📋 Bauleitung
                  </label>
                  {!isAdmin && (
                    <span className="text-[10px] font-bold text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Nur Leserechte
                    </span>
                  )}
                </div>

                {isAdmin ? (
                  <textarea
                    value={ourDocumentation}
                    onChange={(e) => setOurDocumentation(e.target.value)}
                    placeholder="Vorgaben oder Stellungnahme der Bauleitung eintragen..."
                    rows={2}
                    className="w-full p-3 rounded-xl bg-ui-bg border border-amber-500/30 text-xs sm:text-sm text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-amber-400 transition-colors resize-y leading-relaxed font-sans"
                  />
                ) : ourDocumentation ? (
                  <div className="p-3 rounded-xl bg-ui-bg border border-amber-500/20 text-xs sm:text-sm text-ui-text whitespace-pre-wrap leading-relaxed">
                    {ourDocumentation}
                  </div>
                ) : (
                  <p className="text-xs text-ui-muted italic">Keine Vorgaben der Bauleitung eingetragen.</p>
                )}
              </div>

              {/* Meine Rückmeldung / Mitarbeiter (Green) */}
              <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    ✍ {isAdmin ? "Mitarbeiter-Rückmeldung" : "Meine Rückmeldung (Mitarbeiter)"}
                  </label>
                  {userDocumentation ? (
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/40">
                      ✓ Rückmeldung vorhanden
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Ausgeführte Arbeiten
                    </span>
                  )}
                </div>
                <textarea
                  value={userDocumentation}
                  onChange={(e) => setUserDocumentation(e.target.value)}
                  placeholder="Beschreiben Sie hier die ausgeführten Arbeiten (z.B. Kabel neu befestigt, Schrank gereinigt, geprüft...)"
                  rows={2}
                  className="w-full p-3 rounded-xl bg-ui-bg border border-emerald-500/30 text-xs sm:text-sm text-ui-text placeholder:text-ui-muted/50 focus:outline-none focus:border-emerald-400 transition-colors resize-y leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                SEKTION 4: FOTOS (VORHER & NACHHER)
            ────────────────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-ui-border/40">
                <label className="text-xs font-black uppercase tracking-wider text-ui-text flex items-center gap-2">
                  <Camera className="w-4 h-4 text-ui-accent" />
                  4. Fotos ({photos.length})
                </label>

                {/* Upload Button */}
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {!showPhotoChoice ? (
                    <button
                      type="button"
                      onClick={() => setShowPhotoChoice(true)}
                      disabled={uploadingPhoto}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ui-accent text-black font-black text-xs hover:scale-105 active:scale-95 transition-all shadow-md shadow-ui-accent/20 disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {uploadingPhoto ? "Lade hoch..." : "+ Foto hinzufügen"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 p-1 bg-ui-bg rounded-xl border border-ui-border shadow-xl animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={() => triggerUpload("BEFORE")}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition-all shadow"
                      >
                        📸 Vorher
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerUpload("AFTER")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all shadow"
                      >
                        📸 Nachher
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPhotoChoice(false)}
                        className="p-1.5 rounded-lg text-ui-muted hover:text-ui-text hover:bg-white/5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {photos.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-ui-border/60 text-center bg-white/[0.01]">
                  <ImageIcon className="w-8 h-8 text-ui-muted mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-ui-muted font-medium">
                    Noch keine Fotos hinzugefügt.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {photos.map((photo) => {
                    const isAnalyzing = analyzingPhotoId === photo.id;
                    const suggestion = aiSuggestions[photo.id];
                    const isEditing = editingCaptionId === photo.id;
                    const isBefore =
                      photo.photo_type === "BEFORE" ||
                      (photo.photo_type as any) === "VORHER" ||
                      photo.caption?.startsWith("[VORHER]");
                    const canDelete =
                      isAdmin || (photo.uploaded_by && photo.uploaded_by === currentUserId);

                    return (
                      <div
                        key={photo.id}
                        className="group relative rounded-xl border border-ui-border bg-ui-bg overflow-hidden flex flex-col shadow-sm"
                      >
                        {/* Image Preview */}
                        <div
                          className="relative h-40 bg-black/60 cursor-pointer overflow-hidden flex items-center justify-center"
                          onClick={() =>
                            setLightboxPhoto({
                              url: photo.url,
                              description: photo.caption,
                              author: photo.uploaded_by,
                              createdAt: photo.created_at,
                            })
                          }
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || "Mangel Foto"}
                            className="w-full h-full object-contain transition-transform group-hover:scale-105 duration-300"
                          />

                          {/* Direct Vorher / Nachher Toggle on card */}
                          <div
                            className="absolute top-2 left-2 z-10 flex items-center bg-black/80 backdrop-blur-md rounded-lg p-0.5 border border-white/20 shadow-lg"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetPhotoType(photo, "BEFORE");
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${
                                isBefore
                                  ? "bg-blue-600 text-white shadow-md"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Vorher
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetPhotoType(photo, "AFTER");
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${
                                !isBefore
                                  ? "bg-emerald-600 text-white shadow-md"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Nachher
                            </button>
                          </div>

                          {/* Actions on Photo */}
                          <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                            {canDelete && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePhoto(photo.id);
                                }}
                                className="p-1.5 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition-colors shadow"
                                title="Foto löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Caption & AI Section */}
                        <div className="p-2.5 flex flex-col flex-grow justify-between gap-2">
                          {isEditing ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={tempCaption}
                                onChange={(e) => setTempCaption(e.target.value)}
                                className="w-full p-2 text-xs rounded-lg bg-white/5 border border-ui-accent text-ui-text resize-none font-sans"
                                rows={2}
                              />
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingCaptionId(null)}
                                  className="px-2 py-0.5 rounded text-[11px] text-ui-muted hover:bg-white/5"
                                >
                                  Abbrechen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveCaption(photo.id)}
                                  className="px-2 py-0.5 rounded text-[11px] bg-ui-accent text-black font-bold"
                                >
                                  Speichern
                                </button>
                              </div>
                            </div>
                          ) : suggestion ? (
                            /* AI Suggestion Box */
                            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 space-y-1.5">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-400">
                                <Sparkles className="w-3 h-3" />
                                KI-Vorschlag:
                              </div>
                              <p className="text-xs text-ui-text leading-relaxed">{suggestion}</p>
                              <div className="flex items-center justify-end gap-1 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAiSuggestions((prev) => {
                                      const next = { ...prev };
                                      delete next[photo.id];
                                      return next;
                                    });
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:bg-white/5"
                                >
                                  Verwerfen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAcceptAiSuggestion(photo.id)}
                                  className="px-2 py-0.5 rounded text-[10px] bg-ui-accent text-black font-bold"
                                >
                                  Übernehmen
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Regular Caption */
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-xs text-ui-text line-clamp-2 leading-relaxed">
                                {photo.caption
                                  ? photo.caption.replace(/^\[(VORHER|NACHHER)\]\s*/, "")
                                  : "Keine Bildunterschrift"}
                              </p>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleAnalyzePhoto(photo)}
                                  disabled={isAnalyzing}
                                  className="p-1 rounded-lg hover:bg-indigo-500/20 text-indigo-400 transition-colors"
                                  title="Mit KI beschreiben"
                                >
                                  <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTempCaption(
                                      (photo.caption || "").replace(/^\[(VORHER|NACHHER)\]\s*/, "")
                                    );
                                    setEditingCaptionId(photo.id);
                                  }}
                                  className="p-1 rounded-lg hover:bg-white/10 text-ui-muted hover:text-ui-text transition-colors"
                                  title="Unterschrift bearbeiten"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─────────────────────────────────────────────────────────────
                ERWEITERTE OPTIONEN (PDF-EXPORT & BERICHTSEINSTELLUNGEN)
            ────────────────────────────────────────────────────────────── */}
            <div className="border border-ui-border rounded-2xl overflow-hidden bg-white/[0.01]">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-ui-muted hover:text-ui-text transition-colors"
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-ui-accent" />
                  <span>⚙️ Bericht-Einstellungen (PDF-Export)</span>
                </div>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="p-4 border-t border-ui-border space-y-3 bg-ui-bg/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => setIsSelected(e.target.checked)}
                        className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                      />
                      <span className="text-xs font-bold text-ui-text">
                        Im PDF-Bericht anzeigen
                      </span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40">
                      <input
                        type="checkbox"
                        checked={exportIncludeBeforePhotos}
                        onChange={(e) => setExportIncludeBeforePhotos(e.target.checked)}
                        className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                      />
                      <span className="text-xs font-bold text-ui-text">
                        Vorher-Fotos exportieren
                      </span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40">
                      <input
                        type="checkbox"
                        checked={exportIncludeAfterPhotos}
                        onChange={(e) => setExportIncludeAfterPhotos(e.target.checked)}
                        className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                      />
                      <span className="text-xs font-bold text-ui-text">
                        Nachher-Fotos exportieren
                      </span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40">
                      <input
                        type="checkbox"
                        checked={exportIncludeAdminDoc}
                        onChange={(e) => setExportIncludeAdminDoc(e.target.checked)}
                        className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                      />
                      <span className="text-xs font-bold text-ui-text">
                        Bauleitung exportieren
                      </span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-ui-bg border border-ui-border cursor-pointer hover:border-ui-accent/40">
                      <input
                        type="checkbox"
                        checked={exportIncludeUserDoc}
                        onChange={(e) => setExportIncludeUserDoc(e.target.checked)}
                        className="w-4 h-4 rounded text-ui-accent focus:ring-ui-accent cursor-pointer"
                      />
                      <span className="text-xs font-bold text-ui-text">
                        Meine Rückmeldung exportieren
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 sm:p-5 border-t border-ui-border flex items-center justify-between gap-3 bg-white/[0.02]">
            <div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteMangel}
                  disabled={deletingMangel || saving}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-xs transition-colors disabled:opacity-50"
                  title="Diesen Mangel unwiderruflich löschen"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>{deletingMangel ? "Lösche..." : "Mangel löschen"}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={deletingMangel || saving}
                className="px-4 py-2 rounded-xl border border-ui-border text-xs font-bold text-ui-muted hover:text-ui-text hover:bg-white/5 transition-all"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deletingMangel}
                className="px-6 py-2 rounded-xl bg-ui-accent hover:bg-ui-accent/90 text-black font-black text-xs transition-all shadow-lg shadow-ui-accent/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                {saving ? "Speichert..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox for full image preview */}
      {lightboxPhoto && (
        <PhotoLightbox
          url={lightboxPhoto.url}
          description={lightboxPhoto.description}
          author={lightboxPhoto.author}
          createdAt={lightboxPhoto.createdAt}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </>
  );
}

export default MangelEditModal;
